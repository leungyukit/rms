import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureWorklogTables } from '@/lib/worklog-migrations';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureWorklogTables();

  const sp = req.nextUrl.searchParams;
  const userId = sp.get('user_id');
  const from = sp.get('from');
  const to = sp.get('to');
  const projectId = sp.get('project_id');
  const sprintId = sp.get('sprint_id');
  const requirementId = sp.get('requirement_id');

  const db = getAsyncDb();
  const where: string[] = [];
  const params: any[] = [];
  if (userId === 'me' || !userId) { where.push('w.user_id = ?'); params.push(user.id); }
  else if (userId) { where.push('w.user_id = ?'); params.push(parseInt(userId)); }
  if (from) { where.push('w.work_date >= ?'); params.push(from); }
  if (to) { where.push('w.work_date <= ?'); params.push(to); }
  if (projectId) { where.push('r.project_id = ?'); params.push(parseInt(projectId)); }
  if (sprintId) { where.push('w.sprint_id = ?'); params.push(parseInt(sprintId)); }
  if (requirementId) { where.push('w.requirement_id = ?'); params.push(parseInt(requirementId)); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = (await db.prepare(`
    SELECT w.*, u.display_name as user_name,
      r.title as req_title, r.project_id as project_id, p.name as project_name,
      s.name as sprint_name
    FROM work_logs w
    LEFT JOIN users u ON u.id=w.user_id
    LEFT JOIN requirements r ON r.id=w.requirement_id
    LEFT JOIN projects p ON p.id=r.project_id
    LEFT JOIN sprints s ON s.id=w.sprint_id
    ${whereSql}
    ORDER BY w.work_date DESC, w.created_at DESC
    LIMIT 200
  `).all(...params)) as any[];

  // 聚合
  const total = rows.reduce((s, r) => s + (r.hours || 0), 0);
  return NextResponse.json({ logs: rows, total_hours: total, count: rows.length });
}
