import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureChecklistTables } from '@/lib/checklist-migrations';

const ALLOWED_STATUS = ['todo', 'in_progress', 'done', 'blocked'];

/**
 * GET /api/requirements/:id/checklist
 * 拉某需求的所有子任务
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureChecklistTables();
  const { id } = await params;
  const db = getAsyncDb();

  const rows = (await db.prepare(`
    SELECT c.*,
      u.display_name as assignee_name,
      cb.display_name as created_by_name,
      cfb.display_name as completed_by_name
    FROM requirement_checklist c
    LEFT JOIN users u ON u.id = c.assignee_id
    LEFT JOIN users cb ON cb.id = c.created_by
    LEFT JOIN users cfb ON cfb.id = c.completed_by
    WHERE c.requirement_id = ?
    ORDER BY c.sequence ASC, c.id ASC
  `).all(id));

  return NextResponse.json({ data: rows });
}

/**
 * POST /api/requirements/:id/checklist
 * 新增一项子任务
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureChecklistTables();
  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: 'title 必填' }, { status: 400 });
  }

  // 找最大 sequence，追加
  const maxRow = (await db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) as max_seq FROM requirement_checklist WHERE requirement_id = ?`
  ).get(id)) as any;
  const nextSeq = (maxRow?.max_seq || 0) + 100;

  const status = ALLOWED_STATUS.includes(body.status) ? body.status : 'todo';
  const priority = ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium';

  const result = (await db.prepare(`
    INSERT INTO requirement_checklist
      (requirement_id, title, description, sequence, assignee_id, due_date,
       status, priority, estimate_hours, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(body.title).trim(),
    body.description || null,
    nextSeq,
    body.assignee_id || null,
    body.due_date || null,
    status,
    priority,
    body.estimate_hours != null && body.estimate_hours !== '' ? Number(body.estimate_hours) : null,
    user.id
  ));

  logAudit(user.id, user.username, 'create_checklist_item',
    `需求 ${id} 新增子任务：${body.title} (#${result.lastInsertRowid})`);

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}
