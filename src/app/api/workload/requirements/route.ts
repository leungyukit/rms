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
  const userId = parseInt(url.searchParams.get('user_id') || '0', 10);
  if (!userId) return NextResponse.json({ requirements: [] });

  ensureSlaTables();
  const slaCfg = getSlaConfig();

  const reqs = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.planned_start, r.planned_end,
           r.estimate_hours, r.actual_hours,
           p.name as project_name,
           u.display_name as handler_name,
           s.name as sprint_name
    FROM requirements r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN users u ON u.id = r.handler_id
    LEFT JOIN sprints s ON s.id = r.sprint_id
    WHERE r.handler_id = ? AND r.merged_into IS NULL
    ORDER BY r.planned_start DESC
  `).all(userId)) as any[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const requirements = reqs.map(r => {
    const rules = getRulesForPriority(r.priority, slaCfg);
    const sla = computeSlaStatus(r.planned_start, r.planned_end, r.status, rules);
    const deadline = r.planned_end || null;
    let daysLeft: number | null = null;
    if (deadline) {
      const end = new Date(deadline);
      daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    }
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      project_name: r.project_name || '—',
      sprint_name: r.sprint_name,
      estimate_hours: r.estimate_hours,
      actual_hours: r.actual_hours,
      handler_name: r.handler_name || '—',
      deadline,
      days_left: daysLeft,
      overdue: sla.status === 'overdue',
    };
  });

  return NextResponse.json({ requirements });
}
