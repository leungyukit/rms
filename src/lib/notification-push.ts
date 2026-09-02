/**
 * 个人通知推送：站内通知 → 飞书/企微/钉钉个人消息
 *
 * 背景：原有通知只存在站内，用户不打开 RMS 就看不到。
 * 需求延期、SLA 预警、知识沉淀提醒等全靠用户主动刷新。
 *
 * 这里利用 OAuth 登录时已绑定的 feishu_open_id / wecom_userid / dingtalk_open_id，
 * 把未推送的站内通知通过 IM 个人消息渠道推送给用户。
 *
 * 飞书成熟度最高（卡片消息），企微/钉钉走纯文本兜底。
 */
import { getDb, getAsyncDb, isMysqlEnabled } from './db';

let ensured = false;

/** 确保 notifications 表有推送跟踪列 */
export function ensureNotificationPushTables() {
  if (ensured) return;
  const db = getDb();
  // 列不存在就加，幂等
  for (const col of ['notified_at', 'notified_channel']) {
    try {
      db.exec(`ALTER TABLE notifications ADD COLUMN ${col} TEXT`);
    } catch {
      // 列已存在，忽略
    }
  }
  // 给 users 表补 IM 身份列（如果还没补齐）
  for (const col of ['feishu_open_id', 'wecom_userid', 'dingtalk_open_id']) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_users_${col.replace('_', '')} ON users(${col})`);
      } catch {}
    } catch {
      // 已存在
    }
  }
  ensured = true;
}

/** 获取飞书 app_access_token（复用 system_config 里的飞书应用配置） */
async function getFeishuToken(): Promise<string | null> {
  const db = getAsyncDb();
  try {
    const appId = ((await db.prepare("SELECT value FROM system_config WHERE `key`='feishu_app_id'").get()) as any)?.value;
    const appSecret = ((await db.prepare("SELECT value FROM system_config WHERE `key`='feishu_app_secret'").get()) as any)?.value;
    if (!appId || !appSecret) return null;
    const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await resp.json() as any;
    return data.code === 0 ? data.app_access_token : null;
  } catch {
    return null;
  }
}

/** 飞书个人消息（卡片） */
async function sendFeishuPersonal(openId: string, title: string, content: string, link: string): Promise<boolean> {
  const token = await getFeishuToken();
  if (!token) return false;

  const card = {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: `🔔 ${title}` } },
    elements: [
      { tag: 'markdown', content: content.length > 500 ? content.substring(0, 500) + '...' : content },
    ] as any[],
  };
  if (link) {
    card.elements.push({
      tag: 'action',
      actions: [{ tag: 'button', text: { tag: 'plain_text', content: '查看详情' }, url: link, type: 'default' }],
    });
  }

  const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) }),
  });
  const data = await resp.json() as any;
  return data.code === 0;
}

/** 企微个人消息（纯文本） */
async function sendWecomPersonal(userid: string, title: string, content: string, link: string): Promise<boolean> {
  const db = getAsyncDb();
  try {
    const corpId = ((await db.prepare("SELECT value FROM system_config WHERE `key`='wecom_corp_id'").get()) as any)?.value;
    const corpSecret = ((await db.prepare("SELECT value FROM system_config WHERE `key`='wecom_corp_secret'").get()) as any)?.value;
    const agentId = ((await db.prepare("SELECT value FROM system_config WHERE `key`='wecom_agent_id'").get()) as any)?.value;
    if (!corpId || !corpSecret || !agentId) return false;

    const tokenResp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${corpSecret}`);
    const tokenData = await tokenResp.json() as any;
    if (tokenData.errcode !== 0) return false;
    const token = tokenData.access_token;

    const text = `${title}\n${content}${link ? `\n\n${link}` : ''}`;
    const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: userid, msgtype: 'text', agentid: parseInt(agentId), text: { content: text } }),
    });
    const data = await resp.json() as any;
    return data.errcode === 0;
  } catch {
    return false;
  }
}

/** 钉钉个人消息（纯文本） */
async function sendDingtalkPersonal(openId: string, title: string, content: string, link: string): Promise<boolean> {
  const db = getAsyncDb();
  try {
    const appKey = ((await db.prepare("SELECT value FROM system_config WHERE `key`='dingtalk_app_key'").get()) as any)?.value;
    const appSecret = ((await db.prepare("SELECT value FROM system_config WHERE `key`='dingtalk_app_secret'").get()) as any)?.value;
    const agentId = ((await db.prepare("SELECT value FROM system_config WHERE `key`='dingtalk_agent_id'").get()) as any)?.value;
    if (!appKey || !appSecret || !agentId) return false;

    const tokenResp = await fetch(`https://oapi.dingtalk.com/gettoken?appkey=${appKey}&appsecret=${appSecret}`);
    const tokenData = await tokenResp.json() as any;
    if (tokenData.errcode !== 0) return false;
    const token = tokenData.access_token;

    const text = `${title}\n${content}${link ? `\n\n${link}` : ''}`;
    const resp = await fetch(`https://oapi.dingtalk.com/topapi/im/message/corpconversation/asyncsend_v2?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: parseInt(agentId),
        userid_list: openId,
        msg: { msgtype: 'text', text: { content: text } },
      }),
    });
    const data = await resp.json() as any;
    return data.errcode === 0;
  } catch {
    return false;
  }
}

/**
 * 推送未推送的未读通知。
 * 每轮最多处理 20 条，避免单次阻塞。
 */
export async function pushUnreadNotifications(): Promise<{ pushed: number; failed: number; skipped: number }> {
  ensureNotificationPushTables();
  const db = getAsyncDb();

  const rows = (await db.prepare(`
    SELECT n.id, n.user_id, n.title, n.content, n.type, n.link,
      u.feishu_open_id, u.wecom_userid, u.dingtalk_open_id
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    WHERE n.is_read = 0 AND n.notified_at IS NULL
    ORDER BY n.created_at ASC
    LIMIT 20
  `).all()) as any[];

  let pushed = 0;
  let failed = 0;

  for (const row of rows) {
    const content = (row.content || '').substring(0, 300);
    const link = row.link || '';
    let ok = false;

    if (row.feishu_open_id) {
      ok = await sendFeishuPersonal(row.feishu_open_id, row.title, content, link);
    } else if (row.wecom_userid) {
      ok = await sendWecomPersonal(row.wecom_userid, row.title, content, link);
    } else if (row.dingtalk_open_id) {
      ok = await sendDingtalkPersonal(row.dingtalk_open_id, row.title, content, link);
    }

    if (ok) {
      const channel = row.feishu_open_id ? 'feishu' : row.wecom_userid ? 'wecom' : 'dingtalk';
      (await db.prepare(`UPDATE notifications SET notified_at = CURRENT_TIMESTAMP, notified_channel = ? WHERE id = ?`).run(channel, row.id));
      pushed++;
    } else {
      // 标记 failed 避免反复重试同一批失败
      (await db.prepare(`UPDATE notifications SET notified_at = CURRENT_TIMESTAMP, notified_channel = 'failed' WHERE id = ?`).run(row.id));
      failed++;
    }
  }

  return { pushed, failed, skipped: rows.length - pushed - failed };
}