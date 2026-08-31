/**
 * SLA 预警 · 表结构与配置初始化
 * 建表：sla_warnings
 * 配置：sla_approaching_pct / sla_overdue_grace_days / sla_escalate_after_days / sla_scan_cron
 *
 * 设计依据：rms-docs/RMS-优化方案-阶段1-P0.md § 1.2
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureSlaTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sla_warnings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        warning_type VARCHAR(20) NOT NULL,
        warning_level INT NOT NULL,
        planned_end DATETIME NOT NULL,
        days_diff DOUBLE NOT NULL,
        notified_user_ids TEXT NOT NULL,
        acknowledged_by INT DEFAULT NULL,
        acknowledged_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sla_warnings_req (requirement_id),
        INDEX idx_sla_warnings_type_level (warning_type, warning_level),
        INDEX idx_sla_warnings_unack (acknowledged_at)
      )
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sla_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        warning_type TEXT NOT NULL,
        warning_level INTEGER NOT NULL,
        planned_end TEXT NOT NULL,
        days_diff REAL NOT NULL,
        notified_user_ids TEXT NOT NULL,
        acknowledged_by INTEGER,
        acknowledged_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sla_warnings_req ON sla_warnings(requirement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sla_warnings_type_level ON sla_warnings(warning_type, warning_level)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sla_warnings_unack ON sla_warnings(acknowledged_at) WHERE acknowledged_at IS NULL`);
  }

// 4 个默认配置（INSERT IGNORE 幂等）+ 3 个优先级规则（JSON）
  const configs: Array<[string, string, string, string, string, string, number]> = [
    ['sla_approaching_pct', '80', '即将超期阈值 (%)', '距离计划完成日的剩余时间百分比，低于此值触发 approaching 预警', 'sla', 'number', 100],
    ['sla_overdue_grace_days', '0', '超期宽限天数', '计划完成日之后宽限多少天才算真正超期', 'sla', 'number', 101],
    ['sla_escalate_after_days', '3', '升级超期阈值 (天)', '超期超过此天数自动升级（推给验证人+接收人）', 'sla', 'number', 102],
    ['sla_scan_cron', '0 9 * * *', '扫描 Cron 表达式', '默认每天上午 9 点扫描', 'sla', 'text', 103],
    ['sla_rules_high',   '{"approachingPct":50,"overdueGraceDays":0,"escalateAfterDays":2}', '高优先级规则 (JSON)', '{"approachingPct":50, "overdueGraceDays":0, "escalateAfterDays":2}', 'sla', 'text', 200],
    ['sla_rules_medium', '{"approachingPct":70,"overdueGraceDays":1,"escalateAfterDays":3}', '中优先级规则 (JSON)', '{"approachingPct":70, "overdueGraceDays":1, "escalateAfterDays":3}', 'sla', 'text', 201],
    ['sla_rules_low',    '{"approachingPct":90,"overdueGraceDays":2,"escalateAfterDays":5}', '低优先级规则 (JSON)', '{"approachingPct":90, "overdueGraceDays":2, "escalateAfterDays":5}', 'sla', 'text', 202],
  ];
  for (const [key, value, label, description, category, type, sort_order] of configs) {
    db.prepare(
      isMysql
        ? `INSERT INTO system_config (\`key\`, \`value\`, \`label\`, \`description\`, \`category\`, \`type\`, \`sort_order\`)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), sort_order = VALUES(sort_order)`
        : `INSERT OR IGNORE INTO system_config (key, value, label, description, category, type, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(key, value, label, description, category, type, sort_order);
  }

  ensured = true;
}

/**
 * 读取 SLA 配置
 */
export function getSlaConfig() {
  ensureSlaTables();
  const db = getDb();
  const rows = db.prepare(`SELECT \`key\`, \`value\` FROM system_config WHERE category = 'sla'`).all() as any[];
  const cfg: Record<string, any> = {};
  for (const r of rows) cfg[r.key] = r.value;

  const parseRules = (raw: string | undefined, fallback: { approachingPct: number; overdueGraceDays: number; escalateAfterDays: number }) => {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return {
        approachingPct: typeof parsed.approachingPct === 'number' ? parsed.approachingPct : fallback.approachingPct,
        overdueGraceDays: typeof parsed.overdueGraceDays === 'number' ? parsed.overdueGraceDays : fallback.overdueGraceDays,
        escalateAfterDays: typeof parsed.escalateAfterDays === 'number' ? parsed.escalateAfterDays : fallback.escalateAfterDays,
      };
    } catch { return fallback; }
  };

  const defaultRules = {
    approachingPct: parseFloat(cfg.sla_approaching_pct ?? '80'),
    overdueGraceDays: parseFloat(cfg.sla_overdue_grace_days ?? '0'),
    escalateAfterDays: parseFloat(cfg.sla_escalate_after_days ?? '3'),
  };

  return {
    scanCron: cfg.sla_scan_cron ?? '0 9 * * *',
    rules: {
      high:   parseRules(cfg.sla_rules_high,   { ...defaultRules, approachingPct: 50 }),
      medium: parseRules(cfg.sla_rules_medium, defaultRules),
      low:    parseRules(cfg.sla_rules_low,    { ...defaultRules, approachingPct: 90, escalateAfterDays: 5 }),
    },
    defaultRules,
  };
}
