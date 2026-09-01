/**
 * 知识版本历史：列表 + 与当前值的差异
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { canReadCategory } from '@/lib/knowledge-acl';
import { readKnowledgeTags } from '@/lib/knowledge-tags';
import { listKnowledgeVersions, getKnowledgeVersion, diffKnowledgeVersions } from '@/lib/knowledge-versions';

export const dynamic = 'force-dynamic';

// GET /api/knowledge/[id]/versions - 版本列表
// GET ?diff=3 - 第 3 版与当前值的差异
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });
  const entryId = parseInt(id);

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const entry = (await db.prepare(
    'SELECT * FROM knowledge_entries WHERE id = ?'
  ).get(entryId)) as any;
  if (!entry) return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });

  // 版本历史含正文快照，权限判定与详情接口一致（无权返 404 不返 403）
  if (!canReadCategory(user, entry.category_id)) {
    return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });
  }

  const diffParam = req.nextUrl.searchParams.get('diff');
  if (diffParam) {
    if (!/^\d+$/.test(diffParam)) return NextResponse.json({ error: 'diff 参数无效' }, { status: 400 });
    const version = await getKnowledgeVersion(db as any, entryId, parseInt(diffParam));
    if (!version) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

    const currentTags = await readKnowledgeTags(db as any, entryId, entry.tags);
    const current = { ...entry, tags: currentTags };

    return NextResponse.json({
      entry_id: entryId,
      from_version: parseInt(diffParam),
      to: 'current',
      diffs: diffKnowledgeVersions(version, current),
    });
  }

  const versions = await listKnowledgeVersions(db as any, entryId);
  return NextResponse.json({ entry_id: entryId, total: versions.length, items: versions });
}
