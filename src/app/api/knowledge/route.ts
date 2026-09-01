import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter, canWriteCategory } from '@/lib/knowledge-acl';

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

  // Parse tags JSON
  const parsed = items.map(item => ({
    ...item,
    tags: (() => { try { return JSON.parse(item.tags); } catch { return []; } })(),
  }));

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

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}
