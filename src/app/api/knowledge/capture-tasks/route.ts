/**
 * 知识沉淀待办（P6）
 *
 * 建了待办没有列表入口 = 等于没建，所以这个接口是闭环的必需件。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { getCaptureConfig } from '@/lib/knowledge-capture';

export const dynamic = 'force-dynamic';

// GET: 沉淀待办列表
// ?status=pending|waived|done|all（默认 pending）
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20')));

  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (status !== 'all') {
    // 白名单：状态值直接拼进 SQL 是注入面，虽然这里走参数化也不给机会
    if (!['pending', 'waived', 'done'].includes(status)) {
      return NextResponse.json({ error: 'status 取值无效' }, { status: 400 });
    }
    where.push('t.status = ?');
    params.push(status);
  }
  const whereSql = where.join(' AND ');

  const total = Number(((await db.prepare(
    `SELECT COUNT(*) AS c FROM knowledge_capture_tasks t WHERE ${whereSql}`
  ).get(...params)) as any).c);

  const items = (await db.prepare(`
    SELECT t.id, t.requirement_id, t.status, t.trigger_status, t.knowledge_entry_id,
           t.waiver_reason, t.created_at, t.resolved_at,
           r.title AS requirement_title, r.status AS requirement_status,
           r.solution, r.lessons_learned, r.root_cause,
           u.display_name AS resolved_by_name,
           p.name AS project_name
    FROM knowledge_capture_tasks t
    LEFT JOIN requirements r ON r.id = t.requirement_id
    LEFT JOIN users u ON u.id = t.resolved_by
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE ${whereSql}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize)) as any[];

  const cfg = await getCaptureConfig(db);

  return NextResponse.json({
    items: Array.isArray(items) ? items : [],
    total,
    page,
    pageSize,
    gate: cfg.gate,
    min_chars: cfg.minChars,
  });
}
