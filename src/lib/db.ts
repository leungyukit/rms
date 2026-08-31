import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';

export const STATUS_MAP: Record<string, string> = {
  received_not_evaluated: '仅接收，未评估',
  evaluated_not_scheduled: '已评估，未排期',
  scheduled: '已排期',
  in_progress: '处理中',
  completed: '已完成',
  verified: '已验证',
  closed: '已关闭',
};

export const PRIORITY_MAP: Record<string, string> = {
  high: '高', medium: '中', low: '低',
};

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || '3306';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'rms';
const MYSQL_USER = process.env.MYSQL_USER || 'rms';
// 不给密码默认值：本仓库公开，可用凭据绝不能进代码。
// 启用 MySQL 但没提供密码时直接报错，不静默回退到一个猜出来的弱密码。
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const USE_MYSQL = process.env.DB_TYPE === 'mysql';
if (USE_MYSQL && !MYSQL_PASSWORD) {
  throw new Error(
    'DB_TYPE=mysql 但未设置 MYSQL_PASSWORD。请在环境变量（或 .env.systemd）中配置后重启。'
  );
}

const DB_PATH = path.join(process.cwd(), 'data', 'rms.db');
let sqliteDb: Database.Database | null = null;

// 将 MySQL 方言转换为 SQLite 方言
function normalizeSqliteSql(sql: string): string {
  // 处理 INSERT ... ON DUPLICATE KEY UPDATE
  // 转换为 SQLite 的 INSERT OR REPLACE 逻辑
  if (/INSERT[\s\S]+ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(sql)) {
    // 清理SQL，去除多余空格和换行符
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    // 提取 INSERT 部分的列（支持占位符 ? 或具体值）
    const insertMatch = cleanSql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c: string) => c.trim());
      const vals = insertMatch[3]; // 保留原始值（可能是 ? 或具体值）
      // 提取 UPDATE 部分的赋值
      const updateMatch = cleanSql.match(/ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(.+)$/i);
      if (updateMatch && insertMatch) {
        const updates = updateMatch[1].split(',').map((s: string) => {
          const [col] = s.trim().split('=').map((c: string) => c.trim());
          return `${col}=excluded.${col}`;
        }).join(', ');
        // 对于 role_menu_permissions 表，使用复合主键 (role_id, menu_item_id)
        // 注意：这是一个硬编码的解决方案，更好的方法是查询表的主键信息
        let pk = cols.join(', '); // 默认使用所有列
        if (table === 'role_menu_permissions') {
          pk = 'role_id, menu_item_id';
        }
        // 构建 SQLite 语句，保留占位符
        return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`;
      }
    }
  }

  return sql
    .replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO')
    .replace(/\bDROP\s+INDEX\s+IF\s+EXISTS\s+\S+\s+ON\s+\S+/gi, '') // SQLite 不支持该语法，忽略
    .replace(/\bALTER\s+TABLE\s+(\S+)\s+DROP\s+COLUMN\s+(\S+)/gi, 'ALTER TABLE $1 DROP COLUMN $2');
}

/**
 * 将 SQLite 方言转换为 MySQL 方言。
 *
 * 背景（2026-08-27）：normalizeSqliteSql 只做「MySQL → SQLite」单向转换，
 * 反向完全没人管。于是代码里写的 `INSERT OR IGNORE INTO`（SQLite 语法）
 * 打到 MySQL 上直接 `ERROR 1064 syntax error near 'OR IGNORE INTO'`。
 * 线上 /custom-dashboards 新建失败的第二个根因就是这个。
 *
 * 只做保守的等价替换，不猜语义：
 *   INSERT OR IGNORE INTO  → INSERT IGNORE INTO
 *   INSERT OR REPLACE INTO → REPLACE INTO
 */
function normalizeMysqlSql(sql: string): string {
  return sql
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT IGNORE INTO')
    .replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi, 'REPLACE INTO');
}

function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    // 包装 prepare/exec，自动做方言转换
    const origPrepare = sqliteDb.prepare.bind(sqliteDb);
    sqliteDb.prepare = (sql: string) => origPrepare(normalizeSqliteSql(sql));
    const origExec = sqliteDb.exec.bind(sqliteDb);
    sqliteDb.exec = (sql: string) => origExec(normalizeSqliteSql(sql));
  }
  return sqliteDb;
}

/**
 * 执行 SQL（同步路径）。
 *
 * 安全修复（2026-08-03）：原实现把 SQL 拼进 `sh -c "mysql ... -e \"<SQL>\""`，
 * 转义漏了 `$`，导致 `$(...)` 命令替换可在服务器上执行任意命令（RCE）。
 * 现改为：
 *   1. execFileSync 直接调用二进制，不经过 shell → 无命令替换、无管道、无重定向；
 *   2. SQL 通过 stdin 传入，不再作为命令行参数 → SQL 内容与命令行彻底隔离；
 *   3. 密码走 MYSQL_PWD 环境变量 → 不出现在进程命令行（ps 可见）里。
 */
/**
 * MySQL 错误码里「幂等 DDL 的正常噪音」白名单。
 *
 * 24 个 migration 文件的模式都是「无条件 ALTER/CREATE INDEX，已存在就忽略」，
 * 这类报错是预期行为，不能当故障。除此以外的错误一律上抛。
 */
const IDEMPOTENT_DDL_ERRNOS = new Set([
  1050, // Table already exists
  1060, // Duplicate column name
  1061, // Duplicate key name
  1091, // Can't DROP ...; check that column/key exists
  1826, // Duplicate foreign key constraint name
]);

function parseMysqlErrno(msg: string): number | null {
  const m = /ERROR (\d{3,4})/.exec(msg);
  return m ? parseInt(m[1], 10) : null;
}

export class DbError extends Error {
  errno: number | null;
  sql: string;
  constructor(message: string, errno: number | null, sql: string) {
    super(message);
    this.name = 'DbError';
    this.errno = errno;
    this.sql = sql;
  }
}

function runMysql(sql: string): { ok: true; out: string } | { ok: false; msg: string; errno: number | null } {
  try {
    const out = execFileSync(
      'mysql',
      [
        '-h', MYSQL_HOST,
        '-P', String(MYSQL_PORT),
        '-u', MYSQL_USER,
        // 必须显式指定字符集：mysql CLI 默认可能是 latin1（Docker 部署实测确认
        // character_set_client/connection/results 全为 latin1），中文经 latin1 通道
        // 写入 utf8mb4 列会双重编码，表现为「创建用户」→「åˆ›å»ºç”¨æˆ·」。
        // 2026-08-12 线上事故根因，勿删。
        '--default-character-set=utf8mb4',
        MYSQL_DATABASE,
        '-N', '-B',
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        input: sql,
        env: { ...process.env, MYSQL_PWD: MYSQL_PASSWORD },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return { ok: true, out: (out || '').trim() };
  } catch (e: any) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    return { ok: false, msg, errno: parseMysqlErrno(msg) };
  }
}

/**
 * 执行 SQL，失败即抛错。
 *
 * 2026-08-31：原实现失败时 `return ''`，于是上层 `get()` 返回 undefined、
 * `all()` 返回 []，**「查询失败」和「查询结果为空」完全无法区分**。
 * 这是本项目大量静默故障的总根源 —— 实际造成过：
 *   - SLA/估时配置因 MySQL 保留字 `key` 未转义而全部写入失败，页面却正常显示
 *     （静默 fallback 到硬编码默认值），活了很久没人发现
 *   - `Table 'rms.reports' doesn't exist` 期间页面只是「没有数据」，不报错
 * 现在改为上抛，让路由层 error boundary 返回 500 —— 故障必须可见。
 */
function mysqlExec(sql: string): string {
  const r = runMysql(sql);
  if (r.ok) return r.out;
  // eslint-disable-next-line no-console
  console.error('[db.mysqlExec] failed:', r.msg, '| sql:', sql.slice(0, 200));
  throw new DbError(`MySQL 执行失败: ${r.msg.trim()}`, r.errno, sql);
}

/**
 * 尽力而为版本：失败返回 null，不抛错。
 * 只用于「失败也能降级继续」的旁路（如列名推断的 DESCRIBE 探测）。
 */
function mysqlExecSafe(sql: string): string | null {
  const r = runMysql(sql);
  if (r.ok) return r.out;
  // eslint-disable-next-line no-console
  console.warn('[db.mysqlExecSafe] 忽略失败:', r.msg.trim(), '| sql:', sql.slice(0, 120));
  return null;
}

/**
 * 多语句执行，供 DDL（建表/加列/建索引）使用。
 * 幂等 DDL 的「已存在」类报错按预期忽略，其余一律上抛。
 */
function mysqlExecMulti(sql: string): void {
  const stmts = normalizeMysqlSql(sql).split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    const r = runMysql(stmt);
    if (r.ok) continue;
    if (r.errno !== null && IDEMPOTENT_DDL_ERRNOS.has(r.errno)) {
      // 幂等 DDL 的正常噪音，不算故障
      continue;
    }
    // eslint-disable-next-line no-console
    console.error('[db.mysqlExecMulti] failed:', r.msg.trim(), '| sql:', stmt.slice(0, 200));
    throw new DbError(`MySQL DDL 执行失败: ${r.msg.trim()}`, r.errno, stmt);
  }
}

