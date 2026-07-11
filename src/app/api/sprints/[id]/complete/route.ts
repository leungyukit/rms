import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

// 完成 Sprint：active → completed（未完成需求写 status_log 并清空 sprint_id）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const carryOverTo: number | null = body.carry_over_to_sprint_id || null; // 把未完成的需求顺延到下一 Sprint

  const db = getAsyncDb();
  const sprint = (await db.prepare(`SELECT * FROM sprints WHERE id=?`).get(id)) as any;
  if (!sprint) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });
  if (sprint.status === 'completed') return NextResponse.json({ error: 'Sprint 已完成' }, { status: 400 });
  if (sprint.status !== 'active' && sprint.status !== 'planned') {
    return NextResponse.json({ error: 'Sprint 状态异常' }, { status: 400 });
  }

  // 找未完成需求
  const incomplete = (await db.prepare(`
    SELECT id, title, status FROM requirements
    WHERE sprint_id=? AND status NOT IN ('completed','verified','closed') AND merged_into IS NULL
  `).all(id)) as any[];

  const done = (await db.prepare(`
    SELECT COUNT(*) c FROM requirements
    WHERE sprint_id=? AND status IN ('completed','verified','closed') AND merged_into IS NULL
  `).get(id)) as any;

  // 写 status_log（未完成记录）
  for (const r of incomplete) {
    try {
      (await db.prepare(`INSERT INTO status_log(requirement_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)`)
        .run(r.id, r.status, 'sprint_carry_over', user.id));
    } catch (e) {}
  }

  // 移出 Sprint
  if (carryOverTo) {
    // 顺延到下一 Sprint
    const target = (await db.prepare(`SELECT id, project_id FROM sprints WHERE id=?`).get(carryOverTo)) as any;
    if (!target) return NextResponse.json({ error: '目标 Sprint 不存在' }, { status: 400 });
    if (target.project_id !== sprint.project_id) return NextResponse.json({ error: '目标 Sprint 不属于同项目' }, { status: 400 });
    for (const r of incomplete) {
      (await db.prepare(`DELETE FROM requirement_sprints WHERE requirement_id=?`).run(r.id));
      try {
        (await db.prepare(`INSERT INTO requirement_sprints(requirement_id, sprint_id) VALUES (?, ?)`).run(r.id, carryOverTo));
      } catch (e) {
        (await db.prepare(`UPDATE requirements SET sprint_id=NULL WHERE id=?`).run(r.id));
      }
    }
  } else {
    (await db.prepare(`DELETE FROM requirement_sprints WHERE sprint_id=?`).run(id));
    (await db.prepare(`UPDATE requirements SET sprint_id=NULL WHERE sprint_id=?`).run(id));
  }

  (await db.prepare(`UPDATE sprints SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id));

  return NextResponse.json({
    success: true,
    summary: {
      total: incomplete.length + (done.c || 0),
      done: done.c || 0,
      incomplete: incomplete.length,
      carry_over_to: carryOverTo,
    },
  });
}
