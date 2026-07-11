import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureSprintTables();

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get('project_id');
  const status = sp.get('status');
  const active = sp.get('active');
  const includeStats = sp.get('stats') === '1';

  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();
  const where: string[] = [];
  const params: any[] = [];

  if (projectId) { where.push('s.project_id = ?'); params.push(parseInt(projectId)); }
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (active === '1' || active === 'true') { where.push("s.status = 'active'"); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = (await db.prepare(`
    SELECT s.*, p.name as project_name,
      u.display_name as creator_name
    FROM sprints s
    LEFT JOIN projects p ON p.id = s.project_id
    LEFT JOIN users u ON u.id = s.created_by
    ${whereSql}
    ORDER BY s.start_date DESC, s.id DESC
  `).all(...params)) as any[];

  if (includeStats) {
    for (const r of rows) {
      const stat = (await db.prepare(`
        SELECT COUNT(*) total,
          SUM(CASE WHEN r.status IN ('completed','verified','closed') THEN 1 ELSE 0 END) done,
          SUM(CASE WHEN r.status='in_progress' THEN 1 ELSE 0 END) in_progress,
          SUM(CASE WHEN r.status IN ('received_not_evaluated','evaluated_not_scheduled') THEN 1 ELSE 0 END) todo,
          SUM(COALESCE(r.estimate_hours,0)) estimated_hours,
          SUM(COALESCE(r.actual_hours,0)) logged_hours
        FROM requirements r
        WHERE r.sprint_id = ? AND r.merged_into IS NULL
      `).get(r.id)) as any;
      r.stats = {
        total: stat.total || 0,
        done: stat.done || 0,
        in_progress: stat.in_progress || 0,
        todo: stat.todo || 0,
        estimated_hours: stat.estimated_hours || 0,
        logged_hours: stat.logged_hours || 0,
        completion_rate: stat.total ? Math.round((stat.done / stat.total) * 100) : 0,
        capacity_pct: r.capacity_hours ? Math.round((stat.estimated_hours / r.capacity_hours) * 100) : 0,
      };
    }
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureSprintTables();

  const body = await req.json();
  const { project_id, name, goal, start_date, end_date, capacity_hours, notes } = body;

  if (!project_id || !name || !start_date || !end_date) {
    return NextResponse.json({ error: '项目、名称、起止日期必填' }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: '结束日期不能早于开始日期' }, { status: 400 });
  }

  const db = getAsyncDb();
  const project = (await db.prepare(`SELECT id FROM projects WHERE id=?`).get(project_id));
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 400 });

  const result = (await db.prepare(`
    INSERT INTO sprints(project_id, name, goal, start_date, end_date, capacity_hours, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(project_id, name, goal || '', start_date, end_date, capacity_hours || 0, notes || '', user.id));

  return NextResponse.json({ id: result.lastInsertRowid, success: true });
}
