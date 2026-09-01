#!/usr/bin/env node
/**
 * 知识管理 P0 schema 迁移（命令行版）
 *
 * 与 src/lib/knowledge-migrations.ts 逻辑一致。存在两份的原因：
 * 应用层 ensureKnowledgeTables() 只在首次命中 API 时自愈，
 * 而部署/巡检时需要一个能主动跑、能看到结果的入口（项目没装 tsx）。
 *
 * 用法：
 *   MYSQL_PWD=$(cat .db_password) node scripts/migrate-knowledge.mjs [--dry-run]
 *
 * 幂等：所有 DDL 先查 information_schema 再决定执行。
 * 不删列、不删数据。
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
  return env;
}

const fileEnv = loadEnvFile(new URL('../.env.systemd', import.meta.url).pathname);
const cfg = {
  host: process.env.MYSQL_HOST || fileEnv.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || fileEnv.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || fileEnv.MYSQL_USER || 'rms',
  database: process.env.MYSQL_DATABASE || fileEnv.MYSQL_DATABASE || 'rms',
  // 密码只从环境读（MYSQL_PWD），不接受命令行传入，避免进 ps / shell history
  password: process.env.MYSQL_PWD || '',
};

if (!cfg.password) {
  console.error('[FATAL] 未提供密码。用法：MYSQL_PWD=$(cat .db_password) node scripts/migrate-knowledge.mjs');
  process.exit(1);
}

/** 需要补的列：[表, 列, 定义] */
const COLUMNS = [
  // 详情接口 SELECT 了但表里没有 → ERROR 1054
  ['knowledge_entries', 'approved_by', 'INT NULL'],
  ['knowledge_entries', 'approved_at', 'DATETIME NULL'],
  ['knowledge_entries', 'confidence', 'DOUBLE NULL'],
  ['knowledge_entries', 'content_format', "VARCHAR(20) NOT NULL DEFAULT 'markdown'"],
  // 保鲜（freshness-migrations 的 try/catch 一列都没加上）
  ['knowledge_entries', 'freshness_status', "VARCHAR(20) NOT NULL DEFAULT 'fresh'"],
  ['knowledge_entries', 'last_reviewed_at', 'DATETIME NULL'],
  ['knowledge_entries', 'last_reviewed_by', 'INT NULL'],
  ['knowledge_entries', 'freshness_months', 'INT NOT NULL DEFAULT 6'],
  ['knowledge_entries', 'next_review_at', 'DATETIME NULL'],
  // AI 生成 / 审阅（ai-knowledge-migrations 同样一列都没加上）
  ['knowledge_entries', 'ai_generated', 'TINYINT NOT NULL DEFAULT 0'],
  ['knowledge_entries', 'source_job_id', 'INT NULL'],
  ['knowledge_entries', 'reviewed_by', 'INT NULL'],
  ['knowledge_entries', 'reviewed_at', 'DATETIME NULL'],
  // 详情页 ORDER BY kr.weight 而表里没这列
  ['knowledge_relations', 'weight', 'DOUBLE NOT NULL DEFAULT 1.0'],
  // P2：知识条目挂到分类树；老 category 字符串列保留只读兼容，不删
  ['knowledge_entries', 'category_id', 'INT NULL'],
  // P3：标签归一化键。存量 31 条需求标签可能有重复变体，
  // 所以先加普通索引不加 UNIQUE，去重交给应用层，避免迁移直接失败。
  ['tags', 'norm_key', 'VARCHAR(100) NULL'],
];

/** 要改名的列：[表, 旧名, 新名, 定义] */
const RENAMES = [
  // 代码全程用 entry_id，seed 建表写的 knowledge_id → 反馈接口 100% 500
  ['knowledge_feedback', 'knowledge_id', 'entry_id', 'INT NOT NULL'],
];

/** 索引：[表, 索引名, 列] */
const INDEXES = [
  ['knowledge_feedback', 'idx_kf_entry', 'entry_id'],
  ['knowledge_feedback', 'idx_kf_user', 'user_id'],
  ['knowledge_relations', 'idx_kr_source', 'source_id'],
  ['knowledge_relations', 'idx_kr_target', 'target_id'],
  ['knowledge_entries', 'idx_ke_status_updated', 'status, updated_at'],
  ['knowledge_entries', 'idx_ke_category', 'category'],
  ['knowledge_entries', 'idx_ke_freshness', 'freshness_status, next_review_at'],
  ['knowledge_entries', 'idx_ke_ai_review', 'ai_generated, status'],
  ['knowledge_entries', 'idx_ke_category_id', 'category_id'],
  ['tags', 'idx_tags_norm', 'norm_key'],
];

