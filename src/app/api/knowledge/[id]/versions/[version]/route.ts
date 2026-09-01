/**
 * 单个知识版本：查看 + 回滚
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { canReadCategory, canWriteCategory } from '@/lib/knowledge-acl';
import { readKnowledgeTags, syncKnowledgeTags } from '@/lib/knowledge-tags';
import { getKnowledgeVersion, snapshotKnowledgeVersion } from '@/lib/knowledge-versions';

export const dynamic = 'force-dynamic';

// GET: 查看某个历史版本的完整内容
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id, version } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(version)) {
    return NextResponse.json({ error: '无效的参数' }, { status: 400 });
  }

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const entry = (await db.prepare('SELECT category_id FROM knowledge_entries WHERE id = ?').get(parseInt(id))) as any;
  if (!entry) return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });
  if (!canReadCategory(user, entry.category_id)) {
    return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });
  }

  const snapshot = await getKnowledgeVersion(db as any, parseInt(id), parseInt(version));
  if (!snapshot) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

  return NextResponse.json(snapshot);
}

// POST: 回滚到该版本
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id, version } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(version)) {
    return NextResponse.json({ error: '无效的参数' }, { status: 400 });
  }
  const entryId = parseInt(id);
  const versionNo = parseInt(version);

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId)) as any;
  if (!existing) return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });

  // 回滚是写操作，且目标版本的分类也可能受限 —— 两边都要校
  if (!canWriteCategory(user, existing.category_id)) {
    return NextResponse.json({ error: '无权修改该分类下的知识' }, { status: 403 });
  }

  const snapshot = await getKnowledgeVersion(db as any, entryId, versionNo);
  if (!snapshot) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

  if (!canWriteCategory(user, snapshot.category_id)) {
    return NextResponse.json({ error: '无权回滚到该版本所属分类' }, { status: 403 });
  }

  // 回滚前先把「当前状态」也存成一个版本，否则回滚会丢掉现状、历史断链
  const currentTags = await readKnowledgeTags(db as any, entryId, existing.tags);
  await snapshotKnowledgeVersion(
    db as any,
    existing,
    currentTags,
    `回滚到 v${versionNo} 前的状态`,
    user.id
  );

  (await db.prepare(`
    UPDATE knowledge_entries
    SET title = ?, question = ?, answer = ?, content = ?,
        category = ?, category_id = ?, type = ?, status = ?,
        tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    snapshot.title,
    snapshot.question,
    snapshot.answer,
    snapshot.content,
    snapshot.category,
    snapshot.category_id,
    snapshot.type,
    snapshot.status,
    JSON.stringify(snapshot.tags || []),
    entryId
  ));

  // join 表同步（双写过渡期）
  await syncKnowledgeTags(db as any, entryId, snapshot.tags || []);

  return NextResponse.json({
    success: true,
    restored_from: versionNo,
    message: `已回滚到 v${versionNo}`,
  });
}
