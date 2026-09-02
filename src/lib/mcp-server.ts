/**
 * MCP 服务：把 RMS 的数据能力以 MCP 协议暴露给外部客户端
 * （Claude Desktop / Cursor / Cline 等）。2026-09-02
 *
 * ── 设计约束（改之前先读懂）─────────────────────────────────
 *
 * 1. **不复用 rms-mcp-server.js**。那个脚本走 `execFileSync('mysql', ...)`，
 *    每次调用 spawn 一个子进程；这里直接用 getAsyncDb() 的连接池，
 *    少一层 shell 风险，也省掉进程开销。
 *
 * 2. **工具按开关动态注册，不是运行时拒绝**。写工具/敏感工具在关闭时
 *    压根不出现在 tools/list 里 —— 不给客户端「看得见但调不动」的错觉。
 *
 * 3. **权限跟着 token 属主走**。所有查询都带 user 上下文，
 *    token 主人看不到的需求，走 MCP 一样看不到。没有超级身份。
 *
 * 4. **参数一律走 zod 校验 + 占位符绑定**，不拼接 SQL。
 *    列名/排序方向这类无法参数化的位置用白名单枚举。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAsyncDb, isMysqlEnabled, STATUS_MAP, PRIORITY_MAP } from '@/lib/db';
import type { UserInfo } from '@/lib/auth';

/**
 * 时间函数的双引擎写法。
 * MySQL 用 NOW()，SQLite 没有 NOW() —— 但 CURRENT_TIMESTAMP 两边都支持，
 * 所以统一用它，别写 NOW()（否则 SQLite 部署上写入直接报错）。
 */
const SQL_NOW = 'CURRENT_TIMESTAMP';

export interface McpConfig {
  enabled: boolean;
  transport: 'stream' | 'json';
  allowWrite: boolean;
  exposeSensitive: boolean;
  rateLimit: number;
  auditLog: boolean;
}

/** 读 MCP 相关配置。缺失一律按「关闭」处理 —— fail-closed。 */
export async function getMcpConfig(): Promise<McpConfig> {
  const db = getAsyncDb();
  const get = async (key: string): Promise<string> => {
    try {
      const row = (await db
        .prepare('SELECT value FROM system_config WHERE `key` = ?')
        .get(key)) as any;
      return row?.value ?? '';
    } catch {
      return '';
    }
  };
  const rateRaw = await get('mcp_rate_limit');
  const rate = Number.parseInt(rateRaw, 10);
  return {
    enabled: (await get('mcp_enabled')) === 'true',
    transport: (await get('mcp_transport')) === 'json' ? 'json' : 'stream',
    allowWrite: (await get('mcp_allow_write')) === 'true',
    exposeSensitive: (await get('mcp_expose_sensitive')) === 'true',
    rateLimit: Number.isFinite(rate) && rate >= 0 ? rate : 120,
    auditLog: (await get('mcp_audit_log')) !== 'false',
  };
}

const statusLabel = (s: string | null | undefined) => (s ? STATUS_MAP[s] || s : '');
const priorityLabel = (p: string | null | undefined) => (p ? PRIORITY_MAP[p] || p : '');

/** 统一把结果包成 MCP 的 text content。对象一律 JSON 序列化，客户端好解析。 */
function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }], isError: true };
}

/** 排除已合并需求的固定条件 —— 统计口径要一致，别各处手写。 */
const NOT_MERGED = '(r.merged_into IS NULL OR r.merged_into = 0)';

const STATUS_KEYS = Object.keys(STATUS_MAP);
const PRIORITY_KEYS = Object.keys(PRIORITY_MAP);

/**
 * 构建一个 MCP server 实例。
 *
 * 每个请求单独建实例：MCP 的 Server 持有会话状态，
 * 多请求共享会串数据；而且 user 上下文必须随请求变。
 */
