import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限，仅管理员可查看审计日志' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 200);
  const action = searchParams.get('action') || '';
  const username = searchParams.get('username') || '';
  const offset = (page - 1) * pageSize;

  const db = getAsyncDb();

  let where = '1=1';
  const params: any[] = [];
  if (action) { where += ' AND action = ?'; params.push(action); }
  if (username) { where += ' AND username LIKE ?'; params.push(`%${username}%`); }

  const total = ((await db.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${where}`).get(...params)) as any).count;
  const logs = (await db.prepare(`SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset));

  return NextResponse.json({ logs, total, page, pageSize });
}
