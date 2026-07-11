import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureChecklistTables } from '@/lib/checklist-migrations';

const ALLOWED_STATUS = ['todo', 'in_progress', 'done', 'blocked'];

/**
 * PATCH /api/checklist/:id
 * 更新：勾选 done、改状态、改负责人、改截止日、填工时等
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureChecklistTables();
  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM requirement_checklist WHERE id = ?').get(id)) as any;
  if (!existing) return NextResponse.json({ error: '子任务不存在' }, { status: 404 });

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (body.title !== undefined) {
    if (!String(body.title).trim()) {
      return NextResponse.json({ error: 'title 不能为空' }, { status: 400 });
    }
    updates.push('title = ?');
    values.push(String(body.title).trim());
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    values.push(body.description || null);
  }
  if (body.assignee_id !== undefined) {
    updates.push('assignee_id = ?');
    values.push(body.assignee_id || null);
  }
  if (body.due_date !== undefined) {
    updates.push('due_date = ?');
    values.push(body.due_date || null);
  }
  if (body.priority !== undefined) {
    if (!['high', 'medium', 'low'].includes(body.priority)) {
      return NextResponse.json({ error: 'priority 必须为 high/medium/low' }, { status: 400 });
    }
    updates.push('priority = ?');
    values.push(body.priority);
  }
  if (body.estimate_hours !== undefined) {
    const n = body.estimate_hours === null || body.estimate_hours === '' ? null : Number(body.estimate_hours);
    if (n !== null && (isNaN(n) || n < 0)) {
      return NextResponse.json({ error: 'estimate_hours 必须为 ≥ 0 的数字' }, { status: 400 });
    }
    updates.push('estimate_hours = ?');
    values.push(n);
  }
  if (body.actual_hours !== undefined) {
    const n = body.actual_hours === null || body.actual_hours === '' ? null : Number(body.actual_hours);
    if (n !== null && (isNaN(n) || n < 0)) {
      return NextResponse.json({ error: 'actual_hours 必须为 ≥ 0 的数字' }, { status: 400 });
    }
    updates.push('actual_hours = ?');
    values.push(n);
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: `status 必须为 ${ALLOWED_STATUS.join('/')}` }, { status: 400 });
    }
    updates.push('status = ?');
    values.push(body.status);
    if (body.status === 'done' && existing.status !== 'done') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
      updates.push('completed_by = ?');
      values.push(user.id);
    } else if (body.status !== 'done' && existing.status === 'done') {
      // 退回：从 done 退回时清掉完成人
      updates.push('completed_at = NULL');
      updates.push('completed_by = NULL');
    }
  }
  if (body.blocked_reason !== undefined) {
    updates.push('blocked_reason = ?');
    values.push(body.blocked_reason || null);
  }
  if (body.sequence !== undefined) {
    const n = Number(body.sequence);
    if (isNaN(n) || n < 1) {
      return NextResponse.json({ error: 'sequence 必须为 ≥ 1 的整数' }, { status: 400 });
    }
    updates.push('sequence = ?');
    values.push(Math.floor(n));
  }

  if (updates.length > 1) {
    values.push(id);
    (await db.prepare(`UPDATE requirement_checklist SET ${updates.join(', ')} WHERE id = ?`).run(...values));
  }

  logAudit(user.id, user.username, 'update_checklist_item',
    `子任务 #${id} 更新：${Object.keys(body).join(', ')}`);

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/checklist/:id
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureChecklistTables();
  const { id } = await params;
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM requirement_checklist WHERE id = ?').get(id)) as any;
  if (!existing) return NextResponse.json({ error: '子任务不存在' }, { status: 404 });

  (await db.prepare('DELETE FROM requirement_checklist WHERE id = ?').run(id));
  logAudit(user.id, user.username, 'delete_checklist_item', `删除子任务 #${id}（需求 ${existing.requirement_id}）`);

  return NextResponse.json({ success: true });
}
