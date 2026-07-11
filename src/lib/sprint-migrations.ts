/**
 * Sprint / 迭代管理 · 表结构与初始化
 * 依据：rms-docs/RMS-优化方案-阶段2-P1a.md § 1
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureSprintTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sprints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        goal TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'planned',
        capacity_hours DOUBLE DEFAULT 0,
        notes TEXT,
        created_by INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sprints_project (project_id),
        KEY idx_sprints_status (status),
        KEY idx_sprints_date (start_date, end_date)
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_sprints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        sprint_id INT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_req (requirement_id),
        KEY idx_req_sprint_sprint (sprint_id),
        KEY idx_req_sprint_req (requirement_id)
      );
    `);
    // requirements.sprint_id
    try { db.exec(`ALTER TABLE requirements ADD COLUMN sprint_id INT DEFAULT NULL`); } catch (e) {}
    try { db.exec(`ALTER TABLE requirements ADD INDEX idx_req_sprint (sprint_id)`); } catch (e) {}
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        goal TEXT DEFAULT '',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'planned',
        capacity_hours REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
      CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);
      CREATE INDEX IF NOT EXISTS idx_sprints_date ON sprints(start_date, end_date);

      CREATE TABLE IF NOT EXISTS requirement_sprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        sprint_id INTEGER NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requirement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_req_sprint_sprint ON requirement_sprints(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_req_sprint_req ON requirement_sprints(requirement_id);
    `);
    // requirements.sprint_id (SQLite 加列)
    const cols = (db.prepare(`PRAGMA table_info(requirements)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('sprint_id')) {
      db.exec(`ALTER TABLE requirements ADD COLUMN sprint_id INTEGER`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_req_sprint ON requirements(sprint_id)`);
    }
  }

  // 同步触发器（MySQL/SQLite 略有差异，分别处理）
  try {
    if (isMysql) {
      db.exec(`DROP TRIGGER IF EXISTS trg_req_sprint_ai`);
      db.exec(`DROP TRIGGER IF EXISTS trg_req_sprint_ad`);
      db.exec(`
        CREATE TRIGGER trg_req_sprint_ai AFTER INSERT ON requirement_sprints
        FOR EACH ROW BEGIN
          UPDATE requirements SET sprint_id = NEW.sprint_id, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.requirement_id;
        END
      `);
      db.exec(`
        CREATE TRIGGER trg_req_sprint_ad AFTER DELETE ON requirement_sprints
        FOR EACH ROW BEGIN
          UPDATE requirements SET sprint_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = OLD.requirement_id;
        END
      `);
    } else {
      db.exec(`DROP TRIGGER IF EXISTS trg_req_sprint_ai`);
      db.exec(`DROP TRIGGER IF EXISTS trg_req_sprint_ad`);
      db.exec(`
        CREATE TRIGGER trg_req_sprint_ai AFTER INSERT ON requirement_sprints
        BEGIN
          UPDATE requirements SET sprint_id = NEW.sprint_id, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.requirement_id;
        END
      `);
      db.exec(`
        CREATE TRIGGER trg_req_sprint_ad AFTER DELETE ON requirement_sprints
        BEGIN
          UPDATE requirements SET sprint_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = OLD.requirement_id;
        END
      `);
    }
  } catch (e) {
    // 触发器失败不阻塞；上层 API 兜底双写
  }

  // system_config 默认值
  try {
    const cfg = db.prepare(`SELECT COUNT(*) c FROM system_config WHERE \`key\`=?`).get('default_user_capacity_hours') as any;
    if (cfg.c === 0) {
      db.prepare(`INSERT INTO system_config(\`key\`, value, category) VALUES (?, ?, 'sprint')`)
        .run('default_user_capacity_hours', '8');
    }
    const cfg2 = db.prepare(`SELECT COUNT(*) c FROM system_config WHERE \`key\`=?`).get('sprint_active_count_limit') as any;
    if (cfg2.c === 0) {
      db.prepare(`INSERT INTO system_config(\`key\`, value, category) VALUES (?, ?, 'sprint')`)
        .run('sprint_active_count_limit', '1');
    }
  } catch (e) {}

  ensured = true;
}