function parseMysqlRows(output: string, columns: string[]): any[] {
  if (!output) return [];
  return output.split('\n').map(line => {
    const vals = line.split('\t');
    const obj: any = {};
    for (let i = 0; i < vals.length; i++) {
      const val = vals[i] ?? '';
      const key = i < columns.length ? columns[i] : `_col${i}`;
      obj[key] = val === 'NULL' ? null : (isNaN(Number(val)) || val === '' ? val : Number(val));
    }
    return obj;
  });
}

/**
 * SQL 字面量转义（仅用于 SQL 层，不再承担 shell 转义职责）。
 * 覆盖 MySQL 需要转义的全部字符，含 \n \r \x1a 与双引号。
 */
function escapeMysqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 'NULL';
    return String(val);
  }
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) {
    return "'" + val.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '') + "'";
  }
  const str = String(val);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') result += '\\\\';
    else if (ch === "'") result += "\\'";
    else if (ch === '"') result += '\\"';
    else if (ch === '\n') result += '\\n';
    else if (ch === '\r') result += '\\r';
    else if (ch === '\0') result += '\\0';
    else if (ch === '\x1a') result += '\\Z';
    else result += ch;
  }
  return "'" + result + "'";
}

// ==================== 异步 API (mysql2/promise 连接池) ====================
// 用于改写 routes 为 async: await getAsyncDb().prepare(sql).get(...)
// 性能: pool 首次 15ms / 复用 1ms (vs execSync CLI 39ms)

