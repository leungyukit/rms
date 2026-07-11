import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const db = getAsyncDb();
  const sprint = (await db.prepare(`
    SELECT s.*, p.name as project_name, u.display_name as creator_name
    FROM sprints s LEFT JOIN projects p ON p.id=s.project_id LEFT JOIN users u ON u.id=s.created_by
    WHERE s.id=?
  `).get(id)) as any;
  if (!sprint) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });

  const reqs = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.handler_id, r.estimate_hours, r.actual_hours,
      r.planned_start, r.planned_end, u.display_name as handler_name
    FROM requirements r
    LEFT JOIN users u ON u.id=r.handler_id
    WHERE r.sprint_id=? AND r.merged_into IS NULL
    ORDER BY r.status, r.priority='high' DESC, r.estimate_hours DESC
  `).all(id)) as any[];

  const stat = (await db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN r.status IN ('completed','verified','closed') THEN 1 ELSE 0 END) done,
      SUM(CASE WHEN r.status='in_progress' THEN 1 ELSE 0 END) in_progress,
      SUM(COALESCE(r.estimate_hours,0)) estimated_hours,
      SUM(COALESCE(r.actual_hours,0)) logged_hours,
      SUM(CASE WHEN r.planned_end < CURDATE() AND r.status NOT IN ('completed','verified','closed') THEN 1 ELSE 0 END) overdue_count
    FROM requirements r WHERE r.sprint_id=? AND r.merged_into IS NULL
  `).get(id)) as any;

  sprint.stats = {
    total: stat.total || 0,
    done: stat.done || 0,
    in_progress: stat.in_progress || 0,
    completion_rate: stat.total ? Math.round((stat.done / stat.total) * 100) : 0,
    estimated_hours: stat.estimated_hours || 0,
    logged_hours: stat.logged_hours || 0,
    overdue_count: stat.overdue_count || 0,
    capacity_pct: sprint.capacity_hours ? Math.round(((stat.estimated_hours || 0) / sprint.capacity_hours) * 100) : 0,
  };
  sprint.requirements = reqs;
  return NextResponse.json(sprint);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();
  const old = (await db.prepare(`SELECT * FROM sprints WHERE id=?`).get(id)) as any;
  if (!old) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });

  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['name','goal','start_date','end_date','capacity_hours','notes','status']) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(body[k]); }
  }
  if (body.start_date && body.end_date && body.end_date < body.start_date) {
    return NextResponse.json({ error: '结束日期不能早于开始日期' }, { status: 400 });
  }
  if (!fields.length) return NextResponse.json({ error: '无可更新字段' }, { status: 400 });
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  vals.push(id);
  (await db.prepare(`UPDATE sprints SET ${fields.join(', ')} WHERE id=?`).run(...vals));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const db = getAsyncDb();
  const sp = (await db.prepare(`SELECT * FROM sprints WHERE id=?`).get(id)) as any;
  if (!sp) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });

  if (sp.status === 'planned') {
    // 硬删 + 清关联
    (await db.prepare(`DELETE FROM requirement_sprints WHERE sprint_id=?`).run(id));
    (await db.prepare(`UPDATE requirements SET sprint_id=NULL WHERE sprint_id=?`).run(id));
    (await db.prepare(`DELETE FROM sprints WHERE id=?`).run(id));
    return NextResponse.json({ success: true, mode: 'hard_delete' });
  } else {
    // 软关：active/completed → cancelled
    (await db.prepare(`UPDATE sprints SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id));
    (await db.prepare(`DELETE FROM requirement_sprints WHERE sprint_id=?`).run(id));
    (await db.prepare(`UPDATE requirements SET sprint_id=NULL WHERE sprint_id=?`).run(id));
    return NextResponse.json({ success: true, mode: 'cancelled' });
  }
}
