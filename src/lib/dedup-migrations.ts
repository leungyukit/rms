/**
 * 需求去重 · 表结构 + 系统配置
 * 依据：rms-docs/RMS-优化方案-阶段1-P0.md § 2.2
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureDedupFields() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  // 1) requirements 加 merged_into / merged_at
  const addMergedInto = isMysql
    ? `ALTER TABLE requirements ADD COLUMN merged_into INT DEFAULT NULL`
    : `ALTER TABLE requirements ADD COLUMN merged_into INTEGER REFERENCES requirements(id) ON DELETE SET NULL`;
  const addMergedAt = isMysql
    ? `ALTER TABLE requirements ADD COLUMN merged_at DATETIME DEFAULT NULL`
    : `ALTER TABLE requirements ADD COLUMN merged_at DATETIME`;

  for (const sql of [addMergedInto, addMergedAt]) {
    try {
      db.exec(sql);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/duplicate column|already exists/i.test(msg)) throw e;
    }
  }

  // 2) 索引（MySQL 用普通索引，SQLite 用部分索引）
  if (isMysql) {
    try { db.exec(`CREATE INDEX idx_requirements_merged ON requirements(merged_into)`); } catch {}
  } else {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_requirements_merged ON requirements(merged_into) WHERE merged_into IS NOT NULL`);
  }

  // 3) 系统配置：3 个开关
  const configs: Array<[string, string, string, string, string, string, number]> = [
    ['dup_similarity_threshold', '0.6', '标题相似度阈值', '0-1，超过此值视为疑似重复', 'duplicate', 'number', 200],
    ['dup_check_on_create', '1', '创建时实时检查', '0/1，关闭后只依赖后台扫描', 'duplicate', 'boolean', 201],
    ['dup_fuzz_min_len', '6', '最小触发长度', '标题字符数低于此值不触发检查，避免误报', 'duplicate', 'number', 202],
  ];
  const insertSql = isMysql
    ? `INSERT INTO system_config (\`key\`, \`value\`, \`label\`, \`description\`, \`category\`, \`type\`, \`sort_order\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`
    : `INSERT IGNORE INTO system_config (key, value, label, description, category, type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
  for (const [k, v, l, d, c, t, s] of configs) {
    db.prepare(insertSql).run(k, v, l, d, c, t, s);
  }

  ensured = true;
}

export function getDedupConfig() {
  ensureDedupFields();
  const db = getDb();
  const rows = db.prepare(
    `SELECT \`key\`, value FROM system_config WHERE category = 'duplicate'`
  ).all() as any[];
  const cfg: Record<string, any> = {};
  for (const r of rows) cfg[r.key] = r.value;
  return {
    threshold: parseFloat(cfg.dup_similarity_threshold ?? '0.6'),
    checkOnCreate: cfg.dup_check_on_create === '1' || cfg.dup_check_on_create === 'true',
    minLen: parseInt(cfg.dup_fuzz_min_len ?? '6', 10),
  };
}
