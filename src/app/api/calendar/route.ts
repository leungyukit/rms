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

  // Get all handlers who have requirements (with or without planned dates)
  const handlers = (await db.prepare(`
    SELECT DISTINCT u.id, u.display_name
    FROM users u
    JOIN requirements r ON r.handler_id = u.id
    ORDER BY u.display_name
  `).all()) as any[];

  // Get requirements in date range (overlapping with [start, end])
  // Also include requirements without planned dates or with dates outside range
  let sql = `
    SELECT r.id, r.title, r.status, r.priority, r.planned_start, r.planned_end,
      r.handler_id, u.display_name as handler_name, p.name as project_name, r.category
    FROM requirements r
    LEFT JOIN users u ON u.id = r.handler_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.handler_id IS NOT NULL
  `;
  const params: any[] = [];
  
  // Only filter by date if both start and end are provided
  if (start && end) {
    sql += ` AND (
      (r.planned_start IS NULL AND r.planned_end IS NULL) OR
      (r.planned_start IS NOT NULL AND r.planned_end IS NOT NULL AND r.planned_start <= ? AND r.planned_end >= ?)
    )`;
    params.push(end, start);
  }

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
