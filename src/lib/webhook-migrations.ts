/**
 * Webhook 订阅
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 6
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureWebhookTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        target_url VARCHAR(500) NOT NULL,
        secret VARCHAR(100) NOT NULL,
        events TEXT NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        filter_project_id INT,
        filter_priority VARCHAR(20),
        last_triggered_at DATETIME,
        last_status_code INT,
        last_error TEXT,
        consecutive_failures INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_ws_enabled (enabled)
      );
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subscription_id INT NOT NULL,
        event_id VARCHAR(100) NOT NULL UNIQUE,
        event_type VARCHAR(50) NOT NULL,
        payload TEXT NOT NULL,
        attempt INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        response_status INT,
        response_body TEXT,
        error_message TEXT,
        started_at DATETIME,
        next_retry_at DATETIME,
        duration_ms INT,
        scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME,
        next_retry_at DATETIME,
        KEY idx_wd_sub_status (subscription_id, status)
      );
      CREATE TABLE IF NOT EXISTS api_rate_limit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token_id INT NOT NULL,
        window_start DATETIME NOT NULL,
        request_count INT NOT NULL DEFAULT 1,
        UNIQUE KEY idx_rl_token_window (token_id, window_start)
      );
    `);
  } else {
    const cols = (db.prepare(`PRAGMA table_info(access_tokens)`).all() as any[]).map((c: any) => c.name);
    // P1 fix: 历史遗留的 access_tokens 扩展字段（scope/scope/rate_limit_per_minute/expires_at/ip_whitelist）未使用，删除 ALTER 段避免虚表项。
    // 若需恢复可从 git history 恢复。
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        filter_project_id INTEGER,
        filter_priority TEXT,
        last_triggered_at DATETIME,
        last_status_code INTEGER,
        last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ws_enabled ON webhook_subscriptions(enabled);
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        response_status INTEGER,
        response_body TEXT,
        error_message TEXT,
        started_at DATETIME,
        next_retry_at DATETIME,
        duration_ms INTEGER,
        scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_wd_sub_status ON webhook_deliveries(subscription_id, status);
      CREATE TABLE IF NOT EXISTS api_rate_limit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        window_start DATETIME NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(token_id, window_start)
      );
    `);
  }

  ensured = true;
}

// 出站事件 — P3 §3：改为只入队，worker 轮询投递
export async function dispatchWebhookEvent(event: { type: string; data: any }): Promise<{ queued: number; skipped: number }> {
  ensureWebhookTables();
  const db = getDb();
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const envelope = {
    id: eventId,
    type: event.type,
    created_at: new Date().toISOString(),
    api_version: 'v1',
    data: event.data,
  };
  const payload = JSON.stringify(envelope);

  const subs = db.prepare(`SELECT * FROM webhook_subscriptions WHERE enabled=1`).all() as any[];
  let queued = 0, skipped = 0;
  for (const s of subs) {
    const events = (s.events || '').split(',').map((x: string) => x.trim());
    if (!events.includes(event.type) && !events.includes('*')) { skipped++; continue; }
    if (s.filter_project_id && event.data?.project_id && s.filter_project_id !== event.data.project_id) { skipped++; continue; }
    if (s.filter_priority && event.data?.priority && s.filter_priority !== event.data.priority) { skipped++; continue; }

    // 只入队（worker 会处理实际投递）
    db.prepare(`INSERT INTO webhook_deliveries(subscription_id, event_id, event_type, payload, attempt, status) VALUES (?, ?, ?, ?, 0, 'pending')`).run(s.id, eventId, event.type, payload);
    queued++;
  }
  return { queued, skipped };
}
