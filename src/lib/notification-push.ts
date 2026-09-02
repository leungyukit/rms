/**
 * 个人通知推送：站内通知 → 飞书/企微/钉钉个人消息
 *
 * 背景：原有通知只存在站内，用户不打开 RMS 就看不到。
 * 需求延期、SLA 预警、知识沉淀提醒等全靠用户主动刷新。
 *
 * 复用 OAuth 登录时绑定的 feishu_open_id / wecom_userid / dingtalk_open_id。
 * 飞书成熟度最高（卡片消息），企微/钉钉走纯文本兜底。
 *
 * ── 2026-09-02 上线前自查修掉的 4 个缺陷 ──────────────────────
 * 实测 63 生产库发现：`users` 表**根本没有** feishu_open_id 等列
 * （那些列是 OAuth callback 里按需 ALTER 出来的，没人用飞书登录过就不存在）。
 * 原实现直接 SELECT 这三列 → `ERROR 1054`，worker 每 2 分钟报错一次。
 *
 * 1. 列探测：照 knowledge-migrations 的规矩，先探 information_schema / PRAGMA
 *    再决定 DDL，不用裸 try{}catch{}（那正是 KB-UPGRADE-PLAN 点名批判的反模式，
 *    9/1 刚修完一轮，这里不能再犯）。
 * 2. 查询按「实际存在的列」动态拼；一列都没有就直接返回，不发 SQL。
 * 3. 失败**不再**写 notified_at —— 原来失败也标记，等于凭据配好之前的通知
 *    被永久打上 failed、以后再也不会推。改为 push_attempts 计数，
 *    超过 MAX_PUSH_ATTEMPTS 才放弃。
 * 4. 加开关 + 时间窗：默认 off；开启后只推最近 PUSH_WINDOW_HOURS 小时内的通知，
 *    避免一开开关就把历史积压（63 上有 147 条未读）一次性轰出去。
 */
import { getDb, getAsyncDb, isMysqlEnabled } from './db';

let ensured = false;

/** 最多尝试几次后放弃 */
const MAX_PUSH_ATTEMPTS = 3;
/** 只推最近多少小时内产生的通知，防止开关一开就刷屏历史积压 */
const PUSH_WINDOW_HOURS = 24;
/** 每轮最多处理多少条 */
const BATCH_SIZE = 20;

/** IM 身份列 → 渠道名。这些列由各 OAuth callback 按需创建，可能全都不存在。 */
const IM_IDENTITY_COLUMNS: Array<{ column: string; channel: 'feishu' | 'wecom' | 'dingtalk' }> = [
  { column: 'feishu_open_id', channel: 'feishu' },
  { column: 'wecom_userid', channel: 'wecom' },
  { column: 'dingtalk_open_id', channel: 'dingtalk' },
];

// ---------- 探测工具（与 knowledge-migrations 同一套规矩） ----------

function currentSchema(): string {
  const db = getDb();
  const row = db.prepare('SELECT DATABASE() AS db_name').get() as any;
  return row?.db_name || '';
}

