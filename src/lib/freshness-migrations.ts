/**
 * 知识保鲜
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 5
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureFreshnessTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh'`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN last_reviewed_at DATETIME`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN last_reviewed_by INT`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN freshness_months INT NOT NULL DEFAULT 6`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN next_review_at DATETIME`); } catch (e) {}
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_review_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entry_id INT NOT NULL,
        assigned_to INT NOT NULL,
        reason VARCHAR(50) NOT NULL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        due_at DATETIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        resolved_at DATETIME,
        resolved_note TEXT,
        KEY idx_krt_assignee_status (assigned_to, status),
        KEY idx_krt_due (due_at)
      );
    `);
  } else {
    const cols = (db.prepare(`PRAGMA table_info(knowledge_entries)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('freshness_status')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN freshness_status TEXT NOT NULL DEFAULT 'fresh'`);
    if (!cols.includes('last_reviewed_at')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN last_reviewed_at DATETIME`);
    if (!cols.includes('last_reviewed_by')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN last_reviewed_by INTEGER`);
    if (!cols.includes('freshness_months')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN freshness_months INTEGER NOT NULL DEFAULT 6`);
    if (!cols.includes('next_review_at')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN next_review_at DATETIME`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_review_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        assigned_to INTEGER NOT NULL,
        reason TEXT NOT NULL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        due_at DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at DATETIME,
        resolved_note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_krt_assignee_status ON knowledge_review_tasks(assigned_to, status);
      CREATE INDEX IF NOT EXISTS idx_krt_due ON knowledge_review_tasks(due_at);
    `);
  }

  ensured = true;
}

// 扫描过期知识
export function scanStaleEntries(opts: { thresholdMonths?: number; dryRun?: boolean } = {}): { scanned: number; stale: number; tasksCreated: number; details: any[] } {
  ensureFreshnessTables();
  const db = getDb();
  const threshold = opts.thresholdMonths || 6;
  const isMysql = isMysqlEnabled();
  const dateExpr = isMysql ? `julianday('now') - julianday(COALESCE(k.last_reviewed_at, k.updated_at, k.created_at))` : `(julianday('now') - julianday(COALESCE(k.last_reviewed_at, k.updated_at, k.created_at)))`;
  const thresholdDays = threshold * 30;

  // 找过期但还没 open task 的条目
  const entries = db.prepare(`
    SELECT k.id, k.title, k.created_by, k.useful_count, k.freshness_months, k.status,
      ${dateExpr} AS days_since_review
    FROM knowledge_entries k
    WHERE k.status = 'published'
      AND (k.freshness_status IN ('fresh','stale'))
      AND ${dateExpr} > ?
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_review_tasks t
        WHERE t.entry_id = k.id AND t.status IN ('open','in_progress')
      )
  `).all(...(isMysql ? [thresholdDays] : [thresholdDays])) as any[];

  const details: any[] = [];
  let tasksCreated = 0;
  for (const e of entries) {
    // useful 宽限：useful_count >= 5 → 阈值 × 2
    const effectiveThresholdDays = (e.useful_count || 0) >= 5 ? thresholdDays * 2 : thresholdDays;
    if (e.days_since_review <= effectiveThresholdDays) continue;

    const assignedTo = e.created_by && e.created_by.startsWith('user:') ? parseInt(e.created_by.substring(5)) : 1;
    if (opts.dryRun) {
      details.push({ entry_id: e.id, title: e.title, days: Math.round(e.days_since_review), action: 'would_create_task' });
      continue;
    }

    db.prepare(`UPDATE knowledge_entries SET freshness_status='stale' WHERE id=?`).run(e.id);
    const due = isMysql ? `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 14 DAY)` : `datetime('now', '+14 days')`;
    const r = db.prepare(`INSERT INTO knowledge_review_tasks(entry_id, assigned_to, reason, due_at) VALUES (?, ?, 'stale', ${due})`).run(e.id, assignedTo);
    details.push({ entry_id: e.id, title: e.title, days: Math.round(e.days_since_review), task_id: r.lastInsertRowid });
    tasksCreated++;
  }

  return { scanned: entries.length, stale: entries.length, tasksCreated, details };
}

export function listReviewTasks(assignedTo: number | null, status: string | null = null): any[] {
  ensureFreshnessTables();
  const db = getDb();
  const conds: string[] = [];
  const vals: any[] = [];
  if (assignedTo !== null) { conds.push('t.assigned_to=?'); vals.push(assignedTo); }
  if (status) { conds.push('t.status=?'); vals.push(status); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db.prepare(`
    SELECT t.*, k.title as entry_title, k.category as entry_category
    FROM knowledge_review_tasks t
    LEFT JOIN knowledge_entries k ON k.id = t.entry_id
    ${where}
    ORDER BY t.due_at ASC LIMIT 100
  `).all(...vals) as any[];
}

export function resolveReviewTask(taskId: number, action: 'refresh' | 'archive_stale' | 'update_content', note?: string, userId?: number) {
  ensureFreshnessTables();
  const db = getDb();
  const t = db.prepare(`SELECT * FROM knowledge_review_tasks WHERE id=?`).get(taskId) as any;
  if (!t) throw new Error('任务不存在');

  if (action === 'refresh') {
    db.prepare(`UPDATE knowledge_entries SET freshness_status='fresh', last_reviewed_at=CURRENT_TIMESTAMP, last_reviewed_by=?, next_review_at=datetime(CURRENT_TIMESTAMP, '+' || freshness_months || ' months') WHERE id=?`).run(userId || null, t.entry_id);
  } else if (action === 'archive_stale') {
    db.prepare(`UPDATE knowledge_entries SET freshness_status='archived_stale', status='archived', last_reviewed_at=CURRENT_TIMESTAMP, last_reviewed_by=? WHERE id=?`).run(userId || null, t.entry_id);
  }
  // update_content: 保持原状态，用户自己改过 answer/question 触发器会重置 fresh

  db.prepare(`UPDATE knowledge_review_tasks SET status='resolved', resolved_at=CURRENT_TIMESTAMP, resolved_note=? WHERE id=?`).run(note || null, taskId);
  return { success: true };
}
