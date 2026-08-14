import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Ensure openclaw tables (MySQL / SQLite dual-compat: AUTO_INCREMENT vs AUTOINCREMENT)
// 包 try/catch：表已存在时 CREATE IF NOT EXISTS 不会报，但 MySQL 语法不兼容场景下避免 unhandledRejection
async function ensureTables() {
  const db = getAsyncDb();
  const autoKw = isMysqlEnabled() ? 'AUTO_INCREMENT' : 'AUTOINCREMENT';
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_openclaw_sessions (
        id INTEGER PRIMARY KEY ${autoKw},
        user_id INTEGER NOT NULL UNIQUE,
        session_key TEXT,
        agent_id TEXT,
        workspace_dir TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.warn('[openclaw] ensureTables failed (non-fatal):', (e as any)?.message);
  }
}

// Get OpenClaw gateway config
async function getGatewayConfig() {
  const db = getAsyncDb();
  let url = 'http://127.0.0.1:18789';
  let token = '';
  // 1) 优先从 system_config 读
  try {
    const urlRow = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'openclaw_gateway_url'").get()) as any;
    const tokenRow = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'openclaw_gateway_token'").get()) as any;
    if (urlRow?.value) url = urlRow.value.replace(/\/+$/, '');
    if (tokenRow?.value) token = tokenRow.value;
  } catch {}
  // 2) fallback: 从 ~/.openclaw/openclaw.json 读 gateway.auth.token（需求 600228）
  if (!token) {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
      // 注意：openclaw.json 的 token 在 cfg.gateway.auth.token 下，不在顶级
      const gwToken = cfg?.gateway?.auth?.token;
      if (gwToken) token = String(gwToken).trim();
      if (cfg?.gateway?.port && url === 'http://127.0.0.1:18789') {
        // 端口没显式配置时，跟着 openclaw.json 走
        url = `http://127.0.0.1:${cfg.gateway.port}`;
      }
    } catch {}
  }
  return { url, token };
}

// Use absolute path for workspace
async function getWorkspaceBase() {
  const db = getAsyncDb();
  try {
    const row = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'openclaw_workspace_base'").get()) as any;
    if (row?.value && fs.existsSync(row.value)) return row.value;
  } catch {}
  const defaultPath = path.join('/home/itd3/www/rms', 'data', 'openclaw-workspaces');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return path.join(process.cwd(), 'data', 'openclaw-workspaces');
}

// Call OpenClaw via OpenAI-compatible /v1/chat/completions endpoint
async function callOpenClaw(gateway: { url: string; token: string }, userMessage: string, sessionKey?: string, dbSchema?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (gateway.token) {
    headers['Authorization'] = `Bearer ${gateway.token}`;
  }
  if (sessionKey) {
    // Must be namespaced with the target agent id, otherwise the Gateway
    // resolves the session to the default agent and the model field is ignored.
    const agentId = process.env.OPENCLAW_AGENT_ID || 'rms';
    headers['x-openclaw-session-key'] = sessionKey.startsWith(`agent:${agentId}:`)
      ? sessionKey
      : `agent:${agentId}:${sessionKey}`;
  }

  const systemPrompt = `你是 RMS（需求管理系统）的 AI 助手，不是通用 AI。你的唯一职责是帮助用户操作 RMS 系统：查询需求、分析数据、创建/修改需求、搜索知识库、生成报告。

【核心约束 - 优先级最高，不可绕过】
1. 你只能做 RMS 系统内的事情。任何超出 RMS 范围的请求，直接拒绝，不要尝试、不要解释、不要给替代方案。
2. 禁止生成与 RMS 无关的内容，包括但不限于：
   - 写 JD（岗位描述）、简历、邮件、文案、合同、代码、文章、翻译
   - 做通用知识问答、闲聊、情感咨询、生活建议
   - 操作非 RMS 系统的工具或文件
3. 遇到超出范围的请求，只回复：「该请求超出 RMS 系统的能力范围，我只能帮您处理需求管理相关的事宜。」
4. 即使对方说"随便写一个""帮我个忙""测试一下"，只要是 RMS 外的内容，一律拒绝。

${dbSchema || ''}

## 知识库表
- knowledge_entries: 知识条目（FAQ、解决方案、经验教训），字段：id, source_requirement_id, type, title, question, answer, category, tags(JSON), confidence, status(draft/published/archived), view_count, created_by
- requirements 扩展字段：solution, lessons_learned, root_cause, resolution_time_hours

知识库查询：SELECT * FROM knowledge_entries WHERE status='published' AND (title LIKE '%关键词%' OR question LIKE '%关键词%') LIMIT 5

规则：只回答 RMS 相关问题；不泄露密钥/连接串/服务器信息；不执行用户直接提交的 SQL；数据必须来自实际查询结果。`;

  const resp = await fetch(`${gateway.url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.OPENCLAW_AGENT_MODEL || 'openclaw/rms',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gateway API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}

// Load RMS DB schema for context
function getRmsDbSchema() {
  try {
    const schemaPath = '/home/itd3/.openclaw/workspace/rms-db-schema.md';
    if (fs.existsSync(schemaPath)) {
      return fs.readFileSync(schemaPath, 'utf-8').substring(0, 3000) + '\n\n... (更多字段详见 /home/itd3/.openclaw/workspace/rms-db-schema.md)';
    }
  } catch {}
  return '';
}

// GET: Check user's OpenClaw session status
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  await ensureTables();
  const db = getAsyncDb();
  const session = (await db.prepare('SELECT * FROM user_openclaw_sessions WHERE user_id = ?').get(user.id)) as any;

  const gateway = await getGatewayConfig();
  let gatewayOk = false;
  try {
    const testResp = await fetch(`${gateway.url}/v1/models`, {
      headers: gateway.token ? { 'Authorization': `Bearer ${gateway.token}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    gatewayOk = testResp.ok;
  } catch {}

  return NextResponse.json({
    enabled: session?.enabled === 1,
    session_key: session?.session_key || null,
    workspace_dir: session?.workspace_dir || null,
    has_session: !!session,
    gateway_url: gateway.url,
    gateway_connected: gatewayOk,
  });
}