function mysqlColumnExists(table: string, column: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`
  ).get(currentSchema(), table, column) as any;
  return Number(row?.cnt || 0) > 0;
}

function sqliteColumnExists(table: string, column: string): boolean {
  const db = getDb();
  try {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c: any) => c.name);
    return cols.includes(column);
  } catch {
    return false;
  }
}

/** 列是否存在（双库） */
function columnExists(table: string, column: string): boolean {
  return isMysqlEnabled() ? mysqlColumnExists(table, column) : sqliteColumnExists(table, column);
}

/**
 * 加列：探测过不存在才执行；执行失败就上抛。
 * 探测都过了还失败就是真故障，不该吞。
 */
function addColumnIfMissing(table: string, column: string, mysqlDef: string, sqliteDef: string) {
  if (columnExists(table, column)) return;
  const db = getDb();
  const def = isMysqlEnabled() ? mysqlDef : sqliteDef;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}

/**
 * 确保 notifications 表有推送跟踪列。
 * 只动 notifications 自己的列 —— **不碰 users 表**：
 * IM 身份列归各 OAuth callback 管，这里凭空建出来只会得到一堆空列，
 * 反而让「有没有人绑定过」这个判断失真。
 */
export function ensureNotificationPushTables() {
  if (ensured) return;
  addColumnIfMissing('notifications', 'notified_at', 'DATETIME NULL', 'DATETIME');
  addColumnIfMissing('notifications', 'notified_channel', 'VARCHAR(20) NULL', 'TEXT');
  addColumnIfMissing('notifications', 'push_attempts', 'INT NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0');
  ensured = true;
}

/** 读一条 system_config；读不到返回空串 */
async function getConfig(key: string): Promise<string> {
  const db = getAsyncDb();
  try {
    const row = (await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any;
    return row?.value ?? '';
  } catch {
    return '';
  }
}

/** 推送总开关，默认关闭 */
async function isPushEnabled(): Promise<boolean> {
  return (await getConfig('notification_push_enabled')) === 'true';
}

/** 获取飞书 app_access_token */
async function getFeishuToken(): Promise<string | null> {
  const appId = await getConfig('feishu_app_id');
  const appSecret = await getConfig('feishu_app_secret');
  if (!appId || !appSecret) return null;
  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = (await resp.json()) as any;
    return data.code === 0 ? data.app_access_token : null;
  } catch {
    return null;
  }
}

/** 飞书个人消息（卡片） */
async function sendFeishuPersonal(openId: string, title: string, content: string, link: string): Promise<boolean> {
  const token = await getFeishuToken();
  if (!token) return false;

  const elements: any[] = [
    { tag: 'markdown', content: content.length > 500 ? content.substring(0, 500) + '...' : content || title },
  ];
  // 只有绝对 URL 才能当按钮跳转；站内相对路径拼不出可点链接就不加按钮
  if (link && /^https?:\/\//i.test(link)) {
    elements.push({
      tag: 'action',
      actions: [{ tag: 'button', text: { tag: 'plain_text', content: '查看详情' }, url: link, type: 'default' }],
    });
  }
  const card = {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: `🔔 ${title}` } },
    elements,
  };

  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) }),
    });
    const data = (await resp.json()) as any;
    return data.code === 0;
  } catch {
    return false;
  }
}

/** 企微个人消息（纯文本） */
async function sendWecomPersonal(userid: string, title: string, content: string, link: string): Promise<boolean> {
  const corpId = await getConfig('wecom_corp_id');
  const corpSecret = await getConfig('wecom_corp_secret');
  const agentId = await getConfig('wecom_agent_id');
  if (!corpId || !corpSecret || !agentId) return false;

  try {
    const tokenResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`
    );
    const tokenData = (await tokenResp.json()) as any;
    if (tokenData.errcode !== 0) return false;

    const text = `${title}\n${content}${link ? `\n\n${link}` : ''}`;
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(tokenData.access_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touser: userid, msgtype: 'text', agentid: parseInt(agentId, 10), text: { content: text } }),
      }
    );
    const data = (await resp.json()) as any;
    return data.errcode === 0;
  } catch {
    return false;
  }
}

/** 钉钉个人消息（纯文本） */
async function sendDingtalkPersonal(openId: string, title: string, content: string, link: string): Promise<boolean> {
  const appKey = await getConfig('dingtalk_app_key');
  const appSecret = await getConfig('dingtalk_app_secret');
  const agentId = await getConfig('dingtalk_agent_id');
  if (!appKey || !appSecret || !agentId) return false;

  try {
    const tokenResp = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`
    );
    const tokenData = (await tokenResp.json()) as any;
    if (tokenData.errcode !== 0) return false;

    const text = `${title}\n${content}${link ? `\n\n${link}` : ''}`;
    const resp = await fetch(
      `https://oapi.dingtalk.com/topapi/im/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(tokenData.access_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: parseInt(agentId, 10),
          userid_list: openId,
          msg: { msgtype: 'text', text: { content: text } },
        }),
      }
    );
    const data = (await resp.json()) as any;
    return data.errcode === 0;
  } catch {
    return false;
  }
}

