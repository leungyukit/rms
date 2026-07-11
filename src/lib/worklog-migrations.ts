/**
 * 工时日志 · 表结构与初始化
 * 依据：rms-docs/RMS-优化方案-阶段2-P1a.md § 4
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureWorklogTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS work_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        user_id INT NOT NULL,
        work_date DATE NOT NULL,
        hours DOUBLE NOT NULL,
        description TEXT,
        sprint_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_wlog_req (requirement_id),
        KEY idx_wlog_user (user_id),
        KEY idx_wlog_date (work_date),
        KEY idx_wlog_sprint (sprint_id)
      );
    `);
    // requirements 加 estimated_hours（actual_hours 已存在）
    try { db.exec(`ALTER TABLE requirements ADD COLUMN estimated_hours DOUBLE DEFAULT 0`); } catch (e) {}
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS work_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        work_date TEXT NOT NULL,
        hours REAL NOT NULL,
        description TEXT DEFAULT '',
        sprint_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_wlog_req ON work_logs(requirement_id);
      CREATE INDEX IF NOT EXISTS idx_wlog_user ON work_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_wlog_date ON work_logs(work_date);
      CREATE INDEX IF NOT EXISTS idx_wlog_sprint ON work_logs(sprint_id);
    `);
    const cols = (db.prepare(`PRAGMA table_info(requirements)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('estimated_hours')) {
      db.exec(`ALTER TABLE requirements ADD COLUMN estimated_hours REAL DEFAULT 0`);
    }
  }

  // 触发器：写工时自动累加到 requirements.actual_hours
  // 注：MySQL 生产环境可能无 SUPER 权限导致 CREATE TRIGGER 失败，会回退到应用层双写
  try {
    if (isMysql) {
      db.exec(`DROP TRIGGER IF EXISTS trg_wlog_ai`);
      db.exec(`DROP TRIGGER IF EXISTS trg_wlog_ad`);
      db.exec(`
        CREATE TRIGGER trg_wlog_ai AFTER INSERT ON work_logs
        FOR EACH ROW BEGIN
          UPDATE requirements
          SET actual_hours = COALESCE(actual_hours, 0) + NEW.hours,
              resolution_time_hours = COALESCE(resolution_time_hours, 0) + NEW.hours,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.requirement_id;
        END
      `);
      db.exec(`
        CREATE TRIGGER trg_wlog_ad AFTER DELETE ON work_logs
        FOR EACH ROW BEGIN
          UPDATE requirements
          SET actual_hours = MAX(0, COALESCE(actual_hours, 0) - OLD.hours),
              resolution_time_hours = MAX(0, COALESCE(resolution_time_hours, 0) - OLD.hours),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = OLD.requirement_id;
        END
      `);
    } else {
      db.exec(`DROP TRIGGER IF EXISTS trg_wlog_ai`);
      db.exec(`DROP TRIGGER IF EXISTS trg_wlog_ad`);
      db.exec(`
        CREATE TRIGGER trg_wlog_ai AFTER INSERT ON work_logs
        BEGIN
          UPDATE requirements
          SET actual_hours = COALESCE(actual_hours, 0) + NEW.hours,
              resolution_time_hours = COALESCE(resolution_time_hours, 0) + NEW.hours,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.requirement_id;
        END
      `);
      db.exec(`
        CREATE TRIGGER trg_wlog_ad AFTER DELETE ON work_logs
        BEGIN
          UPDATE requirements
          SET actual_hours = MAX(0, COALESCE(actual_hours, 0) - OLD.hours),
              resolution_time_hours = MAX(0, COALESCE(resolution_time_hours, 0) - OLD.hours),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = OLD.requirement_id;
        END
      `);
    }
  } catch (e: any) {
    // MySQL 无 SUPER 权限时 CREATE TRIGGER 会失败；改由应用层双写
    // eslint-disable-next-line no-console
    console.warn('[worklog] trigger creation failed, falling back to app-layer sync:', e?.message || e);
  }

  ensured = true;
}
