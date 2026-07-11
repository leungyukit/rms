import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureWorklogTables } from '@/lib/worklog-migrations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorklogTables();

  const { id } = await params;
  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT w.*, u.display_name as user_name
    FROM work_logs w LEFT JOIN users u ON u.id=w.user_id
    WHERE w.requirement_id=?
    ORDER BY w.work_date DESC, w.created_at DESC
  `).all(id)) as any[];

  const total = ((await db.prepare(`
    SELECT COALESCE(SUM(hours), 0) total_hours, COUNT(*) total_entries
    FROM work_logs WHERE requirement_id=?
  `).get(id)) as any);

  return NextResponse.json({ logs: rows, ...total });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorklogTables();

  const { id } = await params;
  const body = await req.json();
  const { work_date, hours, description } = body;

  // 校验
  if (typeof hours !== 'number' || hours <= 0 || hours > 24) {
    return NextResponse.json({ error: '工时必须 0 < h ≤ 24' }, { status: 400 });
  }
  if (hours * 2 !== Math.floor(hours * 2)) {
    return NextResponse.json({ error: '工时精度 0.5 小时' }, { status: 400 });
  }
  if (!work_date) return NextResponse.json({ error: '日期必填' }, { status: 400 });
  const today = new Date().toISOString().substring(0, 10);
  if (work_date > today) return NextResponse.json({ error: '不能晚于今天' }, { status: 400 });
  const daysDiff = (new Date(today).getTime() - new Date(work_date).getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 90) return NextResponse.json({ error: '不能早于 90 天前' }, { status: 400 });

  const db = getAsyncDb();
  const reqExists = (await db.prepare(`SELECT id, sprint_id FROM requirements WHERE id=?`).get(id)) as any;
  if (!reqExists) return NextResponse.json({ error: '需求不存在' }, { status: 404 });

  const r = (await db.prepare(`
    INSERT INTO work_logs(requirement_id, user_id, work_date, hours, description, sprint_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, user.id, work_date, hours, description || '', reqExists.sprint_id || null));

  // 双写：MySQL 生产环境可能无 SUPER 权限，触发器未创建，需手动同步 actual_hours
  // 用 INSERT 后重新查 SUM(hours) 而非累加，避免触发器已存在时重复加
  const sumRow = (await db.prepare(`SELECT COALESCE(SUM(hours), 0) total FROM work_logs WHERE requirement_id=?`).get(id)) as any;
  (await db.prepare(`UPDATE requirements SET actual_hours=?, resolution_time_hours=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(sumRow.total, sumRow.total, id));

  return NextResponse.json({ id: r.lastInsertRowid, success: true });
}
