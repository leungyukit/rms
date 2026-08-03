
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

/**
 * 只读 SQL 查询接口。
 *
 * 安全修复（2026-08-03）：
 * 原实现只有 `query.trim().toUpperCase().startsWith('SELECT')` 一道检查，且没有任何
 * 角色校验 —— 任何登录用户（含默认 login_only 新注册用户）都能执行
 * `SELECT username, password_hash FROM users` 拖走全部 bcrypt 哈希。
 * 且开头检查可被绕过：多语句、CTE(WITH)、PRAGMA、ATTACH、INTO OUTFILE 等。
 *
 * 现在：
 *   1. 必须 global_admin；
 *   2. 单语句（禁止 `;` 分隔的多语句）；
 *   3. 严格白名单：只允许 SELECT / WITH 开头；
 *   4. 黑名单拦截写操作与文件/库操作关键字；
 *   5. 敏感表（users / access_tokens / system_config）禁止查询；
 *   6. 强制 LIMIT 上限，避免全表拖库。
 */

// 禁止出现的关键字（词边界匹配，避免误伤 "selected_at" 这类列名）
const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'REPLACE', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM',
  'INTO', 'LOAD_FILE', 'OUTFILE', 'DUMPFILE', 'BENCHMARK', 'SLEEP',
  'EXEC', 'EXECUTE', 'CALL', 'SET', 'HANDLER', 'LOCK', 'UNLOCK',
];

// 禁止访问的敏感表
const FORBIDDEN_TABLES = ['users', 'access_tokens', 'system_config', 'user_roles'];

const MAX_ROWS = 1000;

function validateQuery(raw: string): { ok: true; sql: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'query 不能为空' };
  }

  let sql = raw.trim();

  // 去掉末尾分号（允许单个收尾分号）
  sql = sql.replace(/;+\s*$/, '');

  // 剥离注释后再校验，避免用注释藏关键字
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ');

  // 多语句检测：剥离字符串字面量后不允许再出现 ;
  const noStrings = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if (noStrings.includes(';')) {
    return { ok: false, error: '只允许单条语句，禁止使用分号分隔多语句' };
  }

  const upper = noStrings.toUpperCase();

  // 白名单：必须 SELECT 或 WITH 开头
  if (!/^\s*(SELECT|WITH)\b/.test(upper)) {
    return { ok: false, error: '只允许 SELECT 查询' };
  }

  // 黑名单关键字
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return { ok: false, error: `查询中不允许出现关键字：${kw}` };
    }
  }

  // 敏感表
  for (const t of FORBIDDEN_TABLES) {
    if (new RegExp(`\\b${t.toUpperCase()}\\b`).test(upper)) {
      return { ok: false, error: `禁止查询敏感表：${t}` };
    }
  }

  return { ok: true, sql };
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }
    // 修复：原来任何登录用户都能执行任意 SELECT
    if (!isGlobalAdmin(user.roles)) {
      return Response.json({ error: '无权限，仅全局管理员可执行自定义查询' }, { status: 403 });
    }

    const { query } = await request.json();

    const v = validateQuery(query);
    if (!v.ok) {
      return Response.json({ error: v.error }, { status: 400 });
    }

    const db = getAsyncDb();
    const rows = await db.prepare(v.sql).all();

    // 强制行数上限，避免一次拖走整表
    const data = Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : rows;
    const truncated = Array.isArray(rows) && rows.length > MAX_ROWS;

    return Response.json({ data, truncated, max_rows: MAX_ROWS });
  } catch (e) {
    console.error('Failed to execute query:', e);
    // 不把 DB 错误详情（含 SQL/表结构）回给客户端
    return Response.json({ error: '执行查询失败' }, { status: 500 });
  }
}
