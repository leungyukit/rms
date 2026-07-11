import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id } = await params;
  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT m.*, u.display_name as creator_name
    FROM project_milestones m LEFT JOIN users u ON u.id = m.created_by
    WHERE m.project_id = ?
    ORDER BY m.planned_date ASC, m.sort_order ASC
  `).all(id)) as any[];

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id } = await params;
  const body = await req.json();
  const { name, description, planned_date, weight, sort_order } = body;
  if (!name || !planned_date) return NextResponse.json({ error: '名称和计划日期必填' }, { status: 400 });

  const db = getAsyncDb();
  const proj = (await db.prepare(`SELECT id FROM projects WHERE id=?`).get(id));
  if (!proj) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

  const r = (await db.prepare(`
    INSERT INTO project_milestones(project_id, name, description, planned_date, weight, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || '', planned_date, weight ?? 1, sort_order ?? 0, user.id));
  return NextResponse.json({ id: r.lastInsertRowid, success: true });
}
