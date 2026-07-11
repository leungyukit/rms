import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureRiskTables } from '@/lib/risk-migrations';
import { computeHealth, persistHealth } from '@/lib/health';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureRiskTables();
  ensureMilestoneTables();

  const { id, rid } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['title','description','type','level','status','strategy','owner_id','impact','mitigation_plan','resolved_note']) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(body[k]); }
  }
  if (!fields.length) return NextResponse.json({ error: '无可更新字段' }, { status: 400 });

  // 关闭风险时记录 resolved_at
  if (body.status === 'closed' || body.status === 'accepted') {
    fields.push('resolved_at = CURRENT_TIMESTAMP');
  } else if (body.status) {
    fields.push('resolved_at = NULL');
  }
  fields.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(rid);
  (await db.prepare(`UPDATE project_risks SET ${fields.join(', ')} WHERE id=? AND project_id=?`).run(...vals, id));

  const h = computeHealth(parseInt(id));
  persistHealth(parseInt(id), h);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureRiskTables();

  const { id, rid } = await params;
  const db = getAsyncDb();
  (await db.prepare(`DELETE FROM project_risks WHERE id=? AND project_id=?`).run(rid, id));

  const h = computeHealth(parseInt(id));
  persistHealth(parseInt(id), h);
  return NextResponse.json({ success: true });
}
