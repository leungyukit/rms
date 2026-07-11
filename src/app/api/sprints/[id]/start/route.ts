import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

// 开始 Sprint：planned → active（检查同项目下是否已有 active）
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const db = getAsyncDb();
  const sprint = (await db.prepare(`SELECT * FROM sprints WHERE id=?`).get(id)) as any;
  if (!sprint) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });
  if (sprint.status === 'active') return NextResponse.json({ error: 'Sprint 已经在进行中' }, { status: 400 });
  if (sprint.status === 'completed' || sprint.status === 'cancelled') {
    return NextResponse.json({ error: `Sprint 已 ${sprint.status}，无法开始` }, { status: 400 });
  }

  // 同项目冲突检查
  const active = (await db.prepare(`SELECT id, name FROM sprints WHERE project_id=? AND status='active' AND id != ?`).get(sprint.project_id, id)) as any;
  if (active) {
    return NextResponse.json({ error: `项目下已有进行中的 Sprint: #${active.id} ${active.name}`, conflict: active }, { status: 409 });
  }

  (await db.prepare(`UPDATE sprints SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id));
  return NextResponse.json({ success: true });
}
