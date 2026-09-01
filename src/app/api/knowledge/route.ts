import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter, canWriteCategory } from '@/lib/knowledge-acl';
import { syncKnowledgeTags, entryIdsByTag, readKnowledgeTags } from '@/lib/knowledge-tags';
import { resolveCaptureTask } from '@/lib/knowledge-capture';

// GET: list/search knowledge entries
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // faq|solution|lesson|pattern
  const status = searchParams.get('status'); // draft|published|archived
  const category = searchParams.get('category');
  const keyword = searchParams.get('keyword');
  const sourceId = searchParams.get('source_requirement_id');
  const categoryId = searchParams.get('category_id');
  const tag = searchParams.get('tag');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const offset = (page - 1) * pageSize;

  ensureKnowledgeTables();
  const db = getAsyncDb();
  let where = ['1=1'];
  let params: any[] = [];

  if (type) { where.push('ke.type = ?'); params.push(type); }
  if (status) { where.push('ke.status = ?'); params.push(status); }
  if (category) { where.push('ke.category = ?'); params.push(category); }
  if (sourceId) { where.push('ke.source_requirement_id = ?'); params.push(parseInt(sourceId)); }

  // 按分类树过滤（P3）。含子树：path 前缀匹配，不靠递归 CTE（兼容 MySQL 5.7）。
  //
  // 先取出父节点 path 再拼 LIKE 参数，而不是在 SQL 里用 CONCAT()：
  // CONCAT 是 MySQL 方言，SQLite 用 || —— 本项目双库，写方言函数会在 SQLite 下炸。
  if (categoryId && /^\d+$/.test(categoryId)) {
    const cat = (await db.prepare('SELECT path FROM knowledge_categories WHERE id = ?').get(parseInt(categoryId))) as any;
    if (!cat) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    where.push(`ke.category_id IN (SELECT c.id FROM knowledge_categories c WHERE c.path LIKE ?)`);
    params.push(`${cat.path}%`);
  }

  // 按标签过滤（P3）。走归一化键，「权限管理」与「权限管理 」视同一个标签。
  if (tag) {
    const ids = await entryIdsByTag(db as any, tag);
    if (ids.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    where.push(`ke.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  // 分类级读权限（P2）—— 改造前拿到功能权限就能看全部知识
  const aclFilter = buildKnowledgeReadFilter(user, 'ke');
  if (aclFilter.sql) { where.push(aclFilter.sql); params.push(...aclFilter.params); }

  if (keyword) {
    where.push('(ke.title LIKE ? OR ke.question LIKE ? OR ke.answer LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereClause = where.join(' AND ');

  const total = ((await db.prepare(`SELECT COUNT(*) as c FROM knowledge_entries ke WHERE ${whereClause}`).get(...params)) as any).c;

  const items = (await db.prepare(`
    SELECT ke.*, r.title as source_title, r.status as source_status
    FROM knowledge_entries ke
    LEFT JOIN requirements r ON r.id = ke.source_requirement_id
    WHERE ${whereClause}
    ORDER BY ke.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)) as any[];

  // Parse tags：join 表优先，回落老 JSON 列（P3 双写过渡期）
  const parsed = await Promise.all(items.map(async item => ({
    ...item,
    tags: await readKnowledgeTags(db as any, Number(item.id), item.tags),
  })));

  return NextResponse.json({ items: parsed, total, page, pageSize });
}

// POST: create knowledge entry
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const body = await req.json();
  const { source_requirement_id, type, title, question, answer, category, category_id, tags, confidence, status } = body;

  if (!title || !question || !answer) {
    return NextResponse.json({ error: 'title、question、answer 为必填项' }, { status: 400 });
  }

  ensureKnowledgeTables();

  // 受限分类需显式写权限（P2）
  const targetCategoryId = category_id != null ? parseInt(String(category_id)) : null;
  if (!canWriteCategory(user, targetCategoryId)) {
    return NextResponse.json({ error: '无权在该分类下创建知识' }, { status: 403 });
  }

  const db = getAsyncDb();
  const result = (await db.prepare(`
    INSERT INTO knowledge_entries (source_requirement_id, type, title, question, answer, category, category_id, tags, confidence, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source_requirement_id || null,
    type || 'faq',
    title,
    question,
    answer,
    category || '',
    targetCategoryId,
    JSON.stringify(tags || []),
    confidence || 0.8,
    status || 'published',
    // created_by 是 INT。原代码传 `user:${id}` 字符串，MySQL 严格模式下
    // ERROR 1366 Incorrect integer value —— 知识条目一条都建不出来（实测表为空）。
    user.id
  ));

  // 标签写 join 表（P3）。上面的 JSON 列也照旧写 —— 双写过渡，
  // 因为老数据全在 JSON 里且前端多处直接读 item.tags。
  const newId = Number(result.lastInsertRowid);
  const savedTags = await syncKnowledgeTags(db as any, newId, tags);

  // 闭环（P6）：这条知识是从某需求沉淀出来的，就把对应待办关掉。
  // 否则待办列表永远清不空，下一步就是没人看。
  if (source_requirement_id) {
    await resolveCaptureTask({
      db,
      requirementId: parseInt(String(source_requirement_id)),
      knowledgeEntryId: newId,
      resolvedBy: user.id,
    });
  }

  return NextResponse.json({ success: true, id: newId, tags: savedTags });
}