let _mysql2Pool: any = null;
let _mysql2: any = null;

function getMysql2Pool() {
  if (!_mysql2Pool) {
    try {
      _mysql2 = require('mysql2');
    } catch (e: any) {
      throw new Error('mysql2 包未安装: ' + (e?.message || String(e)));
    }
    _mysql2Pool = _mysql2.createPool({
      host: MYSQL_HOST,
      port: parseInt(MYSQL_PORT),
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      connectionLimit: 10,
      waitForConnections: true,
      charset: 'utf8mb4',
      decimalNumbers: true,
    }).promise();  // promise() 返带 promise 接口的包装
  }
  return _mysql2Pool;
}

/**
 * 事务上下文（2026-08-03 修复）。
 *
 * 原实现的 transaction() 单独取一个连接发 START TRANSACTION，但业务 SQL 全走
 * pool.query()（另一个连接），事务连接在那空转，业务语句全部自动提交，
 * ROLLBACK 回滚的是空事务 —— 所有“事务保护”都是假的。
 * 现用 AsyncLocalStorage 把事务连接绑到异步上下文，事务内所有语句自动走同一连接。
 */
const mysqlTxStore = new AsyncLocalStorage<any>();

class MySqlAsyncPreparedStatement {
  private baseSql: string;
  constructor(sql: string) {
    this.baseSql = normalizeMysqlSql(sql);
  }
  private buildSql(params: any[]): string {
    if (params.length === 0) return this.baseSql;
    let i = 0;
    return this.baseSql.replace(/\?/g, () => {
      if (i >= params.length) return '?';
      return escapeMysqlValue(params[i++]);
    });
  }
  /** 事务内返事务连接，否则返连接池 */
  private runner(): any {
    return mysqlTxStore.getStore() || getMysql2Pool();
  }
  async get(...params: any[]): Promise<any> {
    const sql = this.buildSql(params);
    const [rows] = await this.runner().query(sql);
    return rows[0];
  }
  async all(...params: any[]): Promise<any[]> {
    const sql = this.buildSql(params);
    const [rows] = await this.runner().query(sql);
    return rows as any[];
  }
  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const sql = this.buildSql(params);
    const [result] = await this.runner().query(sql);
    return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
  }
}

