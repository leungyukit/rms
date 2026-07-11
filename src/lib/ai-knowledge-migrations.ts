/**
 * AI 自动沉淀知识 · 任务表
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 4
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureAiKnowledgeTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_ai_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        trigger_status VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        llm_model VARCHAR(50),
        prompt_tokens INT,
        completion_tokens INT,
        error_message TEXT,
        knowledge_entry_id INT,
        duration_ms INT,
        triggered_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        KEY idx_kaj_req (requirement_id),
        KEY idx_kaj_status (status, created_at),
        KEY idx_kaj_finished (finished_at)
      );
    `);
    // knowledge_entries 加字段
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN ai_generated TINYINT NOT NULL DEFAULT 0`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN source_job_id INT`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN reviewed_by INT`); } catch (e) {}
    try { db.exec(`ALTER TABLE knowledge_entries ADD COLUMN reviewed_at DATETIME`); } catch (e) {}
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_ai_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        trigger_status TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        llm_model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        error_message TEXT,
        knowledge_entry_id INTEGER,
        duration_ms INTEGER,
        triggered_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_kaj_req ON knowledge_ai_jobs(requirement_id);
      CREATE INDEX IF NOT EXISTS idx_kaj_status ON knowledge_ai_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_kaj_finished ON knowledge_ai_jobs(finished_at);
    `);
    const cols = (db.prepare(`PRAGMA table_info(knowledge_entries)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('ai_generated')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN ai_generated INTEGER NOT NULL DEFAULT 0`);
    if (!cols.includes('source_job_id')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN source_job_id INTEGER`);
    if (!cols.includes('reviewed_by')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN reviewed_by INTEGER`);
    if (!cols.includes('reviewed_at')) db.exec(`ALTER TABLE knowledge_entries ADD COLUMN reviewed_at DATETIME`);
  }

  // system_config 默认配置
  const defaults: [string, string][] = [
    ['ai_knowledge_auto_enabled', 'true'],
    ['ai_knowledge_target_statuses', 'verified,closed'],
    ['ai_knowledge_default_status', 'draft'],
    ['ai_knowledge_notify_handler', 'true'],
  ];
  for (const [k, v] of defaults) {
    try { db.prepare(`INSERT IGNORE INTO system_config(\`key\`, \`value\`) VALUES (?, ?)`).run(k, v); } catch (e) {}
    try { db.prepare(`INSERT IGNORE INTO system_config(\`key\`, \`value\`) VALUES (?, ?)`).run(k, v); } catch (e) {}
  }

  ensured = true;
}

export function getConfig(key: string, def: string = ''): string {
  const db = getDb();
  try {
    const r = db.prepare(`SELECT \`value\` FROM system_config WHERE \`key\`=?`).get(key) as any;
    return r?.value || def;
  } catch (e) {
    return def;
  }
}

// 触发：当需求进入 verified/closed 时插入任务
export function triggerAiKnowledgeJob(requirementId: number, oldStatus: string, newStatus: string, triggeredBy?: number) {
  ensureAiKnowledgeTables();
  const enabled = getConfig('ai_knowledge_auto_enabled', 'true');
  if (enabled !== 'true') { console.log('[ai-trigger] disabled, skip'); return null; }
  const targets = getConfig('ai_knowledge_target_statuses', 'verified,closed').split(',').map(s => s.trim());
  if (!targets.includes(newStatus)) { console.log('[ai-trigger] newStatus not in targets:', newStatus, 'vs', targets); return null; }
  if (targets.includes(oldStatus)) { console.log('[ai-trigger] oldStatus already in targets:', oldStatus); return null; }

  // 幂等：同需求已有 success → 跳过
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM knowledge_ai_jobs WHERE requirement_id=? AND status='success' LIMIT 1`).get(requirementId) as any;
  if (exists) { console.log('[ai-trigger] already has success job, skip'); return null; }

  try {
    const r = db.prepare(`
      INSERT INTO knowledge_ai_jobs(requirement_id, trigger_status, status, triggered_by)
      VALUES (?, ?, 'pending', ?)
    `).run(requirementId, newStatus, triggeredBy || null);
    console.log('[ai-trigger] created job', r.lastInsertRowid, 'for req', requirementId);
    return r.lastInsertRowid;
  } catch (e: any) {
    console.error('[ai-trigger] INSERT failed:', e.message);
    return null;
  }
}

// Worker 抢占任务
export function claimNextJob(): any {
  ensureAiKnowledgeTables();
  const db = getDb();
  // 原子：UPDATE WHERE status='pending' AND created_at > now-1h
  const isMysql = isMysqlEnabled();
  const ageExpr = isMysql ? `created_at > NOW() - INTERVAL 1 HOUR` : `created_at > datetime('now', '-1 hour')`;
  const r = db.prepare(`
    UPDATE knowledge_ai_jobs SET status='processing'
    WHERE id = (SELECT id FROM knowledge_ai_jobs WHERE status='pending' AND ${ageExpr} ORDER BY id LIMIT 1)
    AND status='pending'
  `).run();
  if (r.changes === 0) return null;
  return db.prepare(`SELECT * FROM knowledge_ai_jobs WHERE status='processing' ORDER BY id DESC LIMIT 1`).get() as any;
}

// 完成
export function completeJob(jobId: number, knowledgeEntryId: number, durationMs: number, llmModel?: string) {
  const db = getDb();
  db.prepare(`UPDATE knowledge_ai_jobs SET status='success', knowledge_entry_id=?, duration_ms=?, llm_model=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(knowledgeEntryId, durationMs, llmModel || null, jobId);
}

export function failJob(jobId: number, error: string) {
  const db = getDb();
  db.prepare(`UPDATE knowledge_ai_jobs SET status='failed', error_message=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(error, jobId);
}
