import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureFtsIndexes, escapeFts } from '@/lib/fts-migrations';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter } from '@/lib/knowledge-acl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureFtsIndexes();
  ensureKnowledgeTables();

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ results: [] });

  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();
  const safeQ = escapeFts(q);
  const likeQ = `${q}%`;

  const results: any[] = [];

  // 分类级读权限（P2）。自补全也是泄露面：只挡列表不挡 suggest，
  // 敏感知识的标题依旧会被下拉提示拖出来。
  const acl = buildKnowledgeReadFilter(user, '');
  const aclSql = acl.sql ? ` AND ${acl.sql}` : '';

  if (isMysql) {
    // 需求
    const reqs = (await db.prepare(`
      SELECT id, title, 'requirement' as type, status, priority FROM requirements
      WHERE title LIKE ? AND merged_into IS NULL ORDER BY updated_at DESC LIMIT 5
    `).all(likeQ)) as any[];
    for (const r of reqs) results.push(r);
    // 知识
    const kws = (await db.prepare(`
      SELECT id, title, 'knowledge' as type, category FROM knowledge_entries
      WHERE status='published' AND title LIKE ?${aclSql} LIMIT 3
    `).all(likeQ, ...acl.params)) as any[];
    for (const r of kws) results.push(r);
  } else {
    const reqs = (await db.prepare(`
      SELECT id, title, 'requirement' as type, status, priority FROM requirements
      WHERE title LIKE ? AND merged_into IS NULL ORDER BY updated_at DESC LIMIT 5
    `).all(likeQ)) as any[];
    for (const r of reqs) results.push(r);
    const kws = (await db.prepare(`
      SELECT id, title, 'knowledge' as type, category FROM knowledge_entries
      WHERE status='published' AND title LIKE ?${aclSql} LIMIT 3
    `).all(likeQ, ...acl.params)) as any[];
    for (const r of kws) results.push(r);
  }

  return NextResponse.json({ results });
}
