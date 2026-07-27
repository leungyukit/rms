import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'rms123456';
const USE_MYSQL = process.env.DB_TYPE === 'mysql';

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

function mysqlExec(sql: string): string {
  try {
    const escaped = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`');
    const cmd = `mysql -h ${MYSQL_HOST} -P ${MYSQL_PORT} -u ${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE} -N -B -e "${escaped}" 2>/dev/null`;
    const out = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
    return out;
  } catch (e: any) {
    return '';
  }
}

function mysqlExecMulti(sql: string): void {
  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    mysqlExec(stmt);
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

function escapeMysqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') result += '\\\\';
    else if (ch === "'") result += "\\'";
    else if (ch === '\0') result += '';
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

class MySqlAsyncPreparedStatement {
  private baseSql: string;
  constructor(sql: string) {
    this.baseSql = sql;
  }
  private escapeVal(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (val instanceof Date) return "'" + val.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '') + "'";
    const str = String(val);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '\\') result += '\\\\';
      else if (ch === "'") result += "\\'";
      else if (ch === '\0') result += '';
      else if (ch === '\n') result += '\\n';
      else if (ch === '\r') result += '\\r';
      else result += ch;
    }
    return "'" + result + "'";
  }
  private buildSql(params: any[]): string {
    if (params.length === 0) return this.baseSql;
    let i = 0;
    return this.baseSql.replace(/\?/g, () => {
      if (i >= params.length) return '?';
      return this.escapeVal(params[i++]);
    });
  }
  async get(...params: any[]): Promise<any> {
    const pool = getMysql2Pool();
    const sql = this.buildSql(params);
    const [rows] = await pool.query(sql);
    return rows[0];
  }
  async all(...params: any[]): Promise<any[]> {
    const pool = getMysql2Pool();
    const sql = this.buildSql(params);
    const [rows] = await pool.query(sql);
    return rows as any[];
  }
  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const pool = getMysql2Pool();
    const sql = this.buildSql(params);
    const [result] = await pool.query(sql);
    return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
  }
}

class MySqlAsyncDatabase {
  prepare(sql: string): MySqlAsyncPreparedStatement {
    return new MySqlAsyncPreparedStatement(sql);
  }
  async exec(sql: string): Promise<void> {
    const pool = getMysql2Pool();
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
  }
  async transaction(fn: (...args: any[]) => any): Promise<(...args: any[]) => Promise<any>> {
    return async (...args: any[]) => {
      const pool = getMysql2Pool();
      const conn = await pool.getConnection();
      try {
        await conn.query('START TRANSACTION');
        const result = await fn(...args);
        await conn.query('COMMIT');
        return result;
      } catch (e) {
        await conn.query('ROLLBACK');
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

class SqliteAsyncDatabase {
  private inner: any;
  constructor() { this.inner = getSqliteDb(); }
  prepare(sql: string): SqliteAsyncPreparedStatement {
    return new SqliteAsyncPreparedStatement(this.inner.prepare(sql));
  }
  async exec(sql: string): Promise<void> { this.inner.exec(sql); }
  async transaction(fn: (...args: any[]) => any): Promise<(...args: any[]) => Promise<any>> {
    return async (...args: any[]) => {
      // better-sqlite3 的 transaction 期望同步函数，但我们需要支持异步
      // 所以我们需要手动处理事务
      const conn = this.inner;
      conn.exec('BEGIN TRANSACTION');
      try {
        const result = await fn(...args);
        conn.exec('COMMIT');
        return result;
      } catch (e) {
        conn.exec('ROLLBACK');
        throw e;
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
    this.baseSql = sql;
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
        const descOutput = mysqlExec(`DESCRIBE ${tableMatch[1]}`);
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
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    return (...args: any[]) => {
      mysqlExec('START TRANSACTION');
      try {
        const result = fn(...args);
        mysqlExec('COMMIT');
        return result;
      } catch (e) {
        mysqlExec('ROLLBACK');
        throw e;
      }
    };
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
