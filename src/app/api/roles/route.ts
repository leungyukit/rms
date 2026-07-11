import { NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();
  const roles = (await db.prepare('SELECT * FROM roles ORDER BY id').all());
  return NextResponse.json(roles);
}

export async function PUT(req: import('next/server').NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { role_id, project_ids } = await req.json();
  if (!role_id) return NextResponse.json({ error: '缺少角色ID' }, { status: 400 });

  const db = getAsyncDb();
  (await db.prepare('DELETE FROM role_project_access WHERE role_id = ?').run(role_id));
  if (project_ids && Array.isArray(project_ids)) {
    for (const pid of project_ids) {
      (await db.prepare('INSERT IGNORE INTO role_project_access (role_id, project_id) VALUES (?, ?)').run(role_id, pid));
    }
  }
  return NextResponse.json({ success: true });
}
