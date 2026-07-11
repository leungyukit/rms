import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  if (!id) return NextResponse.json({ error: '缺少关系ID' }, { status: 400 });

  const db = getAsyncDb();
  try {
    await db.prepare('DELETE FROM requirement_relations WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '删除失败' }, { status: 500 });
  }
}