/**
 * P2 分类树 + 分类级 ACL 建表。
 *
 * path 存物料路径（/1/4/9/）以便按子树查询，不用递归 CTE（兼容 MySQL 5.7）。
 * is_restricted=1 的分类才需要显式 ACL 授权，取舍详见 src/lib/knowledge-acl.ts。
 */
const TABLES = [
  ['knowledge_categories', `
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
    )`],
  ['knowledge_category_acl', `
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
    )`],
  ['knowledge_tags', `
    CREATE TABLE knowledge_tags (
      entry_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entry_id, tag_id),
      KEY idx_kt_tag (tag_id)
    )`],
  ['knowledge_versions', `
    CREATE TABLE knowledge_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entry_id INT NOT NULL,
      version_no INT NOT NULL,
      title VARCHAR(500),
      question TEXT,
      answer TEXT,
      content TEXT,
      category VARCHAR(100),
      category_id INT NULL,
      tags_snapshot TEXT,
      type VARCHAR(20),
      status VARCHAR(20),
      change_summary VARCHAR(255),
      changed_by INT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_kv (entry_id, version_no),
      KEY idx_kv_entry (entry_id, version_no)
    )`],
];

const conn = await mysql.createConnection(cfg);
const applied = [];
const skipped = [];

async function hasColumn(table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [cfg.database, table, column]
  );
  return Number(rows[0].cnt) > 0;
}

async function hasIndex(table, index) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [cfg.database, table, index]
  );
  return Number(rows[0].cnt) > 0;
}

async function hasTable(table) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [cfg.database, table]
  );
  return Number(rows[0].cnt) > 0;
}

async function run(label, sql) {
  if (DRY_RUN) {
    applied.push(`[dry-run] ${label}`);
    return;
  }
  await conn.query(sql);
  applied.push(label);
}

try {
  // 0. 建表（先做，后面的加列/索引依赖它）
  for (const [table, ddl] of TABLES) {
    if (await hasTable(table)) { skipped.push(`${table} 表已存在`); continue; }
    await run(`CREATE TABLE ${table}`, ddl);
  }

  // 1. 改列名（先做，后面的索引依赖新列名）
  for (const [table, from, to, def] of RENAMES) {
    const hasOld = await hasColumn(table, from);
    const hasNew = await hasColumn(table, to);
    if (hasNew) { skipped.push(`${table}.${to} 已存在`); continue; }
    if (!hasOld) { skipped.push(`${table}.${from} 不存在，跳过改名`); continue; }
    await run(`RENAME ${table}.${from} → ${to}`, `ALTER TABLE ${table} CHANGE ${from} ${to} ${def}`);
  }

  // 2. 补列
  for (const [table, column, def] of COLUMNS) {
    if (await hasColumn(table, column)) { skipped.push(`${table}.${column} 已存在`); continue; }
    await run(`ADD ${table}.${column}`, `ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }

  // 3. 建索引
  for (const [table, index, cols] of INDEXES) {
    if (await hasIndex(table, index)) { skipped.push(`${index} 已存在`); continue; }
    await run(`INDEX ${index} ON ${table}(${cols})`, `CREATE INDEX ${index} ON ${table}(${cols})`);
  }

  console.log(`\n=== 已执行 (${applied.length}) ===`);
  applied.forEach(a => console.log('  ✓', a));
  console.log(`\n=== 跳过 (${skipped.length}) ===`);
  skipped.forEach(s => console.log('  -', s));

  // 4. 自检
  console.log('\n=== 自检 ===');
  let bad = 0;
  for (const [table] of TABLES) {
    const ok = await hasTable(table);
    if (!ok) { bad++; console.log('  ✗ 缺失表', table); }
  }
  for (const [table, column] of [...COLUMNS.map(c => [c[0], c[1]]), ['knowledge_feedback', 'entry_id']]) {
    const ok = await hasColumn(table, column);
    if (!ok) { bad++; console.log('  ✗ 缺失', `${table}.${column}`); }
  }
  // 错列名不该存在
  for (const [table, column] of [['knowledge_feedback', 'knowledge_id']]) {
    if (await hasColumn(table, column)) { bad++; console.log('  ✗ 废弃列仍在', `${table}.${column}`); }
  }
  console.log(bad === 0 ? '  ✅ 全部通过' : `  ❌ ${bad} 项未通过`);
  process.exitCode = bad === 0 ? 0 : 1;
} finally {
  await conn.end();
}
