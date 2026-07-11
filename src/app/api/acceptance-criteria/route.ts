import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureAcceptanceCriteriaTables, getAcTemplates } from '@/lib/ac-migrations';

/**
 * GET /api/acceptance-criteria
 * - 不带参数 → 列出所有 AC 模板（ac_template_*）
 * - 带 ?requirement_id=N → 列出该需求下的所有 AC（等价于 /requirements/:id/acceptance-criteria）
 * - 带 ?templates=1 → 强制只返回模板
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAcceptanceCriteriaTables();
  const db = getAsyncDb();
  const url = req.nextUrl;
  const onlyTemplates = url.searchParams.get('templates') === '1';

  if (onlyTemplates) {
    return NextResponse.json({ data: getAcTemplates() });
  }

  const reqId = url.searchParams.get('requirement_id');
  if (reqId) {
    const rows = (await db.prepare(`
      SELECT ac.*,
        u.display_name as created_by_name,
        v.display_name as verified_by_name
      FROM requirement_acceptance_criteria ac
      LEFT JOIN users u ON u.id = ac.created_by
      LEFT JOIN users v ON v.id = ac.verified_by
      WHERE ac.requirement_id = ?
      ORDER BY ac.sequence ASC, ac.id ASC
    `).all(reqId));
    return NextResponse.json({ data: rows });
  }

  // 默认返回模板（PM 创建需求时第一个动作就是选模板）
  return NextResponse.json({ data: getAcTemplates() });
}
