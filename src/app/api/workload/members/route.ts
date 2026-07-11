import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { computeSlaStatus, getRulesForPriority } from '@/lib/sla-scanner';
import { getSlaConfig, ensureSlaTables } from '@/lib/sla-migrations';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();
  const url = req.nextUrl;
  const scope = url.searchParams.get('scope') || 'all'; // all | overloaded | my

  // Get all users who have at least one requirement
  const userRows = (await db.prepare(`
    SELECT DISTINCT u.id, u.display_name, u.username
    FROM users u
    JOIN requirements r ON (r.handler_id = u.id OR r.receiver_id = u.id)
    WHERE r.merged_into IS NULL
  `).all()) as any[];

  const slaCfg = getSlaConfig();
  ensureSlaTables();

  const members = await Promise.all(userRows.map(async (u) => {
    // Active requirements (not closed/verified/completed)
    const activeReqs = (await db.prepare(`
      SELECT id, title, priority, planned_start, planned_end, status, estimate_hours, actual_hours
      FROM requirements
      WHERE handler_id = ? AND status NOT IN ('closed', 'verified', 'completed') AND merged_into IS NULL
    `).all(u.id)) as any[];

    const activeReqsCount = activeReqs.length;
    const totalEstimated = activeReqs.reduce((s, r) => s + (r.estimate_hours || 0), 0);
    const totalActual = activeReqs.reduce((s, r) => s + (r.actual_hours || 0), 0);

    // Overdue count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCount = activeReqs.filter(r => {
      if (!r.planned_end) return false;
      const end = new Date(r.planned_end);
      const rules = getRulesForPriority(r.priority, slaCfg);
      const sla = computeSlaStatus(r.planned_start, r.planned_end, r.status, rules);
      return sla.status === 'overdue';
    }).length;

    // Utilization: assume 8h/day, count active work days from planned_start to planned_end
    let totalWorkDays = 0;
    for (const r of activeReqs) {
      if (r.planned_start && r.planned_end) {
        const s = new Date(r.planned_start), e = new Date(r.planned_end);
        const days = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
        totalWorkDays += days;
      }
    }
    const availableHours = totalWorkDays * 8; // 8h/day
    const utilization = availableHours > 0 ? Math.round((totalEstimated / availableHours) * 100) : 0;

    // Get roles
    const roles = (await db.prepare(`
      SELECT r.name, r.label FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?
    `).all(u.id)) as any[];
    const roleName = roles.length > 0 ? roles.map(r => r.label || r.name).join(', ') : '成员';

    // Sprint IDs (batch query)
    let sprintIds: number[] = [];
    try {
      const activeReqIds = activeReqs.map(rr => rr.id).filter(Boolean);
      if (activeReqIds.length > 0) {
        const placeholders = activeReqIds.map(() => '?').join(',');
        const sprints = (await db.prepare(`
          SELECT DISTINCT sprint_id FROM requirement_sprints WHERE requirement_id IN (${placeholders})
        `).all(...activeReqIds)) as any[];
        sprintIds = sprints.map(s => s.sprint_id).filter(Boolean);
      }
    } catch { /* table may not exist */ }

    return {
      user_id: u.id,
      user_name: u.display_name,
      role_name: roleName,
      active_reqs: activeReqsCount,
      total_estimated: Math.round(totalEstimated * 10) / 10,
      total_actual: Math.round(totalActual * 10) / 10,
      utilization,
      overdue_count: overdueCount,
      sprint_ids: sprintIds,
    };
  }));

  // Filter by scope
  let filtered = members;
  if (scope === 'overloaded') filtered = members.filter(m => m.utilization >= 100);
  // 'my' is handled client-side since we need the current user's name

  return NextResponse.json({ members: filtered });
}
