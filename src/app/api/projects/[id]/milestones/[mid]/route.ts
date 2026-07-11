import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id, mid } = await params;
  const body = await req.json();
  const db = getAsyncDb();
  const m = (await db.prepare(`SELECT * FROM project_milestones WHERE id=? AND project_id=?`).get(mid, id));
  if (!m) return NextResponse.json({ error: '里程碑不存在' }, { status: 404 });

  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['name','description','planned_date','actual_date','weight','sort_order','status']) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(body[k]); }
  }
  if (!fields.length) return NextResponse.json({ error: '无可更新字段' }, { status: 400 });
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  vals.push(mid);
  (await db.prepare(`UPDATE project_milestones SET ${fields.join(', ')} WHERE id=?`).run(...vals));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id, mid } = await params;
  const db = getAsyncDb();
  const r = (await db.prepare(`SELECT id FROM project_milestones WHERE id=? AND project_id=?`).get(mid, id));
  if (!r) return NextResponse.json({ error: '里程碑不存在' }, { status: 404 });
  (await db.prepare(`DELETE FROM project_milestones WHERE id=?`).run(mid));
  return NextResponse.json({ success: true });
}
