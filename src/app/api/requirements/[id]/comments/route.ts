import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/requirements/[id]/comments - 获取需求的所有评论
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const db = getAsyncDb();

  const comments = (await db.prepare(`
    SELECT rc.*, u.display_name as user_name, u.username as user_username
    FROM requirement_comments rc
    LEFT JOIN users u ON u.id = rc.user_id
    WHERE rc.requirement_id = ?
    ORDER BY rc.created_at ASC
  `).all(id));

  return NextResponse.json(comments);
}

// POST /api/requirements/[id]/comments - 添加评论
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 });
  }

  // 检查需求是否存在
  const reqExists = (await db.prepare('SELECT id FROM requirements WHERE id = ?').get(id));
  if (!reqExists) {
    return NextResponse.json({ error: '需求不存在' }, { status: 404 });
  }

  const result = (await db.prepare(
    'INSERT INTO requirement_comments (requirement_id, user_id, content) VALUES (?, ?, ?)'
  ).run(id, user.id, body.content.trim()));

  // 获取刚插入的评论（包含用户信息）
  const comment = (await db.prepare(`
    SELECT rc.*, u.display_name as user_name, u.username as user_username
    FROM requirement_comments rc
    LEFT JOIN users u ON u.id = rc.user_id
    WHERE rc.id = ?
  `).get(result.lastInsertRowid));

  return NextResponse.json(comment, { status: 201 });
}

// DELETE /api/requirements/[id]/comments - 删除评论
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const commentId = body.id || new URL(req.url).searchParams.get('commentId');

  if (!commentId) {
    return NextResponse.json({ error: '缺少评论ID' }, { status: 400 });
  }

  const db = getAsyncDb();

  // 检查评论是否存在且属于该需求
  const comment = (await db.prepare(
    'SELECT * FROM requirement_comments WHERE id = ? AND requirement_id = ?'
  ).get(commentId, id)) as any;

  if (!comment) {
    return NextResponse.json({ error: '评论不存在' }, { status: 404 });
  }

  // 检查权限（只有评论作者或管理员可以删除）
  const isAdmin = (await db.prepare(
    "SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.name = 'global_admin'"
  ).get(user.id));

  if (comment.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: '无权删除此评论' }, { status: 403 });
  }

  (await db.prepare('DELETE FROM requirement_comments WHERE id = ?').run(commentId));

  return NextResponse.json({ success: true });
}
