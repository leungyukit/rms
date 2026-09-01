#!/usr/bin/env node
/**
 * 标签归一化键回填（P3）
 *
 * 给 tags.norm_key 回填归一化键，并报告重复变体
 * （如「权限管理」/「权限管理 」全半角空格差异会各算一个标签）。
 *
 * 逻辑与 src/lib/tag-normalize.ts 保持一致。
 *
 * 用法：MYSQL_PWD=$(cat .db_password) node scripts/backfill-tag-keys.mjs [--dry-run]
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
  console.error('[FATAL] 用法：MYSQL_PWD=$(cat .db_password) node scripts/backfill-tag-keys.mjs');
  process.exit(1);
}

// ---- 与 src/lib/tag-normalize.ts 一致 ----
function toHalfWidth(s) {
  return String(s)
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}
function normalizeTagKey(raw) {
  if (!raw) return '';
  return toHalfWidth(raw).trim().replace(/\s+/g, ' ').toLowerCase();
}

const conn = await mysql.createConnection(cfg);

try {
  const [tags] = await conn.query(`SELECT id, name, norm_key FROM tags ORDER BY id`);
  console.log(`共 ${tags.length} 条标签\n`);

  // 按归一化键分组，找重复变体
  const groups = new Map();
  for (const t of tags) {
    const key = normalizeTagKey(t.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const dupes = [...groups.entries()].filter(([, list]) => list.length > 1);
  if (dupes.length > 0) {
    console.log('=== ⚠️ 发现重复变体（归一化后同一标签）===');
    for (const [key, list] of dupes) {
      console.log(`  键「${key}」: ${list.map(t => `#${t.id} "${t.name}"`).join(' , ')}`);
    }
    console.log('  → 本脚本只回填 norm_key，不自动合并（合并涉及改引用关系，需人工确认）\n');
  } else {
    console.log('=== ✓ 无重复变体 ===\n');
  }

  let updated = 0;
  let unchanged = 0;
  for (const t of tags) {
    const key = normalizeTagKey(t.name);
    if (t.norm_key === key) { unchanged++; continue; }
    if (DRY_RUN) {
      console.log(`  [dry-run] #${t.id} "${t.name}" → norm_key="${key}"`);
      updated++;
      continue;
    }
    await conn.execute(`UPDATE tags SET norm_key = ? WHERE id = ?`, [key, t.id]);
    updated++;
  }

  console.log(`=== 回填结果 ===`);
  console.log(`  更新 ${updated} 条，已一致 ${unchanged} 条`);

  // 自检
  if (!DRY_RUN) {
    const [missing] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM tags WHERE norm_key IS NULL OR norm_key = ''`
    );
    const bad = Number(missing[0].cnt);
    console.log(bad === 0 ? '  ✅ 全部标签均有归一化键' : `  ❌ 仍有 ${bad} 条缺键`);
    process.exitCode = bad === 0 ? 0 : 1;
  }
} finally {
  await conn.end();
}
