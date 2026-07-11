/**
 * 数据导入 · 表结构
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 1
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureImportTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_imports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(500) NOT NULL,
        file_hash VARCHAR(64) NOT NULL,
        total_rows INT NOT NULL DEFAULT 0,
        success_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error_report_path TEXT,
        mapping_json TEXT,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        KEY idx_ri_status (status),
        KEY idx_ri_user (created_by),
        KEY idx_ri_hash (file_hash, created_by)
      );
      CREATE TABLE IF NOT EXISTS requirement_import_rows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        import_id INT NOT NULL,
        row_no INT NOT NULL,
        raw_json TEXT NOT NULL,
        normalized_json TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        requirement_id INT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_rir_import (import_id, status),
        CONSTRAINT rir_import_fk FOREIGN KEY (import_id) REFERENCES requirement_imports(id) ON DELETE CASCADE
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error_report_path TEXT,
        mapping_json TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_ri_status ON requirement_imports(status);
      CREATE INDEX IF NOT EXISTS idx_ri_user ON requirement_imports(created_by);
      CREATE INDEX IF NOT EXISTS idx_ri_hash ON requirement_imports(file_hash, created_by);

      CREATE TABLE IF NOT EXISTS requirement_import_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL,
        row_no INTEGER NOT NULL,
        raw_json TEXT NOT NULL,
        normalized_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        requirement_id INTEGER,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (import_id) REFERENCES requirement_imports(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rir_import ON requirement_import_rows(import_id, status);
    `);
  }

  ensured = true;
}