class MySqlAsyncDatabase {
  prepare(sql: string): MySqlAsyncPreparedStatement {
    return new MySqlAsyncPreparedStatement(sql);
  }
  async exec(sql: string): Promise<void> {
    const runner = mysqlTxStore.getStore() || getMysql2Pool();
    const stmts = normalizeMysqlSql(sql).split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await runner.query(stmt);
    }
  }
  async transaction(fn: (...args: any[]) => any): Promise<(...args: any[]) => Promise<any>> {
    return async (...args: any[]) => {
      // 已在事务中 → 直接参与外层事务，不嵌套开新事务
      const existing = mysqlTxStore.getStore();
      if (existing) return await fn(...args);

      const conn = await getMysql2Pool().getConnection();
      try {
        await conn.beginTransaction();
        // 关键：在 store 上下文内执行，使 fn 里所有语句走同一 conn
        const result = await mysqlTxStore.run(conn, () => fn(...args));
        await conn.commit();
        return result;
      } catch (e) {
        try { await conn.rollback(); } catch { /* 连接已断时忽略 */ }
        throw e;
      } finally {
        conn.release();
      }
    };
  }
}

let asyncMysqlDb: MySqlAsyncDatabase | null = null;

/** 获取异步 MySQL 数据库 (在 async route handler 中用: const db = getAsyncDb()) */
export function getAsyncDb(): MySqlAsyncDatabase {
  if (USE_MYSQL) {
    if (!asyncMysqlDb) asyncMysqlDb = new MySqlAsyncDatabase();
    return asyncMysqlDb;
  }
  // SQLite 模式: better-sqlite3 是同步的，但 wrap 成 async 外观 (直接返 result)
  // 这样 routes 可以用 await getAsyncDb().prepare(...).get(...)
  return new MySqlAsyncDatabase() as any;  // 实际返 SQLiteAsyncDatabase
}

// 覆盖 SQLite 路径下的 getAsyncDb
class SqliteAsyncPreparedStatement {
  private stmt: any;
  constructor(stmt: any) { this.stmt = stmt; }
  async get(...params: any[]): Promise<any> { return this.stmt.get(...params); }
  async all(...params: any[]): Promise<any[]> { return this.stmt.all(...params); }
  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const r = this.stmt.run(...params);
    return { changes: r.changes || 0, lastInsertRowid: r.lastInsertRowid || 0 };
  }
}

// SQLite 事务串行化状态（见下方 transaction 注释）
let sqliteTxQueue: Promise<void> = Promise.resolve();
// 2026-08-03 二次修正：原来用模块级 `let sqliteTxDepth = 0` 判断“是否已在事务中”，
// 但那是全进程共享的计数器 —— 事务 A 在 await 期间，**另一个并发请求** B 调 transaction()
// 会看到 depth>0，误判自己身处 A 的事务里，于是跳过排队、不发 BEGIN，
// 直接把 B 的写入混进 A 的事务：A 回滚时连 B 的数据一起干掉（正是本次要修的原 bug）。
// 改用 AsyncLocalStorage，与 MySQL 侧保持一致：嵌套判断只在同一异步调用链内成立。
const sqliteTxStore = new AsyncLocalStorage<{ depth: number }>();

