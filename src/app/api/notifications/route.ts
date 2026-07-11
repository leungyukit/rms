import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/notifications - 获取当前用户的所有通知
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';

  const db = getAsyncDb();
  let sql = `
    SELECT n.* FROM notifications n
    WHERE n.user_id = ?
  `;

  if (unreadOnly) {
    sql += ' AND n.is_read = 0';
  }

  sql += ' ORDER BY n.created_at DESC LIMIT 50';

  const notifications = (await db.prepare(sql).all(user.id));
  const unreadCount = ((await db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(user.id)) as any).c;

  return NextResponse.json({ notifications, unreadCount });
}

// POST /api/notifications - 创建通知
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const db = getAsyncDb();

  if (!body.type || !body.title) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  // 如果没有指定用户ID，则通知当前用户
  const targetUserId = body.user_id || user.id;

  const result = (await db.prepare(
    'INSERT INTO notifications (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)'
  ).run(targetUserId, body.type, body.title, body.content || '', body.link || ''));

  return NextResponse.json({ id: result.lastInsertRowid, success: true }, { status: 201 });
}

// PUT /api/notifications - 标记通知为已读
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const db = getAsyncDb();

  if (body.id) {
    // 标记单个通知为已读
    (await db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
    ).run(body.id, user.id));
  } else if (body.markAll) {
    // 标记所有通知为已读
    (await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id));
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/notifications - 删除通知
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const db = getAsyncDb();

  if (id) {
    // 删除单个通知
    (await db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, user.id));
  } else if (searchParams.get('clearRead') === 'true') {
    // 清除所有已读通知
    (await db.prepare('DELETE FROM notifications WHERE user_id = ? AND is_read = 1').run(user.id));
  }

  return NextResponse.json({ success: true });
}
