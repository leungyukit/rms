import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP, PRIORITY_MAP } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start'); // YYYY-MM-DD
  const end = searchParams.get('end');     // YYYY-MM-DD
  const handlerId = searchParams.get('handler_id');

  if (!start || !end) return NextResponse.json({ error: '请提供 start 和 end 日期' }, { status: 400 });

  const db = getAsyncDb();

  // Get all handlers
  const handlers = (await db.prepare(`
    SELECT DISTINCT u.id, u.display_name
    FROM users u
    JOIN requirements r ON r.handler_id = u.id
    WHERE r.planned_start IS NOT NULL AND r.planned_end IS NOT NULL
    ORDER BY u.display_name
  `).all()) as any[];

  // Get requirements in date range (overlapping with [start, end])
  let sql = `
    SELECT r.id, r.title, r.status, r.priority, r.planned_start, r.planned_end,
      r.handler_id, u.display_name as handler_name, p.name as project_name, r.category
    FROM requirements r
    LEFT JOIN users u ON u.id = r.handler_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.planned_start IS NOT NULL AND r.planned_end IS NOT NULL
      AND r.planned_start <= ? AND r.planned_end >= ?
      AND r.handler_id IS NOT NULL
  `;
  const params: any[] = [end, start];

  if (handlerId) {
    sql += ' AND r.handler_id = ?';
    params.push(handlerId);
  }

  sql += ' ORDER BY r.handler_id, r.planned_start, r.priority DESC';

  const requirements = (await db.prepare(sql).all(...params)) as any[];

  // Enrich with labels
  const enriched = requirements.map(r => ({
    ...r,
    status_label: STATUS_MAP[r.status] || r.status,
    priority_label: PRIORITY_MAP[r.priority] || r.priority,
  }));

  return NextResponse.json({ handlers, requirements: enriched });
}
