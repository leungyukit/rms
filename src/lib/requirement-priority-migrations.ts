/**
 * 需求优先级评估框架字段 + 需求基线表迁移
 * 支持 SQLite / MySQL 双数据库
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensurePriorityFrameworkFields() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    const addIfMissing = (col: string, def: string) => {
      const exists = (db.prepare(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requirements' AND COLUMN_NAME = ?
      `).all(col) as any[]).length > 0;
      if (!exists) {
        db.exec(`ALTER TABLE requirements ADD COLUMN ${col} ${def}`);
      }
    };
    addIfMissing('priority_framework', "VARCHAR(50) DEFAULT NULL");
    addIfMissing('priority_score', "DOUBLE DEFAULT NULL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_baselines (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(200) NOT NULL,
        project_id INT DEFAULT NULL,
        description TEXT,
        created_by INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_baseline_items (
        baseline_id INT NOT NULL,
        requirement_id INT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (baseline_id, requirement_id),
        KEY requirement_id (requirement_id),
        CONSTRAINT requirement_baseline_items_ibfk_1 FOREIGN KEY (baseline_id) REFERENCES requirement_baselines (id) ON DELETE CASCADE,
        CONSTRAINT requirement_baseline_items_ibfk_2 FOREIGN KEY (requirement_id) REFERENCES requirements (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } else {
    const cols = (db.prepare(`PRAGMA table_info(requirements)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('priority_framework')) {
      db.exec(`ALTER TABLE requirements ADD COLUMN priority_framework TEXT`);
    }
    if (!cols.includes('priority_score')) {
      db.exec(`ALTER TABLE requirements ADD COLUMN priority_score REAL`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        project_id INTEGER,
        description TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_baseline_items (
        baseline_id INTEGER NOT NULL,
        requirement_id INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (baseline_id, requirement_id)
      )
    `);
  }

  ensured = true;
}
