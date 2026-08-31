/**
 * 估时/Story Point · 表结构与配置初始化
 * 字段：story_points / estimate_hours / actual_hours
 * 索引：idx_requirements_story_points
 * 配置：team_velocity_sp / sp_allow_values / estimation_hours_per_day
 *
 * 设计依据：rms-docs/RMS-优化方案-阶段1-P0.md § 5.2
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureEstimationFields() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  // 1) 给 requirements 加 3 字段（MySQL 需查列存不存在后 ALTER，SQLite 直接 ALTER 会报错则忽略）
  const alterSqls = isMysql
    ? [
        `ALTER TABLE requirements ADD COLUMN story_points INT DEFAULT NULL`,
        `ALTER TABLE requirements ADD COLUMN estimate_hours DOUBLE DEFAULT NULL`,
        `ALTER TABLE requirements ADD COLUMN actual_hours DOUBLE DEFAULT NULL`,
      ]
    : [
        `ALTER TABLE requirements ADD COLUMN story_points INTEGER`,
        `ALTER TABLE requirements ADD COLUMN estimate_hours REAL`,
        `ALTER TABLE requirements ADD COLUMN actual_hours REAL`,
      ];

  for (const sql of alterSqls) {
    try {
      db.exec(sql);
    } catch (e: any) {
      // SQLite/MySQL 都可能在字段已存在时报错，吞掉
      const msg = String(e?.message || '');
      if (!/duplicate column|already exists/i.test(msg)) {
        // 其他错误要重抛
        throw e;
      }
    }
  }

  // 2) 索引
  if (isMysql) {
    db.exec(`CREATE INDEX idx_requirements_story_points ON requirements(story_points)`);
  } else {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_requirements_story_points ON requirements(story_points)`);
  }

  // 3) 3 个默认配置（INSERT IGNORE 幂等）
  const configs: Array<[string, string, string, string, string, string, number]> = [
    [
      'team_velocity_sp',
      '30',
      '团队周容量 (SP)',
      '用于排期饱和度预警，超过此值 workload 页会标红',
      'estimation',
      'number',
      300,
    ],
    [
      'sp_allow_values',
      '1,2,3,5,8,13,21',
      'SP 允许值',
      '逗号分隔，下拉选项来源。斐波那契 1/2/3/5/8/13/21',
      'estimation',
      'text',
      301,
    ],
    [
      'estimation_hours_per_day',
      '8',
      '人/天换算 (小时)',
      'estimate_hours / 此值 = 人天；用于甘特图和成本核算',
      'estimation',
      'number',
      302,
    ],
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
 * 读取估时相关配置
 */
export function getEstimationConfig() {
  ensureEstimationFields();
  const db = getDb();
  const rows = db.prepare(`SELECT \`key\`, \`value\` FROM system_config WHERE category = 'estimation'`).all() as any[];
  const cfg: Record<string, any> = {};
  for (const r of rows) cfg[r.key] = r.value;
  return {
    teamVelocitySp: parseInt(cfg.team_velocity_sp ?? '30', 10),
    spAllowValues: (cfg.sp_allow_values ?? '1,2,3,5,8,13,21')
      .split(',')
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => Number.isFinite(n)),
    hoursPerDay: parseFloat(cfg.estimation_hours_per_day ?? '8'),
  };
}

/**
 * 校验 story_points 是否在允许值内
 */
export function isValidStoryPoints(sp: number | null | undefined): boolean {
  if (sp == null) return true; // null 合法（未估时）
  const cfg = getEstimationConfig();
  return cfg.spAllowValues.includes(Number(sp));
}
