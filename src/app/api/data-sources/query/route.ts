
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

// 禁止访问的敏感表 / 库
// 安全修复（2026-08-31）：补上系统库 —— 原实现只禁业务表，
// `SELECT * FROM mysql.user` 和 information_schema 全库结构导出都能直接过。
const FORBIDDEN_TABLES = ['users', 'access_tokens', 'system_config', 'user_roles'];
const FORBIDDEN_SCHEMAS = ['INFORMATION_SCHEMA', 'MYSQL', 'PERFORMANCE_SCHEMA', 'SYS'];

const MAX_ROWS = 1000;

function validateQuery(raw: string): { ok: true; sql: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'query 不能为空' };
  }

  let sql = raw.trim();

  // 去掉末尾分号（允许单个收尾分号）
  sql = sql.replace(/;+\s*$/, '');

  // 安全修复（2026-08-31）—— 两个绕过已实测确认：
  //
  // 1) MySQL 版本注释 `/*!50000 ... */` 里的内容会被 MySQL 真正执行，
  //    但原实现「剥掉注释再校验、却把原始 SQL 拿去执行」，于是
  //    `SELECT username, password_hash FROM /*!50000 users*/` 完美过关并拖走全部 bcrypt 哈希。
  // 2) 注释可用来拆词绕过标识符黑名单：`SELECT * FROM us/**/ers`
  //    —— MySQL 把 `us/**/ers` 当成 `us ers`（表别名），实际仍可构造出等价访问。
  //
  // 根治思路：不再「剥离注释后校验」，而是直接禁止任何块注释/行注释出现。
  // 报表查询不需要注释，代价可接受，且彻底消灭「校验视图 ≠ 执行视图」这类偏差。
  if (/\/\*/.test(sql) || /\*\//.test(sql)) {
    return { ok: false, error: '查询中不允许使用块注释（/* */）' };
  }
  if (/--|#/.test(sql.replace(/'(?:[^'\\]|\\.)*'/g, "''"))) {
    return { ok: false, error: '查询中不允许使用行注释（-- 或 #）' };
  }

  // 多语句检测：剥离字符串字面量后不允许再出现 ;
  const noStrings = sql.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if (noStrings.includes(';')) {
    return { ok: false, error: '只允许单条语句，禁止使用分号分隔多语句' };
  }

  // 反引号会被用来包裹标识符绕过词边界匹配，直接禁掉
  if (noStrings.includes('`')) {
    return { ok: false, error: '查询中不允许使用反引号' };
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

  // 敏感库（information_schema / mysql / performance_schema / sys）
  for (const s of FORBIDDEN_SCHEMAS) {
    if (new RegExp(`\\b${s}\\b`).test(upper)) {
      return { ok: false, error: `禁止查询系统库：${s}` };
    }
  }

  // 十六进制/字符函数常被用来拼出被禁的标识符，绕过上面的字面量匹配
  if (/\b0X[0-9A-F]+\b/.test(upper)) {
    return { ok: false, error: '查询中不允许使用十六进制字面量' };
  }
  for (const fn of ['CHAR', 'CONCAT_WS', 'UNHEX', 'FROM_BASE64', 'CONVERT', 'CAST']) {
    if (new RegExp(`\\b${fn}\\s*\\(`).test(upper)) {
      return { ok: false, error: `查询中不允许使用函数：${fn}` };
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
