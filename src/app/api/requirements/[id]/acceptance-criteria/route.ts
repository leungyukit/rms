import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureAcceptanceCriteriaTables } from '@/lib/ac-migrations';

/**
 * GET /api/requirements/:id/acceptance-criteria
 * 拉某条需求的 AC 列表
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAcceptanceCriteriaTables();
  const { id } = await params;
  const db = getAsyncDb();

  const rows = (await db.prepare(`
    SELECT ac.*,
      u.display_name as created_by_name,
      v.display_name as verified_by_name
    FROM requirement_acceptance_criteria ac
    LEFT JOIN users u ON u.id = ac.created_by
    LEFT JOIN users v ON v.id = ac.verified_by
    WHERE ac.requirement_id = ?
    ORDER BY ac.sequence ASC, ac.id ASC
  `).all(id));

  return NextResponse.json({ data: rows });
}

/**
 * POST /api/requirements/:id/acceptance-criteria
 * 批量新增/整体替换：传 criteria 数组，一次性保存
 *
 * 行为：先 DELETE 该需求下所有现有 AC，再 INSERT 新数组（保持 sequence 1..N）
 * 这是 PM 在创建/编辑需求后保存 AC 列表的入口
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAcceptanceCriteriaTables();
  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  if (!body.criteria || !Array.isArray(body.criteria)) {
    return NextResponse.json({ error: 'criteria 必须为数组' }, { status: 400 });
  }
  if (body.criteria.length > 50) {
    return NextResponse.json({ error: '单次最多 50 条 AC' }, { status: 400 });
  }

  // 校验：criterion_text 必填；metric 类必须有 target_value
  for (let i = 0; i < body.criteria.length; i++) {
    const c = body.criteria[i];
    if (!c.criterion_text || !String(c.criterion_text).trim()) {
      return NextResponse.json({ error: `第 ${i + 1} 条 criterion_text 不能为空` }, { status: 400 });
    }
    if (c.acceptance_type === 'metric' && !c.target_value) {
      return NextResponse.json({ error: `第 ${i + 1} 条 metric 类 AC 必须填 target_value` }, { status: 400 });
    }
  }

  const reqExists = (await db.prepare('SELECT id FROM requirements WHERE id = ?').get(id));
  if (!reqExists) return NextResponse.json({ error: '需求不存在' }, { status: 404 });

  // 整批替换：先删旧的，再插新的
  (await db.prepare('DELETE FROM requirement_acceptance_criteria WHERE requirement_id = ?').run(id));

  const insert = db.prepare(`
    INSERT INTO requirement_acceptance_criteria
      (requirement_id, sequence, criterion_text, acceptance_type, target_value, is_required, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  let inserted = 0;
  for (let i = 0; i < body.criteria.length; i++) {
    const c = body.criteria[i];
    insert.run(
      id,
      i + 1,
      String(c.criterion_text).trim(),
      c.acceptance_type || 'manual',
      c.target_value || null,
      c.is_required === 0 ? 0 : 1,
      user.id
    );
    inserted++;
  }

  logAudit(user.id, user.username, 'replace_acceptance_criteria',
    `需求 ${id} 替换 AC 列表，共 ${inserted} 条`);

  return NextResponse.json({ success: true, count: inserted });
}
