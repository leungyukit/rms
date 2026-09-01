#!/usr/bin/env node
/**
 * 全文检索 P1 迁移（命令行版）
 *
 * 与 src/lib/fts-migrations.ts 逻辑一致。
 *
 * 修的是：MySQL FULLTEXT 索引一个都没建成（实测 information_schema 查 0 行），
 * 且原 DDL 漏了 `WITH PARSER ngram` —— 不带 parser 的 FULLTEXT 对中文按空格切词，
 * 整句中文变一个 token，基本搜不出东西。
 *
 * 用法：
 *   MYSQL_PWD=$(cat .db_password) node scripts/migrate-fts.mjs [--dry-run]
 *
 * ⚠️ 建 FULLTEXT 索引会锁表重建，数据量大时耗时。本库当前数据量小，可直接跑。
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
  password: process.env.MYSQL_PWD || '',
};

if (!cfg.password) {
  console.error('[FATAL] 未提供密码。用法：MYSQL_PWD=$(cat .db_password) node scripts/migrate-fts.mjs');
  process.exit(1);
}

/**
 * [表, 索引名, 列清单]
 * ⚠️ 列清单必须与 src/app/api/search/route.ts 里的 MATCH() 逐字一致，
 * 否则 MySQL 报 "Can't find FULLTEXT index matching the column list"。
 */
const FT_INDEXES = [
  ['requirements', 'ft_requirements', 'title, description, business_unit, requester_name, benefit, solution'],
  ['knowledge_entries', 'ft_knowledge', 'title, question, answer, category, tags'],
  ['projects', 'ft_projects', 'name, description'],
];

const conn = await mysql.createConnection(cfg);
const applied = [];
const skipped = [];

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

try {
  // 前置检查：ngram parser 必须可用，否则建出来的索引对中文无效
  const [plugins] = await conn.execute(
    `SELECT PLUGIN_STATUS FROM information_schema.PLUGINS WHERE PLUGIN_NAME = 'ngram'`
  );
  if (plugins.length === 0 || plugins[0].PLUGIN_STATUS !== 'ACTIVE') {
    console.error('[FATAL] ngram parser 不可用，建出的 FULLTEXT 索引对中文无效。中止。');
    process.exit(1);
  }
  const [tok] = await conn.query(`SHOW VARIABLES LIKE 'ngram_token_size'`);
  console.log(`ngram parser: ACTIVE, ngram_token_size = ${tok[0]?.Value}`);

  for (const [table, index, cols] of FT_INDEXES) {
    if (!(await hasTable(table))) { skipped.push(`${table} 表不存在`); continue; }
    if (await hasIndex(table, index)) { skipped.push(`${index} 已存在`); continue; }
    const sql = `ALTER TABLE ${table} ADD FULLTEXT INDEX ${index} (${cols}) WITH PARSER ngram`;
    if (DRY_RUN) { applied.push(`[dry-run] ${sql}`); continue; }
    await conn.query(sql);
    applied.push(`FULLTEXT ${index} ON ${table}`);
  }

  console.log(`\n=== 已执行 (${applied.length}) ===`);
  applied.forEach(a => console.log('  ✓', a));
  console.log(`\n=== 跳过 (${skipped.length}) ===`);
  skipped.forEach(s => console.log('  -', s));

  // 自检：索引存在性 + parser 是否真的挂上了 ngram
  console.log('\n=== 自检 ===');
  let bad = 0;
  for (const [table, index] of FT_INDEXES) {
    if (!(await hasTable(table))) continue;
    const ok = await hasIndex(table, index);
    if (!ok) { bad++; console.log('  ✗ 缺失索引', `${table}.${index}`); continue; }
    const [p] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=? AND INDEX_TYPE='FULLTEXT'`,
      [cfg.database, table, index]
    );
    if (Number(p[0].cnt) === 0) { bad++; console.log('  ✗ 不是 FULLTEXT 类型', `${table}.${index}`); }
    else console.log('  ✓', `${table}.${index}`, 'FULLTEXT ok');
  }
  console.log(bad === 0 ? '  ✅ 全部通过' : `  ❌ ${bad} 项未通过`);
  process.exitCode = bad === 0 ? 0 : 1;
} finally {
  await conn.end();
}
