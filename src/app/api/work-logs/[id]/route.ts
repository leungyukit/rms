import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureWorklogTables } from '@/lib/worklog-migrations';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorklogTables();

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();
  const w = (await db.prepare(`SELECT * FROM work_logs WHERE id=?`).get(id)) as any;
  if (!w) return NextResponse.json({ error: '工时记录不存在' }, { status: 404 });
  if (w.user_id !== user.id && !isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '仅创建者或 admin 可改' }, { status: 403 });
  }

  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['work_date', 'description']) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(body[k]); }
  }
  if (body.hours !== undefined) {
    if (typeof body.hours !== 'number' || body.hours <= 0 || body.hours > 24) {
      return NextResponse.json({ error: '工时必须 0 < h ≤ 24' }, { status: 400 });
    }
    fields.push('hours = ?'); vals.push(body.hours);
  }
  if (!fields.length) return NextResponse.json({ error: '无可更新字段' }, { status: 400 });
  vals.push(id);
  (await db.prepare(`UPDATE work_logs SET ${fields.join(', ')} WHERE id=?`).run(...vals));

  // 触发器不能处理 hours 变化，遜历重算 actual_hours
  const sumRow = (await db.prepare(`SELECT COALESCE(SUM(hours), 0) total FROM work_logs WHERE requirement_id=?`).get(w.requirement_id)) as any;
  (await db.prepare(`UPDATE requirements SET actual_hours=?, resolution_time_hours=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(sumRow.total, sumRow.total, w.requirement_id));

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorklogTables();

  const { id } = await params;
  const db = getAsyncDb();
  const w = (await db.prepare(`SELECT * FROM work_logs WHERE id=?`).get(id)) as any;
  if (!w) return NextResponse.json({ error: '工时记录不存在' }, { status: 404 });
  if (w.user_id !== user.id && !isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '仅创建者或 admin 可删' }, { status: 403 });
  }

  (await db.prepare(`DELETE FROM work_logs WHERE id=?`).run(id));
  // 重新求和（冱足以应付触发器未创建的场景）
  const sumRow = (await db.prepare(`SELECT COALESCE(SUM(hours), 0) total FROM work_logs WHERE requirement_id=?`).get(w.requirement_id)) as any;
  (await db.prepare(`UPDATE requirements SET actual_hours=?, resolution_time_hours=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(sumRow.total, sumRow.total, w.requirement_id));
  return NextResponse.json({ success: true });
}