export interface PushResult {
  pushed: number;
  failed: number;
  skipped: number;
  /** 没跑的原因（disabled / no_im_columns / no_candidates），便于排查「为什么没推」 */
  reason?: string;
}

/**
 * 推送未推送的未读通知。
 *
 * 前置条件全部不满足时安静返回，不产生噪音日志、不改任何数据：
 *   - 总开关 notification_push_enabled != 'true'
 *   - users 表一个 IM 身份列都没有（没人用 IM 登录过）
 */
export async function pushUnreadNotifications(): Promise<PushResult> {
  ensureNotificationPushTables();

  if (!(await isPushEnabled())) {
    return { pushed: 0, failed: 0, skipped: 0, reason: 'disabled' };
  }

  // 只挑真实存在的 IM 身份列。一个都没有说明没人绑定过 IM，直接收工。
  const availableColumns = IM_IDENTITY_COLUMNS.filter(c => columnExists('users', c.column));
  if (availableColumns.length === 0) {
    return { pushed: 0, failed: 0, skipped: 0, reason: 'no_im_columns' };
  }

  const db = getAsyncDb();
  const selectCols = availableColumns.map(c => `u.${c.column}`).join(', ');
  // 至少有一个身份列非空才值得查出来
  const identityFilter = availableColumns.map(c => `u.${c.column} IS NOT NULL AND u.${c.column} <> ''`).join(' OR ');
  const windowExpr = isMysqlEnabled()
    ? `n.created_at >= DATE_SUB(NOW(), INTERVAL ${PUSH_WINDOW_HOURS} HOUR)`
    : `n.created_at >= datetime('now', '-${PUSH_WINDOW_HOURS} hours')`;

  const rows = (await db
    .prepare(
      `SELECT n.id, n.user_id, n.title, n.content, n.type, n.link, n.push_attempts, ${selectCols}
       FROM notifications n
       JOIN users u ON u.id = n.user_id
       WHERE n.is_read = 0
         AND n.notified_at IS NULL
         AND n.push_attempts < ${MAX_PUSH_ATTEMPTS}
         AND ${windowExpr}
         AND (${identityFilter})
       ORDER BY n.created_at ASC
       LIMIT ${BATCH_SIZE}`
    )
    .all()) as any[];

  if (rows.length === 0) {
    return { pushed: 0, failed: 0, skipped: 0, reason: 'no_candidates' };
  }

  let pushed = 0;
  let failed = 0;

  for (const row of rows) {
    const content = String(row.content || '').substring(0, 300);
    const link = row.link || '';
    const title = String(row.title || '(无标题)');

    // 按 feishu → wecom → dingtalk 顺序取第一个有值的身份
    let ok = false;
    let usedChannel: string | null = null;
    for (const { column, channel } of availableColumns) {
      const identity = row[column];
      if (!identity) continue;
      usedChannel = channel;
      if (channel === 'feishu') ok = await sendFeishuPersonal(identity, title, content, link);
      else if (channel === 'wecom') ok = await sendWecomPersonal(identity, title, content, link);
      else ok = await sendDingtalkPersonal(identity, title, content, link);
      break;
    }

    if (ok) {
      await db
        .prepare('UPDATE notifications SET notified_at = CURRENT_TIMESTAMP, notified_channel = ? WHERE id = ?')
        .run(usedChannel, row.id);
      pushed++;
    } else {
      // 关键：失败**不写 notified_at**，只累加尝试次数。
      // 达到 MAX_PUSH_ATTEMPTS 后被 WHERE 过滤掉，自然停止重试，
      // 但记录仍是「未推送」状态 —— 凭据修好后可以清零重推，不会被永久污染。
      const attempts = Number(row.push_attempts || 0) + 1;
      await db
        .prepare('UPDATE notifications SET push_attempts = ?, notified_channel = ? WHERE id = ?')
        .run(attempts, attempts >= MAX_PUSH_ATTEMPTS ? 'failed' : null, row.id);
      failed++;
    }
  }

  return { pushed, failed, skipped: rows.length - pushed - failed };
}