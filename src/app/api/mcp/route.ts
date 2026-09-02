import { NextRequest, NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getMcpConfig, buildMcpServer, listEnabledTools } from '@/lib/mcp-server';

/**
 * MCP 端点（Streamable HTTP）。2026-09-02
 *
 * POST /api/mcp   —— JSON-RPC 请求入口，MCP 客户端连这个
 * GET  /api/mcp   —— 未鉴权时返回服务状态摘要，便于人工确认是否已启用
 *
 * ── 为什么做成 Next.js 路由而不是独立进程 ──────────────────
 * `WebStandardStreamableHTTPServerTransport.handleRequest(Request): Promise<Response>`
 * 恰好就是 App Router 的路由签名。好处：
 *   - Next.js 本身就是那个常驻进程，systemd / docker 已经在管它了
 *   - 不必新开端口、写 systemd unit、改 nginx、加容器
 *   - 复用现有 DB 连接池与鉴权体系
 *   - 配置开关真的能生效（Next.js 无权去 start/stop 一个系统进程）
 *
 * ── 安全 ──────────────────────────────────────────────
 * 三道闸，顺序不能换：
 *   1. mcp_enabled 关 → 404（不暴露"这里有个服务只是没开"）
 *   2. 无有效 access_token → 401（没有本地免鉴权后门）
 *   3. 超过限流 → 429
 * 工具集按开关动态注册，写工具/敏感工具关闭时压根不出现在 tools/list。
 */

// 每请求一个 server 实例：MCP Server 持有会话状态，共享会串数据；
// 且 user 上下文必须随请求变。stateless 模式下这样最干净。
export const dynamic = 'force-dynamic';

// ── 限流：进程内滑动窗口 ─────────────────────────────────
// 没用 api_rate_limit_log 表（webhook-migrations 建了但全库无人使用，
// 我不去碰别人的表）。进程内计数对单实例部署足够；
// 将来要多实例再换 memcached。
const rateBuckets = new Map<number, { windowStart: number; count: number }>();
const WINDOW_MS = 60_000;

function checkRate(userId: number, limit: number): { ok: boolean; retryAfter: number } {
  if (limit <= 0) return { ok: true, retryAfter: 0 }; // 0 = 不限制
  const now = Date.now();
  const b = rateBuckets.get(userId);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    rateBuckets.set(userId, { windowStart: now, count: 1 });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.ceil((b.windowStart + WINDOW_MS - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

// Map 会随不同 userId 无限增长，定期清掉过期桶
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) {
    if (now - v.windowStart >= WINDOW_MS * 2) rateBuckets.delete(k);
  }
}, WINDOW_MS).unref?.();

/** 写审计。用 getAsyncDb 而不是 auth.ts 的同步 logAudit —— 后者走 getDb()，MySQL 模式下不可靠。 */
async function audit(
  userId: number,
  username: string,
  action: string,
  detail: string,
  req: NextRequest
) {
  try {
    const db = getAsyncDb();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '';
    await db
      .prepare(
        'INSERT INTO audit_logs (user_id, username, action, detail, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(userId, username, action, detail.slice(0, 2000), ip, (req.headers.get('user-agent') || '').slice(0, 500));
  } catch {
    // 审计失败不该阻断正常调用，但也不静默到一无所知
    console.error('[mcp] 审计写入失败');
  }
}

/** 从 JSON-RPC body 里摘出方法名与工具名，只为审计，失败不影响主流程。 */
function peekRpc(body: unknown): { method: string; tool: string } {
  try {
    const b: any = body;
    const method = typeof b?.method === 'string' ? b.method : '';
    const tool = method === 'tools/call' && typeof b?.params?.name === 'string' ? b.params.name : '';
    return { method, tool };
  } catch {
    return { method: '', tool: '' };
  }
}

export async function POST(req: NextRequest) {
  const cfg = await getMcpConfig();

  // 闸 1：没启用就当这个端点不存在
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: 'MCP 服务未启用。请在「系统配置 → 高级配置 → MCP 服务」中开启。' },
      { status: 404 }
    );
  }

  // 闸 2：强制鉴权。MCP 客户端用 Authorization: Bearer rms_xxx
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        error: '未授权。请在请求头携带 Authorization: Bearer <Access Token>，' +
          'Token 在「个人中心 → API Token」创建。',
      },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="RMS MCP"' } }
    );
  }

  // 闸 3：限流
  const rate = checkRate(user.id, cfg.rateLimit);
  if (!rate.ok) {
    return NextResponse.json(
      { error: `请求过于频繁，每分钟上限 ${cfg.rateLimit} 次。` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
    );
  }

  // 先克隆出 body 做审计 —— Request body 只能读一次，必须在交给 transport 前 clone
  let rpc = { method: '', tool: '' };
  if (cfg.auditLog) {
    try {
      rpc = peekRpc(await req.clone().json());
    } catch {
      /* 非 JSON 或空 body，交给 transport 去报协议错误 */
    }
  }

  try {
    const server = buildMcpServer(user, cfg);
    const transport = new WebStandardStreamableHTTPServerTransport({
      // stateless：不生成 session id。MCP 客户端每次带完整上下文，
      // 避免在多实例/重启后出现"会话不存在"。
      sessionIdGenerator: undefined,
      enableJsonResponse: cfg.transport === 'json',
    });

    await server.connect(transport);
    const res = await transport.handleRequest(req);

    if (cfg.auditLog && rpc.method) {
      // 只记方法与工具名，不记参数内容 —— 参数可能含需求正文，进审计表既冗余也可能泄敏
      await audit(
        user.id,
        user.username,
        'mcp_call',
        rpc.tool ? `${rpc.method} → ${rpc.tool}` : rpc.method,
        req
      );
    }

    return res;
  } catch (e: any) {
    console.error('[mcp] 请求处理失败:', e?.message || e);
    return NextResponse.json(
      { error: `MCP 请求处理失败: ${e?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * GET：状态探测。
 * 故意不要求鉴权，但**只返回开关与工具名**，不含任何业务数据 ——
 * 这样运维可以直接 curl 确认服务是否已启用，而不必先造 token。
 */
export async function GET() {
  const cfg = await getMcpConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      {
        enabled: false,
        hint: 'MCP 服务未启用。系统配置 → 高级配置 → MCP 服务 → 启用 MCP 服务。',
      },
      { status: 404 }
    );
  }
  return NextResponse.json({
    enabled: true,
    protocol: 'MCP Streamable HTTP',
    endpoint: '/api/mcp',
    response_mode: cfg.transport === 'json' ? 'JSON' : 'SSE stream',
    auth: 'Authorization: Bearer <RMS Access Token>',
    write_enabled: cfg.allowWrite,
    sensitive_exposed: cfg.exposeSensitive,
    rate_limit_per_minute: cfg.rateLimit,
    tools: listEnabledTools(cfg),
  });
}
