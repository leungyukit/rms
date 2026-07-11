import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureAcceptanceCriteriaTables } from '@/lib/ac-migrations';

const ALLOWED_TYPES = ['manual', 'auto', 'metric'];
const ALLOWED_STATUS = ['pending', 'passed', 'failed', 'skipped'];

/**
 * PATCH /api/acceptance-criteria/:id
 * 单条更新：状态勾选 / 证据 / 类型 / 文本
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAcceptanceCriteriaTables();
  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM requirement_acceptance_criteria WHERE id = ?').get(id)) as any;
  if (!existing) return NextResponse.json({ error: 'AC 不存在' }, { status: 404 });

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (body.criterion_text !== undefined) {
    if (!String(body.criterion_text).trim()) {
      return NextResponse.json({ error: 'criterion_text 不能为空' }, { status: 400 });
    }
    updates.push('criterion_text = ?');
    values.push(String(body.criterion_text).trim());
  }

  if (body.acceptance_type !== undefined) {
    if (!ALLOWED_TYPES.includes(body.acceptance_type)) {
      return NextResponse.json({ error: `acceptance_type 必须为 ${ALLOWED_TYPES.join('/')}` }, { status: 400 });
    }
    updates.push('acceptance_type = ?');
    values.push(body.acceptance_type);
  }

  if (body.target_value !== undefined) {
    updates.push('target_value = ?');
    values.push(body.target_value || null);
  }

  if (body.is_required !== undefined) {
    updates.push('is_required = ?');
    values.push(body.is_required === 0 || body.is_required === false ? 0 : 1);
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: `status 必须为 ${ALLOWED_STATUS.join('/')}` }, { status: 400 });
    }
    updates.push('status = ?');
    values.push(body.status);
    // 状态变为 passed/failed 时记录验证人
    if ((body.status === 'passed' || body.status === 'failed') &&
        (existing.status !== 'passed' && existing.status !== 'failed')) {
      updates.push('verified_by = ?');
      values.push(user.id);
      updates.push('verified_at = CURRENT_TIMESTAMP');
    } else if (body.status === 'pending') {
      // 退回 pending 时清掉验证人
      updates.push('verified_by = NULL');
      updates.push('verified_at = NULL');
    }
  }

  if (body.evidence !== undefined) {
    updates.push('evidence = ?');
    values.push(body.evidence || null);
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
    (await db.prepare(`UPDATE requirement_acceptance_criteria SET ${updates.join(', ')} WHERE id = ?`).run(...values));
  }

  logAudit(user.id, user.username, 'update_acceptance_criteria',
    `AC #${id} 更新：${Object.keys(body).join(', ')}`);

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/acceptance-criteria/:id
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAcceptanceCriteriaTables();
  const { id } = await params;
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM requirement_acceptance_criteria WHERE id = ?').get(id)) as any;
  if (!existing) return NextResponse.json({ error: 'AC 不存在' }, { status: 404 });

  (await db.prepare('DELETE FROM requirement_acceptance_criteria WHERE id = ?').run(id));
  logAudit(user.id, user.username, 'delete_acceptance_criteria', `删除 AC #${id}（需求 ${existing.requirement_id}）`);

  return NextResponse.json({ success: true });
}
