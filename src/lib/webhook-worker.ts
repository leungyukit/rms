/**
 * Webhook 投递常驻 worker
 * 
 * 从 P3 §3：解耦主进程投递
 * - dispatchWebhookEvent 改为只入队（写 webhook_deliveries pending）
 * - 此 worker 每 5s 轮询 pending 状态的 deliveries，做实际 fetch
 * - 支持指数退避重试
 * - 最多 3 次尝试后标记 permanently_failed
 * 
 * 启动：layout.tsx 首次渲染时调用 ensureWorkerStarted()
 */
import { getDb } from './db';
import { ensureWebhookTables } from './webhook-migrations';
import crypto from 'node:crypto';

const POLL_INTERVAL_MS = 5_000;        // 5s 轮询
const DELIVERY_TIMEOUT_MS = 10_000;    // 单次 fetch 超时
const MAX_ATTEMPTS = 3;                 // 最大重试次数
const BATCH_SIZE = 20;                  // 每轮最多处理 20 条

let workerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

function signWebhookPayload(secret: string, ts: number, payload: string): string {
  return crypto.createHmac('sha256', `${secret}.${ts}`).update(payload).digest('hex');
}

/**
 * 处理一条 pending delivery
 */
async function processDelivery(deliveryId: number): Promise<{ ok: boolean; status: number | null; error: string | null; dur: number }> {
  const db = getDb();
  const d = db.prepare(`SELECT d.*, s.target_url, s.secret FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id=d.subscription_id WHERE d.id=?`).get(deliveryId) as any;
  if (!d) return { ok: false, status: null, error: 'delivery_not_found', dur: 0 };

  // 抢锁：把 status 从 pending 改为 in_progress（带 attempt 校验）
  const claim = db.prepare(`UPDATE webhook_deliveries SET status='in_progress', attempt=attempt+1, started_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(deliveryId);
  if (claim.changes === 0) return { ok: false, status: null, error: 'already_claimed', dur: 0 };

  const ts = Math.floor(Date.now() / 1000);
  const sig = signWebhookPayload(d.secret, ts, d.payload);
  const t0 = Date.now();
  try {
    const r = await fetch(d.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RMS-Event': d.event_type,
        'X-RMS-Event-Id': d.event_id,
        'X-RMS-Timestamp': String(ts),
        'X-RMS-Signature': `sha256=${sig}`,
      },
      body: d.payload,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const dur = Date.now() - t0;
    const body = (await r.text()).substring(0, 2000);
    if (r.ok) {
      db.prepare(`UPDATE webhook_deliveries SET status='success', response_status=?, response_body=?, duration_ms=?, delivered_at=CURRENT_TIMESTAMP WHERE id=?`).run(r.status, body, dur, deliveryId);
      db.prepare(`UPDATE webhook_subscriptions SET last_triggered_at=CURRENT_TIMESTAMP, last_status_code=?, consecutive_failures=0 WHERE id=?`).run(r.status, d.subscription_id);
      return { ok: true, status: r.status, error: null, dur };
    } else {
      const nextAttempt = d.attempt + 1;
      if (nextAttempt >= MAX_ATTEMPTS) {
        db.prepare(`UPDATE webhook_deliveries SET status='permanently_failed', response_status=?, response_body=?, duration_ms=?, error_message=?, attempt=? WHERE id=?`).run(r.status, body, dur, `HTTP ${r.status}`, nextAttempt, deliveryId);
      } else {
        db.prepare(`UPDATE webhook_deliveries SET status='pending', response_status=?, response_body=?, duration_ms=?, error_message=?, next_retry_at=DATETIME(CURRENT_TIMESTAMP, '+' || ? || ' seconds') WHERE id=?`).run(r.status, body, dur, `HTTP ${r.status}`, Math.pow(2, nextAttempt) * 10, deliveryId);
      }
      db.prepare(`UPDATE webhook_subscriptions SET consecutive_failures=consecutive_failures+1, last_status_code=?, last_error=? WHERE id=?`).run(r.status, `HTTP ${r.status}`, d.subscription_id);
      return { ok: false, status: r.status, error: `HTTP ${r.status}`, dur };
    }
  } catch (e: any) {
    const dur = Date.now() - t0;
    const nextAttempt = d.attempt + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      db.prepare(`UPDATE webhook_deliveries SET status='permanently_failed', duration_ms=?, error_message=?, attempt=? WHERE id=?`).run(dur, e.message, nextAttempt, deliveryId);
    } else {
      db.prepare(`UPDATE webhook_deliveries SET status='pending', duration_ms=?, error_message=?, next_retry_at=DATETIME(CURRENT_TIMESTAMP, '+' || ? || ' seconds') WHERE id=?`).run(dur, e.message, Math.pow(2, nextAttempt) * 10, deliveryId);
    }
    db.prepare(`UPDATE webhook_subscriptions SET consecutive_failures=consecutive_failures+1, last_error=? WHERE id=?`).run(e.message, d.subscription_id);
    return { ok: false, status: null, error: e.message, dur };
  }
}

/**
 * 轮询一批 pending deliveries
 */
async function pollOnce(): Promise<{ processed: number; ok: number; failed: number }> {
  ensureWebhookTables();
  const db = getDb();
  // 选 pending 且 next_retry_at <= now 的（NULL 也算）
  const rows = db.prepare(`
    SELECT id FROM webhook_deliveries
    WHERE status='pending'
      AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
    ORDER BY id ASC
    LIMIT ?
  `).all(BATCH_SIZE) as any[];

  if (rows.length === 0) return { processed: 0, ok: 0, failed: 0 };

  let ok = 0, failed = 0;
  for (const r of rows) {
    try {
      const result = await processDelivery(r.id);
      if (result.ok) ok++; else failed++;
    } catch (e) {
      failed++;
    }
  }
  return { processed: rows.length, ok, failed };
}

/**
 * 启动 worker（幂等）
 */
export function ensureWorkerStarted(): void {
  if (workerHandle || isRunning) return;
  isRunning = true;
  workerHandle = setInterval(async () => {
    try {
      const r = await pollOnce();
      if (r.processed > 0 && process.env.WEBHOOK_WORKER_DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[webhook-worker] processed=${r.processed} ok=${r.ok} failed=${r.failed}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[webhook-worker] poll error:', e);
    }
  }, POLL_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log(`[webhook-worker] started, poll interval ${POLL_INTERVAL_MS}ms, batch size ${BATCH_SIZE}`);
}

/**
 * 停止 worker
 */
export function stopWorker(): void {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
    isRunning = false;
  }
}

/**
 * 手动触发一次轮询（用于 admin API）
 */
export async function triggerPollNow(): Promise<{ processed: number; ok: number; failed: number }> {
  return pollOnce();
}

/**
 * 状态查询
 */
export function getWorkerStatus(): { running: boolean; pollIntervalMs: number; batchSize: number; maxAttempts: number } {
  return { running: isRunning, pollIntervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE, maxAttempts: MAX_ATTEMPTS };
}
