/**
 * 项目风险登记 · 表结构与初始化
 * 依据：rms-docs/RMS-优化方案-阶段2-P1a.md § 3
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureRiskTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_risks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(30) DEFAULT 'technical',
        level VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'open',
        strategy VARCHAR(20) DEFAULT 'mitigate',
        owner_id INT DEFAULT NULL,
        impact TEXT,
        mitigation_plan TEXT,
        resolved_note TEXT,
        resolved_at DATETIME,
        created_by INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_risk_project (project_id),
        KEY idx_risk_status (status),
        KEY idx_risk_level (level)
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_risks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        type TEXT DEFAULT 'technical',
        level TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        strategy TEXT DEFAULT 'mitigate',
        owner_id INTEGER,
        impact TEXT DEFAULT '',
        mitigation_plan TEXT DEFAULT '',
        resolved_note TEXT DEFAULT '',
        resolved_at DATETIME,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_risk_project ON project_risks(project_id);
      CREATE INDEX IF NOT EXISTS idx_risk_status ON project_risks(status);
      CREATE INDEX IF NOT EXISTS idx_risk_level ON project_risks(level);
    `);
  }
  ensured = true;
}