class SqliteAsyncDatabase {
  private inner: any;
  constructor() { this.inner = getSqliteDb(); }
  prepare(sql: string): SqliteAsyncPreparedStatement {
    return new SqliteAsyncPreparedStatement(this.inner.prepare(sql));
  }
  async exec(sql: string): Promise<void> { this.inner.exec(sql); }
  /**
   * 事务（2026-08-03 修复）。
   *
   * 原实现：BEGIN 后 `await fn()`，而 better-sqlite3 是同步的 —— await 让出事件循环时，
   * 同进程其他并发请求的写入会被裹进这个事务，回滚时把别人的数据一起干掉。
   * 现加串行化互斥锁：同一时刻只允许一个事务，其余排队，消除交错污染。
   * 嵌套复用通过 AsyncLocalStorage 判定（仅同一异步链内视为嵌套），避免并发请求误判。
   */
  async transaction(fn: (...args: any[]) => any): Promise<(...args: any[]) => Promise<any>> {
    return async (...args: any[]) => {
      const ctx = sqliteTxStore.getStore();
      if (ctx && ctx.depth > 0) {
        // 同一异步链内的嵌套事务 → 直接参与外层事务，不重复 BEGIN
        return await fn(...args);
      }
      // 排队：等前一个事务彻底结束
      const myTurn = sqliteTxQueue;
      let release: () => void = () => {};
      sqliteTxQueue = new Promise<void>((res) => { release = res; });
      await myTurn;

      const conn = this.inner;
      try {
        return await sqliteTxStore.run({ depth: 1 }, async () => {
          conn.exec('BEGIN IMMEDIATE TRANSACTION');
          try {
            const result = await fn(...args);
            conn.exec('COMMIT');
            return result;
          } catch (e) {
            try { conn.exec('ROLLBACK'); } catch { /* 已自动回滚时忽略 */ }
            throw e;
          }
        });
      } finally {
        // 无论成功失败都必须释放队列，否则后续所有事务永久卡死
        release();
      }
    };
  }
}

let sqliteAsyncDb: SqliteAsyncDatabase | null = null;
function getSqliteAsyncDb(): SqliteAsyncDatabase {
  if (!sqliteAsyncDb) sqliteAsyncDb = new SqliteAsyncDatabase();
  return sqliteAsyncDb;
}

// 重写 getAsyncDb 支持 SQLite 路径
// (TS 不允许在 function 后改返值类型，用对象访问 hack)
const _origGetAsyncDb = getAsyncDb;
(getAsyncDb as any) = (): any => {
  if (USE_MYSQL) {
    if (!asyncMysqlDb) asyncMysqlDb = new MySqlAsyncDatabase();
    return asyncMysqlDb;
  }
  return getSqliteAsyncDb();
};

class MySqlPreparedStatement {
  private baseSql: string;
  private columnNames: string[] = [];

