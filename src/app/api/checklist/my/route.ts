import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureChecklistTables } from '@/lib/checklist-migrations';

/**
 * GET /api/checklist/my
 * "我的待办"：当前用户作为 assignee_id 的所有未完成项
 * 可选 ?include_done=1 包含已完成
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  ensureChecklistTables();
  const db = getAsyncDb();
  const includeDone = req.nextUrl.searchParams.get('include_done') === '1';

  const where = `c.assignee_id = ? ${includeDone ? '' : "AND c.status != 'done'"}`;
  const rows = (await db.prepare(`
    SELECT c.*,
      r.title as requirement_title,
      r.status as requirement_status,
      r.priority as requirement_priority,
      p.name as project_name
    FROM requirement_checklist c
    JOIN requirements r ON r.id = c.requirement_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE ${where}
    ORDER BY
      CASE WHEN c.due_date IS NULL THEN 1 ELSE 0 END,
      c.due_date ASC,
      c.priority DESC,
      c.id ASC
  `).all(user.id));

  return NextResponse.json({ data: rows });
}
