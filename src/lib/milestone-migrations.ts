/**
 * 项目里程碑 + 健康度 · 表结构与初始化
 * 依据：rms-docs/RMS-优化方案-阶段2-P1a.md § 2
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureMilestoneTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_milestones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        planned_date DATE NOT NULL,
        actual_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        weight INT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_by INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_milestone_project (project_id),
        KEY idx_milestone_status (status),
        KEY idx_milestone_date (planned_date)
      );
    `);
    // projects 加 health 列
    try { db.exec(`ALTER TABLE projects ADD COLUMN health_score INT DEFAULT NULL`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN health_level VARCHAR(10) DEFAULT NULL`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN health_updated_at DATETIME DEFAULT NULL`); } catch (e) {}
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        planned_date TEXT NOT NULL,
        actual_date TEXT,
        status TEXT DEFAULT 'pending',
        weight INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_milestone_project ON project_milestones(project_id);
      CREATE INDEX IF NOT EXISTS idx_milestone_status ON project_milestones(status);
      CREATE INDEX IF NOT EXISTS idx_milestone_date ON project_milestones(planned_date);
    `);
    const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('health_score')) db.exec(`ALTER TABLE projects ADD COLUMN health_score INTEGER`);
    if (!cols.includes('health_level')) db.exec(`ALTER TABLE projects ADD COLUMN health_level TEXT`);
    if (!cols.includes('health_updated_at')) db.exec(`ALTER TABLE projects ADD COLUMN health_updated_at DATETIME`);
  }

  // 健康度权重默认配置
  const weights: Array<[string, string]> = [
    ['health.weight.overdue', '30'],
    ['health.weight.completion', '30'],
    ['health.weight.risks', '25'],
    ['health.weight.milestones', '15'],
  ];
  for (const [k, v] of weights) {
    try {
      const c = db.prepare(`SELECT COUNT(*) c FROM system_config WHERE \`key\`=?`).get(k) as any;
      if (c.c === 0) {
        db.prepare(`INSERT INTO system_config(\`key\`, value, category) VALUES (?, ?, 'health')`).run(k, v);
      }
    } catch (e) {}
  }

  ensured = true;
}