  constructor(sql: string) {
    this.baseSql = normalizeMysqlSql(sql);
    let depth = 0;
    let selectEnd = -1;
    const upperSql = sql.toUpperCase();
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') { depth++; }
      else if (ch === ')') { if (depth > 0) depth--; }
      else if (depth === 0 && upperSql.substring(i, i + 5) === 'FROM ') {
        selectEnd = i; break;
      }
    }
    if (selectEnd > 0) {
      const selectStart = sql.toUpperCase().indexOf('SELECT ') + 7;
      const selectPart = sql.substring(selectStart, selectEnd).trim();
      if (selectPart !== '*') {
        const cols: string[] = [];
        let current = '';
        let parenDepth = 0;
        for (let i = 0; i < selectPart.length; i++) {
          const ch = selectPart[i];
          if (ch === '(') parenDepth++;
          else if (ch === ')') parenDepth--;
          else if (ch === ',' && parenDepth === 0) { cols.push(current); current = ''; continue; }
          current += ch;
        }
        if (current) cols.push(current);
        this.columnNames = cols.map(c => {
          const asMatch = c.trim().match(/AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
          if (asMatch) return asMatch[1];
          const trimmed = c.trim();
          if (trimmed.endsWith('.*')) return '*';
          if (trimmed === '*') return '*';
          const stripped = trimmed.replace(/\([^)]*\)/g, ' ');
          const lastWord = stripped.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
          if (lastWord) return lastWord[1];
          const parts = trimmed.split('.');
          const colName = parts[parts.length - 1].trim();
          return colName.replace(/[^a-zA-Z0-9_]/g, '');
        });
        if (this.columnNames.includes('*')) this.columnNames = [];
      }
    }
  }

  private buildSql(params: any[]): string {
    if (params.length === 0) return this.baseSql;
    let i = 0;
    return this.baseSql.replace(/\?/g, () => {
      if (i >= params.length) return '?';
      return escapeMysqlValue(params[i++]);
    });
  }

  private resolveColumnNames(): string[] {
    if (this.columnNames.length > 0) return this.columnNames;
    let depth = 0;
    let mainFrom = '';
    for (let i = 0; i < this.baseSql.length; i++) {
      if (this.baseSql[i] === '(') depth++;
      else if (this.baseSql[i] === ')') depth--;
      else if (depth === 0 && this.baseSql.substring(i).toUpperCase().startsWith('FROM ')) {
        mainFrom = this.baseSql.substring(i + 5);
        break;
      }
    }
    if (mainFrom) {
      const tableMatch = mainFrom.match(/^(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
      if (tableMatch) {
        const descOutput = mysqlExecSafe(`DESCRIBE ${tableMatch[1]}`);
        if (descOutput) {
          this.columnNames = descOutput.split('\n').map(line => line.split('\t')[0]).filter(Boolean);
        }
      }
    }
    depth = 0;
    let sqlPos = 0;
    while (sqlPos < this.baseSql.length) {
      if (this.baseSql[sqlPos] === '(') depth++;
      else if (this.baseSql[sqlPos] === ')') depth--;
      else if (depth === 0) {
        const asMatch = this.baseSql.substring(sqlPos).match(/^AS\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
        if (asMatch && !this.columnNames.includes(asMatch[1])) {
          this.columnNames.push(asMatch[1]);
          sqlPos += asMatch[0].length;
          continue;
        }
      }
      sqlPos++;
    }
    return this.columnNames;
  }

  get(...params: any[]): any {
    const sql = this.buildSql(params);
    const output = mysqlExec(sql);
    if (!output) return undefined;
    const rows = parseMysqlRows(output, this.resolveColumnNames());
    return rows[0] || undefined;
  }

  all(...params: any[]): any[] {
    const sql = this.buildSql(params);
    const output = mysqlExec(sql);
    if (!output) return [];
    return parseMysqlRows(output, this.resolveColumnNames());
  }

  run(...params: any[]): any {
    const sql = this.buildSql(params);
    const allSql = `${sql}; SELECT LAST_INSERT_ID()`;
    const output = mysqlExec(allSql);
    if (output) {
      const lastLine = output.trim().split('\n').pop() || '';
      return { changes: 1, lastInsertRowid: parseInt(lastLine.trim()) || 0 };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }
}

class MySqlDatabase {
  prepare(sql: string): MySqlPreparedStatement {
    return new MySqlPreparedStatement(sql);
  }
  exec(sql: string): void { mysqlExecMulti(sql); }
  pragma(_: string): void {}
  transaction(_fn: (...args: any[]) => any): (...args: any[]) => any {
    // 2026-08-31：同步 MySQL 路径下事务保护是**完全无效**的 —— mysqlExec() 每次调用都
    // execFileSync fork 一个新的 mysql CLI 进程，每个进程是独立连接：
    //   START TRANSACTION 开在进程 A 的连接上（该连接随进程退出立即关闭，事务隐式回滚）
    //   → 业务 SQL 各自在新连接上自动提交
    //   → COMMIT/ROLLBACK 作用在第四个空连接上
    // 原实现照样返回一个「看起来像事务」的函数，静默给出虚假的原子性保证。
    // 已知受害者：sla-scanner.ts 的 persistScan()（写 sla_warnings + notifications 两表），
    // 中途失败会留下脏数据。已改走 getAsyncDb()。
    // 这里改为直接抛错，防止再有人误用。
    throw new Error(
      '同步 MySQL 事务不可用：每条语句独立连接，事务无法跨语句生效。' +
      '请改用 getAsyncDb().transaction()（用 AsyncLocalStorage 绑定同一连接）。'
    );
  }
}

let mysqlDb: MySqlDatabase | null = null;

export function getDb(): Database.Database {
  if (USE_MYSQL) {
    if (!mysqlDb) mysqlDb = new MySqlDatabase();
    return mysqlDb as any;
  }
  return getSqliteDb();
}

export function isMysqlEnabled(): boolean { return USE_MYSQL; }

export async function testMysqlConnection(): Promise<{ success: boolean; error?: string; tables?: number }> {
  try {
    const output = mysqlExec('SHOW TABLES');
    if (!output) return { success: false, error: '查询失败' };
    return { success: true, tables: output.split('\n').filter(Boolean).length };
  } catch (e: any) {
    return { success: false, error: e.message || '连接失败' };
  }
}

export function resetMysqlPool() {}