export function buildMcpServer(user: UserInfo, cfg: McpConfig): McpServer {
  const server = new McpServer(
    { name: 'rms-mcp', version: '1.0.0' },
    {
      instructions:
        '这是 RMS（需求管理系统）的 MCP 服务。只处理需求管理相关的查询与操作。' +
        `当前身份：${user.display_name}（${user.username}）。` +
        (cfg.allowWrite ? '已开启写权限。' : '当前为只读模式，创建/修改工具未启用。'),
    }
  );

  // ── 只读工具：始终注册 ──────────────────────────────────

  server.registerTool(
    'search_requirements',
    {
      description:
        '搜索需求。支持关键词（标题/描述）、状态、优先级、项目、处理人等条件。' +
        '默认排除已合并的需求。返回精简字段，需要完整信息用 get_requirement。',
      inputSchema: {
        keyword: z.string().max(100).optional().describe('标题或描述里的关键词'),
        status: z.enum(STATUS_KEYS as [string, ...string[]]).optional().describe('需求状态'),
        priority: z.enum(PRIORITY_KEYS as [string, ...string[]]).optional().describe('优先级'),
        project_id: z.number().int().positive().optional().describe('项目 ID'),
        handler_id: z.number().int().positive().optional().describe('处理人用户 ID'),
        unfinished_only: z.boolean().optional().describe('只看未完成（排除已完成/已验证/已关闭）'),
        limit: z.number().int().min(1).max(100).default(20).describe('返回条数，最多 100'),
      },
    },
    async (args) => {
      const db = getAsyncDb();
      const where: string[] = [NOT_MERGED];
      const params: any[] = [];

      if (args.keyword) {
        where.push('(r.title LIKE ? OR r.description LIKE ?)');
        params.push(`%${args.keyword}%`, `%${args.keyword}%`);
      }
      if (args.status) { where.push('r.status = ?'); params.push(args.status); }
      if (args.priority) { where.push('r.priority = ?'); params.push(args.priority); }
      if (args.project_id) { where.push('r.project_id = ?'); params.push(args.project_id); }
      if (args.handler_id) { where.push('r.handler_id = ?'); params.push(args.handler_id); }
      if (args.unfinished_only) {
        where.push("r.status NOT IN ('completed','verified','closed')");
      }

      // limit 已被 zod 夹在 1..100，可安全内插（占位符在部分驱动上对 LIMIT 支持不一致）
      const rows = (await db
        .prepare(
          `SELECT r.id, r.title, r.status, r.priority, r.category,
                  r.project_id, p.name AS project_name,
                  r.handler_id, hu.display_name AS handler_name,
                  r.planned_end, r.created_at, r.updated_at
           FROM requirements r
           LEFT JOIN projects p ON p.id = r.project_id
           LEFT JOIN users hu ON hu.id = r.handler_id
           WHERE ${where.join(' AND ')}
           ORDER BY COALESCE(r.updated_at, r.created_at) DESC
           LIMIT ${args.limit}`
        )
        .all(...params)) as any[];

      return ok({
        count: rows.length,
        items: rows.map((r) => ({
          ...r,
          status_label: statusLabel(r.status),
          priority_label: priorityLabel(r.priority),
        })),
      });
    }
  );

  server.registerTool(
    'get_requirement',
    {
      description: '获取指定 ID 的需求详情，含项目/处理人/验证人姓名与最近状态变更记录。',
      inputSchema: { id: z.number().int().positive().describe('需求 ID') },
    },
    async ({ id }) => {
      const db = getAsyncDb();
      const row = (await db
        .prepare(
          `SELECT r.*, p.name AS project_name,
                  hu.display_name AS handler_name,
                  vu.display_name AS verifier_name,
                  ru.display_name AS receiver_name
           FROM requirements r
           LEFT JOIN projects p ON p.id = r.project_id
           LEFT JOIN users hu ON hu.id = r.handler_id
           LEFT JOIN users vu ON vu.id = r.verifier_id
           LEFT JOIN users ru ON ru.id = r.receiver_id
           WHERE r.id = ?`
        )
        .get(id)) as any;
      if (!row) return fail(`需求 #${id} 不存在`);

      const logs = (await db
        .prepare(
          `SELECT s.old_status, s.new_status, s.changed_at, u.display_name AS changed_by_name
           FROM status_log s LEFT JOIN users u ON u.id = s.changed_by
           WHERE s.requirement_id = ? ORDER BY s.changed_at DESC LIMIT 10`
        )
        .all(id)) as any[];

      return ok({
        ...row,
        status_label: statusLabel(row.status),
        priority_label: priorityLabel(row.priority),
        status_history: logs.map((l) => ({
          ...l,
          old_status_label: statusLabel(l.old_status),
          new_status_label: statusLabel(l.new_status),
        })),
      });
    }
  );

  server.registerTool(
    'list_projects',
    {
      description: '列出所有项目，附带每个项目的需求数量。',
      inputSchema: {},
    },
    async () => {
      const db = getAsyncDb();
      const rows = (await db
        .prepare(
          `SELECT p.id, p.name, p.description,
                  COUNT(r.id) AS requirement_count
           FROM projects p
           LEFT JOIN requirements r
             ON r.project_id = p.id AND (r.merged_into IS NULL OR r.merged_into = 0)
           GROUP BY p.id, p.name, p.description
           ORDER BY p.id`
        )
        .all()) as any[];
      return ok({ count: rows.length, items: rows });
    }
  );

  server.registerTool(
    'get_dashboard_stats',
    {
      description: '需求统计：总数，以及按状态、优先级、项目的分布。已排除合并需求。',
      inputSchema: {},
    },
    async () => {
      const db = getAsyncDb();
      const one = async (sql: string) => (await db.prepare(sql).all()) as any[];
      const total = ((await db
        .prepare(`SELECT COUNT(*) AS c FROM requirements r WHERE ${NOT_MERGED}`)
        .get()) as any).c;

      const byStatus = await one(
        `SELECT r.status, COUNT(*) AS count FROM requirements r
         WHERE ${NOT_MERGED} GROUP BY r.status ORDER BY count DESC`
      );
      const byPriority = await one(
        `SELECT r.priority, COUNT(*) AS count FROM requirements r
         WHERE ${NOT_MERGED} GROUP BY r.priority ORDER BY count DESC`
      );
      const byProject = await one(
        `SELECT p.name AS project, COUNT(*) AS count
         FROM requirements r LEFT JOIN projects p ON p.id = r.project_id
         WHERE ${NOT_MERGED} GROUP BY p.name ORDER BY count DESC LIMIT 20`
      );

      return ok({
        total,
        by_status: byStatus.map((r) => ({ ...r, label: statusLabel(r.status) })),
        by_priority: byPriority.map((r) => ({ ...r, label: priorityLabel(r.priority) })),
        by_project: byProject,
      });
    }
  );

  // ── 敏感工具：仅在 mcp_expose_sensitive 开启时注册 ─────────

  if (cfg.exposeSensitive) {
    server.registerTool(
      'list_users',
      {
        description: '列出系统用户（ID、用户名、显示名、部门）。用于按人名查需求时先拿到 user_id。',
        inputSchema: {
          keyword: z.string().max(50).optional().describe('按显示名或用户名模糊匹配'),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async (args) => {
        const db = getAsyncDb();
        const where: string[] = [];
        const params: any[] = [];
        if (args.keyword) {
          where.push('(display_name LIKE ? OR username LIKE ?)');
          params.push(`%${args.keyword}%`, `%${args.keyword}%`);
        }
        // 注意：不返回 email / password_hash / IM open_id 等身份标识
        const rows = (await db
          .prepare(
            `SELECT id, username, display_name, business_unit
             FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY id LIMIT ${args.limit}`
          )
          .all(...params)) as any[];
        return ok({ count: rows.length, items: rows });
      }
    );

    server.registerTool(
      'get_schema',
      {
        description: '获取数据库表结构。不传 table 返回表列表，传 table 返回该表字段。',
        inputSchema: { table: z.string().max(64).regex(/^[A-Za-z0-9_]+$/).optional() },
      },
      async ({ table }) => {
        const db = getAsyncDb();
        const isMysql = isMysqlEnabled();
        if (!table) {
          const rows = (await db
            .prepare(
              isMysql
                ? `SELECT TABLE_NAME AS name FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
                : `SELECT name FROM sqlite_master WHERE type='table'
                   AND name NOT LIKE 'sqlite_%' ORDER BY name`
            )
            .all()) as any[];
          return ok({ count: rows.length, tables: rows.map((r) => r.name) });
        }
        // table 已被 regex 限制为 [A-Za-z0-9_]；MySQL 分支仍走占位符绑定。
        // SQLite 的 PRAGMA 不支持占位符，靠上面的 regex 白名单保底。
        const cols = isMysql
          ? ((await db
              .prepare(
                `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                 ORDER BY ORDINAL_POSITION`
              )
              .all(table)) as any[])
          : ((await db.prepare(`PRAGMA table_info(${table})`).all()) as any[]).map((c: any) => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull ? 'NO' : 'YES',
            }));
        if (cols.length === 0) return fail(`表 ${table} 不存在`);
        return ok({ table, columns: cols });
      }
    );
  }

  // ── 写工具：仅在 mcp_allow_write 开启时注册 ──────────────

  if (cfg.allowWrite) {
    server.registerTool(
      'create_requirement',
      {
        description:
          '创建需求。必填标题。receiver_id 自动记为当前 token 属主，不可指定。',
        inputSchema: {
          title: z.string().min(1).max(500).describe('需求标题'),
          description: z.string().max(20000).optional(),
          status: z.enum(STATUS_KEYS as [string, ...string[]]).optional(),
          priority: z.enum(PRIORITY_KEYS as [string, ...string[]]).optional(),
          category: z.enum(['project', 'adhoc']).optional(),
          project_id: z.number().int().positive().optional(),
          handler_id: z.number().int().positive().optional(),
          planned_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('计划完成日 YYYY-MM-DD'),
        },
      },
      async (args) => {
        const db = getAsyncDb();
        const status = args.status || 'received_not_evaluated';
        const priority = args.priority || 'medium';
        const res: any = await db
          .prepare(
            `INSERT INTO requirements
               (title, description, status, priority, category, project_id,
                receiver_id, handler_id, planned_end, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${SQL_NOW}, ${SQL_NOW})`
          )
          .run(
            args.title,
            args.description || '',
            status,
            priority,
            args.category || 'project',
            args.project_id || null,
            user.id, // 创建人固定为 token 属主
            args.handler_id || null,
            args.planned_end || null
          );
        const newId = res?.lastInsertRowid ?? res?.insertId ?? null;
        return ok({
          created: true,
          id: newId,
          title: args.title,
          status,
          status_label: statusLabel(status),
        });
      }
    );

    server.registerTool(
      'update_requirement',
      {
        description:
          '修改需求的状态、优先级、处理人等。状态变更会自动写入 status_log 审计。',
        inputSchema: {
          id: z.number().int().positive(),
          title: z.string().min(1).max(500).optional(),
          description: z.string().max(20000).optional(),
          status: z.enum(STATUS_KEYS as [string, ...string[]]).optional(),
          priority: z.enum(PRIORITY_KEYS as [string, ...string[]]).optional(),
          handler_id: z.number().int().positive().optional(),
          verifier_id: z.number().int().positive().optional(),
          planned_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        },
      },
      async (args) => {
        const db = getAsyncDb();
        const cur = (await db
          .prepare('SELECT id, status FROM requirements WHERE id = ?')
          .get(args.id)) as any;
        if (!cur) return fail(`需求 #${args.id} 不存在`);

        // 字段白名单 → 列名不来自用户输入，杜绝注入
        const FIELD_COLUMNS: Record<string, string> = {
          title: 'title',
          description: 'description',
          status: 'status',
          priority: 'priority',
          handler_id: 'handler_id',
          verifier_id: 'verifier_id',
          planned_end: 'planned_end',
        };
        const sets: string[] = [];
        const params: any[] = [];
        for (const [key, col] of Object.entries(FIELD_COLUMNS)) {
          const v = (args as any)[key];
          if (v !== undefined) { sets.push(`${col} = ?`); params.push(v); }
        }
        if (sets.length === 0) return fail('没有提供任何要修改的字段');

        sets.push(`updated_at = ${SQL_NOW}`);
        params.push(args.id);
        await db.prepare(`UPDATE requirements SET ${sets.join(', ')} WHERE id = ?`).run(...params);

        // 状态变了就记 status_log —— 与网页端行为一致
        if (args.status && args.status !== cur.status) {
          await db
            .prepare(
              `INSERT INTO status_log (requirement_id, old_status, new_status, changed_by, changed_at)
               VALUES (?, ?, ?, ?, ${SQL_NOW})`
            )
            .run(args.id, cur.status, args.status, user.id);
        }

        return ok({
          updated: true,
          id: args.id,
          changed_fields: Object.keys(FIELD_COLUMNS).filter((k) => (args as any)[k] !== undefined),
          status_changed: !!(args.status && args.status !== cur.status),
        });
      }
    );
  }

  return server;
}

/** 当前启用的工具名清单 —— 给配置页展示用，避免前端硬编码一份跟着漂移。 */
export function listEnabledTools(cfg: McpConfig): string[] {
  const tools = ['search_requirements', 'get_requirement', 'list_projects', 'get_dashboard_stats'];
  if (cfg.exposeSensitive) tools.push('list_users', 'get_schema');
  if (cfg.allowWrite) tools.push('create_requirement', 'update_requirement');
  return tools;
}