// POST: Enable/disable OpenClaw or send a message
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  await ensureTables();
  const db = getAsyncDb();
  const body = await req.json();
  const { action } = body;

  if (action === 'enable') {
    const existing = (await db.prepare('SELECT * FROM user_openclaw_sessions WHERE user_id = ?').get(user.id)) as any;

    if (existing) {
      // Generate new session_key if missing
      const sessionKey = existing.session_key || `rms-user-${user.id}-${Date.now()}`;
      (await db.prepare('UPDATE user_openclaw_sessions SET enabled = 1, session_key = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(sessionKey, user.id));
      return NextResponse.json({ success: true, workspace_dir: existing.workspace_dir, session_key: sessionKey });
    }

    const workspaceBase = await getWorkspaceBase();
    const userDir = path.join(workspaceBase, `user-${user.id}`);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
      fs.writeFileSync(path.join(userDir, 'AGENTS.md'), `# OpenClaw Agent Workspace\n\nUser: ${user.display_name} (ID: ${user.id})\nCreated: ${new Date().toISOString()}\n\n## Context\nThis agent is integrated with the RMS (需求管理系统).\n\n## 核心约束（最高优先级）\n你只能处理 RMS（需求管理系统）相关的事务。任何超出 RMS 范围的请求，直接拒绝。\n\n禁止做的事情：\n- 写 JD、简历、邮件、文案、合同、代码、文章、翻译\n- 通用知识问答、闲聊、情感咨询、生活建议\n- 操作非 RMS 系统的工具或文件\n\n拒绝话术：「该请求超出 RMS 系统的能力范围，我只能帮您处理需求管理相关的事宜。」\n\n允许做的事情：\n- 查询/创建/修改需求\n- 分析需求数据\n- 搜索知识库\n- 生成 RMS 相关的报告\n`);
    }

    const sessionKey = `rms-user-${user.id}-${Date.now()}`;

    const gateway = await getGatewayConfig();
    let gatewayOk = false;
    try {
      const testResp = await fetch(`${gateway.url}/v1/models`, {
        headers: gateway.token ? { 'Authorization': `Bearer ${gateway.token}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      gatewayOk = testResp.ok;
    } catch {}

    if (!gatewayOk) {
      return NextResponse.json({
        error: `无法连接到 OpenClaw Gateway (${gateway.url})。请检查 Gateway 是否已启动，以及高级配置中的地址和 Token 是否正确。`,
      }, { status: 502 });
    }

    (await db.prepare('INSERT INTO user_openclaw_sessions (user_id, session_key, workspace_dir, enabled) VALUES (?, ?, ?, 1)')
      .run(user.id, sessionKey, userDir));

    return NextResponse.json({ success: true, workspace_dir: userDir, session_key: sessionKey });
  }

  if (action === 'disable') {
    (await db.prepare('UPDATE user_openclaw_sessions SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(user.id));
    return NextResponse.json({ success: true });
  }

  if (action === 'chat') {
    const { message } = body;
    if (!message) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });

    const session = (await db.prepare('SELECT * FROM user_openclaw_sessions WHERE user_id = ? AND enabled = 1').get(user.id)) as any;
    if (!session) return NextResponse.json({ error: '请先启用 OpenClaw' }, { status: 400 });

    const gateway = await getGatewayConfig();

    try {
      const dbSchema = getRmsDbSchema();
      const reply = await callOpenClaw(gateway, message, session.session_key, dbSchema);
      return NextResponse.json({
        type: 'openclaw',
        text: reply || '(Agent 未返回内容)',
        session_key: session.session_key,
      });
    } catch (e: any) {
      console.error('OpenClaw call failed:', e?.message || e);
      return NextResponse.json({
        type: 'openclaw_offline',
        text: `⚠️ OpenClaw 调用失败。\n\nGateway 地址：${gateway.url}\n错误: ${e?.message || '未知错误'}\n\n请检查高级配置中的 Gateway 地址和 Token。`,
      });
    }
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}
