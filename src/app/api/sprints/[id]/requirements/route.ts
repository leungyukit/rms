import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

// 批量加入需求到 Sprint
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const body = await req.json();
  const requirementIds: number[] = body.requirement_ids || [];
  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    return NextResponse.json({ error: 'requirement_ids 不能为空' }, { status: 400 });
  }

  const db = getAsyncDb();
  const sprint = (await db.prepare(`SELECT id, status, project_id FROM sprints WHERE id=?`).get(id)) as any;
  if (!sprint) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });
  if (sprint.status === 'cancelled' || sprint.status === 'completed') {
    return NextResponse.json({ error: `Sprint 状态为 ${sprint.status}，不能加入需求` }, { status: 400 });
  }

  // 验证需求都属于同项目
  const placeholders = requirementIds.map(() => '?').join(',');
  const reqs = (await db.prepare(`SELECT id, project_id, title FROM requirements WHERE id IN (${placeholders})`).all(...requirementIds)) as any[];
  if (reqs.length !== requirementIds.length) {
    return NextResponse.json({ error: '部分需求不存在' }, { status: 400 });
  }
  const wrongProj = reqs.find(r => r.project_id !== sprint.project_id);
  if (wrongProj) return NextResponse.json({ error: `需求 #${wrongProj.id} 不属于该项目` }, { status: 400 });

  let added = 0, skipped = 0;
  for (const rid of requirementIds) {
    // UNIQUE(requirement_id)：一个需求只能属于一个 Sprint
    const existing = (await db.prepare(`SELECT sprint_id FROM requirement_sprints WHERE requirement_id=?`).get(rid)) as any;
    if (existing) {
      if (existing.sprint_id === parseInt(id)) { skipped++; continue; }
      // 从旧 Sprint 移出
      (await db.prepare(`DELETE FROM requirement_sprints WHERE requirement_id=?`).run(rid));
      (await db.prepare(`UPDATE requirements SET sprint_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(rid));
    }
    try {
      (await db.prepare(`INSERT INTO requirement_sprints(requirement_id, sprint_id) VALUES (?, ?)`).run(rid, id));
      // 兜底：触发器失败时手动双写
      (await db.prepare(`UPDATE requirements SET sprint_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id, rid));
      added++;
    } catch (e) { skipped++; }
  }

  return NextResponse.json({ success: true, added, skipped, total: requirementIds.length });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const body = await req.json();
  const rid = body.requirement_id;
  if (!rid) return NextResponse.json({ error: 'requirement_id 必填' }, { status: 400 });

  const db = getAsyncDb();
  const r = (await db.prepare(`SELECT * FROM requirement_sprints WHERE requirement_id=? AND sprint_id=?`).get(rid, id));
  if (!r) return NextResponse.json({ error: '该需求不在此 Sprint' }, { status: 404 });

  (await db.prepare(`DELETE FROM requirement_sprints WHERE requirement_id=? AND sprint_id=?`).run(rid, id));
  (await db.prepare(`UPDATE requirements SET sprint_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(rid));
  return NextResponse.json({ success: true });
}
