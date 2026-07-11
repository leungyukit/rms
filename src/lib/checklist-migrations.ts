/**
 * 子任务/检查清单（requirement_checklist）· 表结构与初始化
 * 依据：rms-docs/RMS-优化方案-阶段1-P0.md § 4
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureChecklistTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_checklist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        sequence INT NOT NULL DEFAULT 0,
        assignee_id INT DEFAULT NULL,
        due_date DATE DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'todo',
        priority VARCHAR(20) DEFAULT 'medium',
        estimate_hours DOUBLE DEFAULT NULL,
        actual_hours DOUBLE DEFAULT NULL,
        blocked_reason TEXT,
        completed_at DATETIME DEFAULT NULL,
        completed_by INT DEFAULT NULL,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_checklist_requirement (requirement_id),
        INDEX idx_checklist_assignee (assignee_id),
        INDEX idx_checklist_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_checklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        sequence INTEGER NOT NULL DEFAULT 0,
        assignee_id INTEGER,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        estimate_hours REAL,
        actual_hours REAL,
        blocked_reason TEXT,
        completed_at DATETIME,
        completed_by INTEGER,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checklist_requirement ON requirement_checklist(requirement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checklist_assignee ON requirement_checklist(assignee_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checklist_status ON requirement_checklist(status)`);
  }

  ensured = true;
}

/**
 * 聚合统计某需求的 checklist 进度
 */
export function getChecklistAggregate(requirementId: number) {
  ensureChecklistTables();
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
       SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
       SUM(CASE WHEN status != 'done' AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
     FROM requirement_checklist WHERE requirement_id = ?`
  ).get(requirementId) as any;

  const total = rows?.total || 0;
  const done = rows?.done || 0;
  const inProgress = rows?.in_progress || 0;
  const blocked = rows?.blocked || 0;
  const overdue = rows?.overdue || 0;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    checklist_total: total,
    checklist_done: done,
    checklist_in_progress: inProgress,
    checklist_blocked: blocked,
    checklist_overdue: overdue,
    checklist_progress_pct: progressPct,
  };
}
