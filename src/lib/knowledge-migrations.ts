/**
 * 知识管理 · Schema 对齐与建设迁移
 *
 * 背景（2026-09-01 实测）：
 * 知识库有 4 处「代码列名 ≠ 实际列名」的硬崩，反馈/关联/详情/保鲜四条链路全 500。
 * 根因是历史迁移里的裸 `try{}catch(e){}` 把 DDL 失败全吞了，谁都没发现。
 *
 * 本模块的规矩：
 * 1. 幂等 —— 所有 DDL 先探 information_schema / PRAGMA，再决定要不要执行。
 * 2. 不吞异常 —— 探测过了还失败就是真故障，让它上抛。
 * 3. 双库 —— MySQL 和 SQLite 各一套分支，不共用 SQL 方言。
 * 4. 不删列不删数据 —— 老列一律保留只读兼容，回滚只需还原代码。
 *
 * 计划全文见 docs/KB-UPGRADE-PLAN.md
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

// ---------- 探测工具 ----------

/** 当前库名（MySQL）。用 DATABASE() 免得把库名写死。 */
function currentSchema(): string {
  const db = getDb();
  const row = db.prepare('SELECT DATABASE() AS db_name').get() as any;
  return row?.db_name || '';
}

/** MySQL：表是否存在 */
function mysqlTableExists(table: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`
  ).get(currentSchema(), table) as any;
  return Number(row?.cnt || 0) > 0;
}

/** MySQL：列是否存在 */
function mysqlColumnExists(table: string, column: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`
  ).get(currentSchema(), table, column) as any;
  return Number(row?.cnt || 0) > 0;
}

/** MySQL：索引是否存在 */
function mysqlIndexExists(table: string, index: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`
  ).get(currentSchema(), table, index) as any;
  return Number(row?.cnt || 0) > 0;
}

/** SQLite：列名清单 */
function sqliteColumns(table: string): string[] {
  const db = getDb();
  try {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c: any) => c.name);
  } catch {
    return [];
  }
}

/** SQLite：表是否存在 */
function sqliteTableExists(table: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type IN ('table','view') AND name = ?`
  ).get(table) as any;
  return Number(row?.cnt || 0) > 0;
}

