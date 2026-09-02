import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/tasks/recent?since=<ISO 或 'YYYY-MM-DD HH:MM:SS'>
 *
 * 给右下角气泡提示用：只返回「上次获取之后」发生的两类动静。
 *
 *   a. 指派给我的任务    —— handler_id / verifier_id 是我，且窗口内新建或有更新
 *   b. 我建的任务有状态变化 —— receiver_id 是我（建需求时写的就是 user.id），
 *                            且 status_log 在窗口内有记录
 *
 * 两点设计说明：
 * - **排除自己触发的状态变更**（changed_by = 我）。自己刚点的操作再弹给自己看是噪音。
 * - **窗口上限 7 天**。since 由前端 localStorage 带上来，属于不可信输入：
 *   传个 1970 年就会全表扫。夹住既防误用也防手搓 URL。
 */

const MAX_LOOKBACK_DAYS = 7;
const MAX_ITEMS = 20;

/** 统一成 'YYYY-MM-DD HH:MM:SS' —— MySQL DATETIME 和 SQLite TEXT 都能直接比较 */
function toSqlDatetime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 解析并夹紧 since：非法/过旧/未来一律回落到安全值 */
function resolveSince(raw: string | null): { since: string; clamped: boolean } {
  const now = Date.now();
  const floor = now - MAX_LOOKBACK_DAYS * 86400_000;
  // 默认看过去 1 小时（跟前端轮询周期一致）
  let ts = now - 3600_000;
  let clamped = false;

  if (raw) {
    const parsed = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    if (Number.isFinite(parsed)) {
      ts = parsed;
    } else {
      clamped = true;
    }
  }
  if (ts < floor) { ts = floor; clamped = true; }
  if (ts > now) { ts = now; clamped = true; }

  return { since: toSqlDatetime(new Date(ts)), clamped };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const { since, clamped } = resolveSince(searchParams.get('since'));
  const db = getAsyncDb();
  const now = toSqlDatetime(new Date());

  // a. 指派给我的（处理人或验证人），窗口内新建或有变动
  const assigned = (await db
    .prepare(
      `SELECT r.id, r.title, r.status, r.priority, r.created_at, r.updated_at,
              CASE WHEN r.created_at > ? THEN 1 ELSE 0 END AS is_new
       FROM requirements r
       WHERE (r.handler_id = ? OR r.verifier_id = ?)
         AND (r.created_at > ? OR r.updated_at > ?)
         AND (r.merged_into IS NULL OR r.merged_into = 0)
       ORDER BY COALESCE(r.updated_at, r.created_at) DESC
       LIMIT ${MAX_ITEMS}`
    )
    .all(since, user.id, user.id, since, since)) as any[];

  // b. 我建的任务，窗口内被【别人】改了状态
  const statusChanged = (await db
    .prepare(
      `SELECT r.id, r.title, r.status, r.priority,
              s.old_status, s.new_status, s.changed_at,
              u.display_name AS changed_by_name
       FROM status_log s
       JOIN requirements r ON r.id = s.requirement_id
       LEFT JOIN users u ON u.id = s.changed_by
       WHERE r.receiver_id = ?
         AND s.changed_at > ?
         AND (s.changed_by IS NULL OR s.changed_by <> ?)
         AND (r.merged_into IS NULL OR r.merged_into = 0)
       ORDER BY s.changed_at DESC
       LIMIT ${MAX_ITEMS}`
    )
    .all(user.id, since, user.id)) as any[];

  const label = (s: string | null) => (s ? STATUS_MAP[s] || s : '');

  const items = [
    ...assigned.map(r => ({
      kind: 'assigned' as const,
      id: r.id,
      title: r.title,
      status: r.status,
      statusLabel: label(r.status),
      priority: r.priority,
      isNew: Number(r.is_new) === 1,
      at: r.updated_at || r.created_at,
      text: Number(r.is_new) === 1 ? '新指派给你' : '你负责的任务有更新',
    })),
    ...statusChanged.map(r => ({
      kind: 'status_changed' as const,
      id: r.id,
      title: r.title,
      status: r.new_status || r.status,
      statusLabel: label(r.new_status || r.status),
      priority: r.priority,
      at: r.changed_at,
      from: label(r.old_status),
      to: label(r.new_status),
      by: r.changed_by_name || '',
      text: `${label(r.old_status) || '—'} → ${label(r.new_status)}`,
    })),
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  return NextResponse.json({
    items: items.slice(0, MAX_ITEMS),
    counts: { assigned: assigned.length, statusChanged: statusChanged.length },
    since,
    // 前端拿这个当下次查询的起点，别用本地时钟 —— 客户端与服务端可能有时差
    now,
    clamped,
  });
}
