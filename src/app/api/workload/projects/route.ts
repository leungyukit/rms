import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();

  // RBAC: get accessible project IDs
  const projectIds: number[] = [];
  if (user.roles?.includes('global_admin')) {
    const all = (await db.prepare('SELECT id FROM projects').all()) as any[];
    projectIds.push(...all.map(p => p.id));
  } else {
    const roles = (await db.prepare(`
      SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?
    `).all(user.id)) as any[];
    const roleNames = roles.map(r => r.name);

    if (roleNames.includes('project_receiver') || roleNames.includes('requirement_handler') || roleNames.includes('global_admin')) {
      const projRows = (await db.prepare(`
        SELECT DISTINCT project_id FROM project_roles WHERE user_id = ?
      `).all(user.id)) as any[];
      projectIds.push(...projRows.map(p => p.project_id).filter(Boolean));
    }
  }

  if (projectIds.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const placeholders = projectIds.map(() => '?').join(',');

  const rows = (await db.prepare(`
    SELECT p.id as project_id, p.name as project_name,
           COUNT(r.id) as req_count,
           COALESCE(SUM(r.estimate_hours), 0) as estimate_total,
           COALESCE(SUM(r.actual_hours), 0) as actual_total
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id AND r.merged_into IS NULL
      AND r.status NOT IN ('closed', 'verified', 'completed')
    WHERE p.id IN (${placeholders})
    GROUP BY p.id, p.name
    ORDER BY p.name
  `).all(...projectIds)) as any[];

  // For each project, get members
  const projects = await Promise.all(rows.map(async (p) => {
    const memberRows = (await db.prepare(`
      SELECT DISTINCT u.id, u.display_name
      FROM users u
      JOIN requirements r ON (r.handler_id = u.id OR r.receiver_id = u.id)
      WHERE r.project_id = ? AND r.merged_into IS NULL
    `).all(p.project_id)) as any[];

    const members = memberRows.map(m => ({
      user_id: m.id,
      user_name: m.display_name,
      active_reqs: 0,
      total_estimated: 0,
      total_actual: 0,
      utilization: 0,
      overdue_count: 0,
    }));

    return {
      project_id: p.project_id,
      project_name: p.project_name,
      req_count: p.req_count,
      estimate_total: p.estimate_total,
      actual_total: p.actual_total,
      members,
    };
  }));

  return NextResponse.json({ projects });
}