/** 加列（幂等，双库） */
function addColumnIfMissing(table: string, column: string, mysqlDef: string, sqliteDef: string) {
  const db = getDb();
  if (isMysqlEnabled()) {
    if (!mysqlTableExists(table)) return;
    if (mysqlColumnExists(table, column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${mysqlDef}`);
  } else {
    if (!sqliteTableExists(table)) return;
    if (sqliteColumns(table).includes(column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqliteDef}`);
  }
}

/**
 * 改列名（幂等，双库）。
 * 只在「旧列存在 且 新列不存在」时动手，避免二次执行把数据搞乱。
 */
function renameColumnIfNeeded(table: string, from: string, to: string, mysqlDef: string) {
  const db = getDb();
  if (isMysqlEnabled()) {
    if (!mysqlTableExists(table)) return;
    const hasOld = mysqlColumnExists(table, from);
    const hasNew = mysqlColumnExists(table, to);
    if (!hasOld || hasNew) return;
    // CHANGE 而非 RENAME COLUMN：兼容 MySQL 5.7
    db.exec(`ALTER TABLE ${table} CHANGE ${from} ${to} ${mysqlDef}`);
  } else {
    if (!sqliteTableExists(table)) return;
    const cols = sqliteColumns(table);
    if (!cols.includes(from) || cols.includes(to)) return;
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}

/** 建索引（幂等，双库） */
function createIndexIfMissing(table: string, index: string, columns: string) {
  const db = getDb();
  if (isMysqlEnabled()) {
    if (!mysqlTableExists(table)) return;
    if (mysqlIndexExists(table, index)) return;
    db.exec(`CREATE INDEX ${index} ON ${table}(${columns})`);
  } else {
    if (!sqliteTableExists(table)) return;
    db.exec(`CREATE INDEX IF NOT EXISTS ${index} ON ${table}(${columns})`);
  }
}

// ---------- P0：崩溃修复 ----------

/**
 * knowledge_feedback：列名 knowledge_id → entry_id
 *
 * 代码里全程用 entry_id（feedback/route.ts、[id]/route.ts），
 * 而 seed 建表时写的是 knowledge_id → 反馈接口 100% 500。
 * 选择改 DB 而不是改代码：entry_id 与 knowledge_review_tasks.entry_id 命名一致。
 */
function fixKnowledgeFeedbackSchema() {
  renameColumnIfNeeded('knowledge_feedback', 'knowledge_id', 'entry_id', 'INT NOT NULL');
  createIndexIfMissing('knowledge_feedback', 'idx_kf_entry', 'entry_id');
  createIndexIfMissing('knowledge_feedback', 'idx_kf_user', 'user_id');
}

/**
 * knowledge_relations：补 weight 列
 *
 * [id]/route.ts 里 `ORDER BY kr.weight DESC` 而表里没这列 → 详情页关联区 500。
 *
 * ⚠️ 注意：这里**不改** source_id/target_id 的列名。
 * 代码里写的 source_entry_id/target_entry_id 是错的，但 graph/route.ts 已经在用
 * source_id/target_id，改 DB 会连带弄坏知识地图。所以 DB 保持原样，改代码。
 */
function fixKnowledgeRelationsSchema() {
  addColumnIfMissing('knowledge_relations', 'weight', 'DOUBLE NOT NULL DEFAULT 1.0', 'REAL NOT NULL DEFAULT 1.0');
  createIndexIfMissing('knowledge_relations', 'idx_kr_source', 'source_id');
  createIndexIfMissing('knowledge_relations', 'idx_kr_target', 'target_id');
}

/**
 * knowledge_entries：补代码已在 SELECT / UPDATE 但表里没有的列
 * - approved_by / approved_at：详情接口 JOIN users 用
 * - confidence：PUT 的可更新字段白名单里有
 * - content_format：正文富文本化的前置（markdown / html / plain）
 */
function fixKnowledgeEntriesSchema() {
  addColumnIfMissing('knowledge_entries', 'approved_by', 'INT NULL', 'INTEGER');
  addColumnIfMissing('knowledge_entries', 'approved_at', 'DATETIME NULL', 'DATETIME');
  addColumnIfMissing('knowledge_entries', 'confidence', 'DOUBLE NULL', 'REAL');
  addColumnIfMissing(
    'knowledge_entries',
    'content_format',
    "VARCHAR(20) NOT NULL DEFAULT 'markdown'",
    "TEXT NOT NULL DEFAULT 'markdown'"
  );
  createIndexIfMissing('knowledge_entries', 'idx_ke_status_updated', 'status, updated_at');
  createIndexIfMissing('knowledge_entries', 'idx_ke_category', 'category');
}

/**
 * knowledge_entries：补保鲜列
 *
 * freshness-migrations.ts 里用 try{}catch{} 加这 5 列，实测一列都没加上
 * （information_schema 查全为 0）→ scan-stale / review 全挂。这里显式补齐。
 */
function fixFreshnessColumns() {
  addColumnIfMissing(
    'knowledge_entries',
    'freshness_status',
    "VARCHAR(20) NOT NULL DEFAULT 'fresh'",
    "TEXT NOT NULL DEFAULT 'fresh'"
  );
  addColumnIfMissing('knowledge_entries', 'last_reviewed_at', 'DATETIME NULL', 'DATETIME');
  addColumnIfMissing('knowledge_entries', 'last_reviewed_by', 'INT NULL', 'INTEGER');
  addColumnIfMissing('knowledge_entries', 'freshness_months', 'INT NOT NULL DEFAULT 6', 'INTEGER NOT NULL DEFAULT 6');
  addColumnIfMissing('knowledge_entries', 'next_review_at', 'DATETIME NULL', 'DATETIME');
  createIndexIfMissing('knowledge_entries', 'idx_ke_freshness', 'freshness_status, next_review_at');
}

/**
 * knowledge_entries：补 AI 生成/审阅列
 *
 * ai-knowledge-migrations.ts 用 try{}catch{} 加这 4 列，实测一列都没落地
 * → /api/knowledge/[id]/review 读 entry.ai_generated 直接 ERROR 1054。
 */
function fixAiReviewColumns() {
  addColumnIfMissing('knowledge_entries', 'ai_generated', 'TINYINT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('knowledge_entries', 'source_job_id', 'INT NULL', 'INTEGER');
  addColumnIfMissing('knowledge_entries', 'reviewed_by', 'INT NULL', 'INTEGER');
  addColumnIfMissing('knowledge_entries', 'reviewed_at', 'DATETIME NULL', 'DATETIME');
  createIndexIfMissing('knowledge_entries', 'idx_ke_ai_review', 'ai_generated, status');
}

/**
 * 知识分类树 + 分类级 ACL
 *
 * 改造前知识库只有 hasFunctionalAccess() 一道粗门，拿到功能权限就能看全部知识，
 * role_project_access 只管项目不管知识 —— 等于「进来即全见」。
 *
 * path 存物料路径（如 /1/4/9/），方便按子树查询而不用递归 CTE（兼容 MySQL 5.7）。
 * is_restricted=1 的分类才需要显式 ACL 授权，详见 knowledge-acl.ts 的取舍说明。
 */
function createCategoryTables() {
  const db = getDb();

  if (isMysqlEnabled()) {
    if (!mysqlTableExists('knowledge_categories')) {
      db.exec(`
        CREATE TABLE knowledge_categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          parent_id INT NULL,
          path VARCHAR(500) NOT NULL DEFAULT '/',
          description TEXT,
          sort_order INT NOT NULL DEFAULT 0,
          is_restricted TINYINT NOT NULL DEFAULT 0,
          created_by INT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          KEY idx_kc_parent (parent_id),
          KEY idx_kc_path (path),
          KEY idx_kc_restricted (is_restricted)
        )
      `);
    }
    if (!mysqlTableExists('knowledge_category_acl')) {
      db.exec(`
        CREATE TABLE knowledge_category_acl (
          id INT AUTO_INCREMENT PRIMARY KEY,
          category_id INT NOT NULL,
          role_name VARCHAR(50) NOT NULL,
          can_read TINYINT NOT NULL DEFAULT 1,
          can_write TINYINT NOT NULL DEFAULT 0,
          can_manage TINYINT NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_kca (category_id, role_name),
          KEY idx_kca_role (role_name, can_read)
        )
      `);
    }
  } else {
    if (!sqliteTableExists('knowledge_categories')) {
      db.exec(`
        CREATE TABLE knowledge_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          parent_id INTEGER,
          path TEXT NOT NULL DEFAULT '/',
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_restricted INTEGER NOT NULL DEFAULT 0,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_kc_parent ON knowledge_categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_kc_path ON knowledge_categories(path);
        CREATE INDEX IF NOT EXISTS idx_kc_restricted ON knowledge_categories(is_restricted);
      `);
    }
    if (!sqliteTableExists('knowledge_category_acl')) {
      db.exec(`
        CREATE TABLE knowledge_category_acl (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL,
          role_name TEXT NOT NULL,
          can_read INTEGER NOT NULL DEFAULT 1,
          can_write INTEGER NOT NULL DEFAULT 0,
          can_manage INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(category_id, role_name)
        );
        CREATE INDEX IF NOT EXISTS idx_kca_role ON knowledge_category_acl(role_name, can_read);
      `);
    }
  }

  // 知识条目挂到分类树；老 category 字符串列保留只读兼容，不删
  addColumnIfMissing('knowledge_entries', 'category_id', 'INT NULL', 'INTEGER');
  createIndexIfMissing('knowledge_entries', 'idx_ke_category_id', 'category_id');
}

// ---------- 入口 ----------

export function ensureKnowledgeTables() {
  if (ensured) return;

  fixKnowledgeFeedbackSchema();
  fixKnowledgeRelationsSchema();
  fixKnowledgeEntriesSchema();
  fixFreshnessColumns();
  fixAiReviewColumns();
  createCategoryTables();

  ensured = true;
}

/** 测试/迁移校验用：强制重跑 */
export function resetKnowledgeMigrationCache() {
  ensured = false;
}

// ---------- 自检（给 /api/admin/migrations/verify 用） ----------

export interface SchemaCheck {
  target: string;
  kind: 'column' | 'index' | 'table';
  present: boolean;
}

const REQUIRED_COLUMNS: Array<[string, string]> = [
  ['knowledge_feedback', 'entry_id'],
  ['knowledge_relations', 'weight'],
  ['knowledge_entries', 'approved_by'],
  ['knowledge_entries', 'approved_at'],
  ['knowledge_entries', 'confidence'],
  ['knowledge_entries', 'content_format'],
  ['knowledge_entries', 'freshness_status'],
  ['knowledge_entries', 'last_reviewed_at'],
  ['knowledge_entries', 'last_reviewed_by'],
  ['knowledge_entries', 'freshness_months'],
  ['knowledge_entries', 'next_review_at'],
  ['knowledge_entries', 'ai_generated'],
  ['knowledge_entries', 'source_job_id'],
  ['knowledge_entries', 'reviewed_by'],
  ['knowledge_entries', 'reviewed_at'],
  ['knowledge_entries', 'category_id'],
];

const REQUIRED_TABLES = ['knowledge_categories', 'knowledge_category_acl'];

/** 逐项核对 P0 要求的 schema 是否真的落地了 */
export function verifyKnowledgeSchema(): { ok: boolean; checks: SchemaCheck[] } {
  const checks: SchemaCheck[] = [];
  const isMysql = isMysqlEnabled();

  for (const [table, column] of REQUIRED_COLUMNS) {
    const present = isMysql
      ? mysqlColumnExists(table, column)
      : sqliteColumns(table).includes(column);
    checks.push({ target: `${table}.${column}`, kind: 'column', present });
  }

  for (const table of REQUIRED_TABLES) {
    const present = isMysql ? mysqlTableExists(table) : sqliteTableExists(table);
    checks.push({ target: table, kind: 'table', present });
  }

  // 顺带确认「不该存在」的错列名真的没被误建
  for (const [table, column] of [
    ['knowledge_feedback', 'knowledge_id'],
    ['knowledge_relations', 'source_entry_id'],
  ] as Array<[string, string]>) {
    const present = isMysql
      ? mysqlColumnExists(table, column)
      : sqliteColumns(table).includes(column);
    checks.push({ target: `${table}.${column} (应已废弃)`, kind: 'column', present: !present });
  }

  return { ok: checks.every(c => c.present), checks };
}
