/**
 * 飞书 / 企微 / 钉钉机器人集成
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 3
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureIntegrationTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        webhook_url VARCHAR(500) NOT NULL,
        secret VARCHAR(200),
        enabled TINYINT NOT NULL DEFAULT 1,
        verification_token VARCHAR(200),
        encrypt_key VARCHAR(200),
        app_id VARCHAR(100),
        app_secret VARCHAR(200),
        project_id INT,
        notify_on_create TINYINT NOT NULL DEFAULT 1,
        notify_on_status_change TINYINT NOT NULL DEFAULT 1,
        notify_on_high_priority TINYINT NOT NULL DEFAULT 1,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_int_channel (channel, enabled),
        KEY idx_int_project (project_id)
      );
      CREATE TABLE IF NOT EXISTS integration_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel VARCHAR(20) NOT NULL,
        config_id INT NOT NULL,
        external_msg_id VARCHAR(200) NOT NULL,
        chat_id VARCHAR(200),
        sender_id VARCHAR(200),
        raw_payload TEXT,
        parsed_command VARCHAR(500),
        requirement_id INT,
        status VARCHAR(20) NOT NULL DEFAULT 'received',
        error_message TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        UNIQUE KEY idx_msg_unique (channel, external_msg_id),
        KEY idx_msg_status (status, received_at),
        KEY idx_msg_req (requirement_id)
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        name TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        secret TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        verification_token TEXT,
        encrypt_key TEXT,
        app_id TEXT,
        app_secret TEXT,
        project_id INTEGER,
        notify_on_create INTEGER NOT NULL DEFAULT 1,
        notify_on_status_change INTEGER NOT NULL DEFAULT 1,
        notify_on_high_priority INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_int_channel ON integration_configs(channel, enabled);
      CREATE INDEX IF NOT EXISTS idx_int_project ON integration_configs(project_id);
      CREATE TABLE IF NOT EXISTS integration_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        config_id INTEGER NOT NULL,
        external_msg_id TEXT NOT NULL,
        chat_id TEXT,
        sender_id TEXT,
        raw_payload TEXT,
        parsed_command TEXT,
        requirement_id INTEGER,
        status TEXT NOT NULL DEFAULT 'received',
        error_message TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        UNIQUE(channel, external_msg_id)
      );
      CREATE INDEX IF NOT EXISTS idx_msg_status ON integration_messages(status, received_at);
      CREATE INDEX IF NOT EXISTS idx_msg_req ON integration_messages(requirement_id);
    `);
  }

  ensured = true;
}

export interface IntegrationConfig {
  id: number;
  channel: 'feishu' | 'wecom' | 'dingtalk';
  name: string;
  webhook_url: string;
  secret?: string;
  enabled: number;
  verification_token?: string;
  encrypt_key?: string;
  app_id?: string;
  app_secret?: string;
  project_id?: number;
  notify_on_create: number;
  notify_on_status_change: number;
  notify_on_high_priority: number;
}

// 出站：飞书 Webhook
export async function sendFeishu(webhookUrl: string, payload: { msg_type: string; content: any }, secret?: string): Promise<{ ok: boolean; status: number; body: string }> {
  // 签名：timestamp + secret → SHA1
  let body: any = payload;
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    const crypto = await import('crypto');
    const stringToSign = `${ts}\n${secret}`;
    const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64');
    body = { ...payload, timestamp: String(ts), sign };
  }
  try {
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text };
  } catch (e: any) {
    return { ok: false, status: 0, body: e.message || String(e) };
  }
}

// 出站：企微 Webhook（markdown）
export async function sendWecom(webhookUrl: string, content: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }), signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text };
  } catch (e: any) {
    return { ok: false, status: 0, body: e.message || String(e) };
  }
}

// 出站：钉钉 Webhook
export async function sendDingtalk(webhookUrl: string, content: string, secret?: string): Promise<{ ok: boolean; status: number; body: string }> {
  let url = webhookUrl;
  if (secret) {
    const ts = Date.now();
    const crypto = await import('crypto');
    const stringToSign = `${ts}\n${secret}`;
    const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
    url = `${webhookUrl}&timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
  }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content } }), signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text };
  } catch (e: any) {
    return { ok: false, status: 0, body: e.message || String(e) };
  }
}

// 出站：统一分发
export async function dispatchEvent(event: { type: 'requirement.created' | 'status.changed' | 'high_priority.alert'; requirement: any; actorUserId: number; oldStatus?: string; newStatus?: string }): Promise<{ sent: number; failed: number; details: any[] }> {
  ensureIntegrationTables();
  const db = getDb();
  const cfgs = db.prepare(`SELECT * FROM integration_configs WHERE enabled=1`).all() as IntegrationConfig[];
  const details: any[] = [];
  let sent = 0, failed = 0;

  for (const cfg of cfgs) {
    // 事件过滤
    if (event.type === 'requirement.created' && !cfg.notify_on_create) continue;
    if (event.type === 'status.changed' && !cfg.notify_on_status_change) continue;
    if (event.type === 'high_priority.alert' && !cfg.notify_on_high_priority) continue;
    if (cfg.project_id && event.requirement.project_id && cfg.project_id !== event.requirement.project_id) continue;

    const title = event.requirement.title || `需求 #${event.requirement.id}`;
    const id = event.requirement.id;
    const link = `http://localhost:3800/requirements/${id}`;
    let content = '';
    if (event.type === 'requirement.created') content = `📋 **新需求** [${title}](${link})\n优先级：${event.requirement.priority} | 项目：${event.requirement.project_name || '-'}`;
    else if (event.type === 'status.changed') content = `🔄 **状态变更** [${title}](${link})：${event.oldStatus} → ${event.newStatus}`;
    else if (event.type === 'high_priority.alert') content = `🚨 **高优告警** [${title}](${link})\n紧急处理！`;

    let r: { ok: boolean; status: number; body: string };
    if (cfg.channel === 'feishu') r = await sendFeishu(cfg.webhook_url, { msg_type: 'interactive', content: { type: 'card', data: { title: { tag: 'plain_text', content: title }, content: { tag: 'markdown', content } } } }, cfg.secret);
    else if (cfg.channel === 'wecom') r = await sendWecom(cfg.webhook_url, content);
    else if (cfg.channel === 'dingtalk') r = await sendDingtalk(cfg.webhook_url, content, cfg.secret);
    else continue;

    details.push({ config_id: cfg.id, channel: cfg.channel, name: cfg.name, ok: r.ok, status: r.status });
    if (r.ok) sent++; else failed++;
  }

  return { sent, failed, details };
}

// 入站：解析命令
export function parseCommand(text: string): { action: 'create' | 'status' | 'assign' | 'unknown'; args: any } | null {
  // 去掉开头的 @_user_1 / @用户名 提及前缀
  const t = text.replace(/^@\S+\s*/, '').trim();
  let m = t.match(/^#?create\s+(.+?)(?:\s*\|\s*(.+?))?(?:\s*\|\s*(high|medium|low))?$/i);
  if (m) return { action: 'create', args: { title: m[1], business_unit: m[2], priority: m[3] || 'medium' } };
  m = t.match(/^#?status\s+#?(\d+)\s+(\w+)$/i);
  if (m) return { action: 'status', args: { id: parseInt(m[1]), status: m[2] } };
  m = t.match(/^#?assign\s+#?(\d+)\s+@?(\w+)$/i);
  if (m) return { action: 'assign', args: { id: parseInt(m[1]), handler: m[2] } };
  return null;
}

// 入站：处理 webhook 消息
export async function handleInboundMessage(channel: 'feishu' | 'wecom' | 'dingtalk', configId: number, externalMsgId: string, chatId: string | null, senderId: string | null, rawPayload: any, text: string): Promise<{ status: 'processed' | 'ignored' | 'failed'; requirement_id?: number; reply: string }> {
  ensureIntegrationTables();
  const db = getDb();

  // 去重
  const existing = db.prepare(`SELECT id, status, requirement_id FROM integration_messages WHERE channel=? AND external_msg_id=?`).get(channel, externalMsgId) as any;
  if (existing) return { status: existing.status === 'failed' ? 'failed' : 'ignored', requirement_id: existing.requirement_id, reply: '已处理过' };

  // 记录
  const r = db.prepare(`
    INSERT INTO integration_messages(channel, config_id, external_msg_id, chat_id, sender_id, raw_payload, status)
    VALUES (?, ?, ?, ?, ?, ?, 'received')
  `).run(channel, configId, externalMsgId, chatId, senderId, JSON.stringify(rawPayload));
  const msgId = r.lastInsertRowid as number;

  // 命令解析
  const cmd = parseCommand(text);
  if (!cmd) {
    db.prepare(`UPDATE integration_messages SET status='ignored', processed_at=CURRENT_TIMESTAMP WHERE id=?`).run(msgId);
    return { status: 'ignored', reply: '未识别指令' };
  }

  db.prepare(`UPDATE integration_messages SET parsed_command=? WHERE id=?`).run(JSON.stringify(cmd), msgId);

  try {
    if (cmd.action === 'create') {
      const cfg = db.prepare(`SELECT * FROM integration_configs WHERE id=?`).get(configId) as any;
      const projectId = cfg?.project_id || null;
      const sourceTag = `[${channel}:${chatId || ''}:${externalMsgId}]`;
      const descWithSource = `${text}\n\n— 来源：${sourceTag}\n— 发送人：${senderId || '匿名'}`;
      const ins = db.prepare(`
        INSERT INTO requirements(title, description, priority, business_unit, status, category, project_id, requester_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'received_not_evaluated', 'adhoc', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(cmd.args.title, descWithSource, cmd.args.priority, cmd.args.business_unit || '外部', projectId, senderId || sourceTag);
      const reqId = ins.lastInsertRowid as number;
      db.prepare(`UPDATE integration_messages SET status='processed', requirement_id=?, processed_at=CURRENT_TIMESTAMP WHERE id=?`).run(reqId, msgId);
      return { status: 'processed', requirement_id: reqId, reply: `✅ 已建需求 #${reqId}：${cmd.args.title}` };
    }
    if (cmd.action === 'status') {
      // 简化：直接更新
      db.prepare(`UPDATE requirements SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(cmd.args.status, cmd.args.id);
      db.prepare(`UPDATE integration_messages SET status='processed', requirement_id=?, processed_at=CURRENT_TIMESTAMP WHERE id=?`).run(cmd.args.id, msgId);
      return { status: 'processed', requirement_id: cmd.args.id, reply: `✅ #${cmd.args.id} 状态已改 ${cmd.args.status}` };
    }
    if (cmd.action === 'assign') {
      const u = db.prepare(`SELECT id FROM users WHERE username=? OR display_name=?`).get(cmd.args.handler, cmd.args.handler) as any;
      if (u) {
        db.prepare(`UPDATE requirements SET handler_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(u.id, cmd.args.id);
        db.prepare(`UPDATE integration_messages SET status='processed', requirement_id=?, processed_at=CURRENT_TIMESTAMP WHERE id=?`).run(cmd.args.id, msgId);
        return { status: 'processed', requirement_id: cmd.args.id, reply: `✅ #${cmd.args.id} 已分配给 ${cmd.args.handler}` };
      } else {
        return { status: 'failed', reply: `用户 ${cmd.args.handler} 不存在` };
      }
    }
    return { status: 'ignored', reply: '未知 action' };
  } catch (e: any) {
    db.prepare(`UPDATE integration_messages SET status='failed', error_message=?, processed_at=CURRENT_TIMESTAMP WHERE id=?`).run(e.message, msgId);
    return { status: 'failed', reply: `❌ ${e.message}` };
  }
}
