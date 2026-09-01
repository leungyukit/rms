/**
 * 知识分类树 API
 *
 * path 字段存物料路径（如 /1/4/9/），按子树查询用 `path LIKE '/1/4/%'`，
 * 不依赖递归 CTE —— 兼容 MySQL 5.7，也避免 SQLite 递归写两套方言。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess, isGlobalAdmin } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { getDeniedCategoryIds } from '@/lib/knowledge-acl';

export const dynamic = 'force-dynamic';

// GET: 分类树（已按读权限过滤）
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const rows = (await db.prepare(`
    SELECT c.id, c.name, c.parent_id, c.path, c.description, c.sort_order, c.is_restricted,
           (SELECT COUNT(*) FROM knowledge_entries ke WHERE ke.category_id = c.id) AS entry_count
    FROM knowledge_categories c
    ORDER BY c.sort_order ASC, c.id ASC
  `).all()) as any[];

  // 不可读的分类整棵藏掉（连名字都不给），与 detail 返 404 的思路一致
  const denied = new Set(getDeniedCategoryIds(user));
  const visible = rows.filter(r => !denied.has(Number(r.id)));

  return NextResponse.json({
    items: visible,
    // 告知前端有多少分类因权限被隐藏，便于解释「数量对不上」
    hiddenCount: rows.length - visible.length,
  });
}

// POST: 新建分类
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  // 分类树是权限载体，改它等于改权限边界 → 仅管理员
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name 为必填项' }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: 'name 过长' }, { status: 400 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const parentId = body.parent_id != null ? parseInt(String(body.parent_id)) : null;
  let parentPath = '/';
  if (parentId != null) {
    if (!Number.isFinite(parentId)) return NextResponse.json({ error: 'parent_id 无效' }, { status: 400 });
    const parent = (await db.prepare('SELECT id, path FROM knowledge_categories WHERE id = ?').get(parentId)) as any;
    if (!parent) return NextResponse.json({ error: '父分类不存在' }, { status: 400 });
    parentPath = parent.path;
  }

  // 同一父节点下不允许同名，否则分类树会出现两个看起来一样的节点
  const dup = (await db.prepare(
    parentId == null
      ? 'SELECT id FROM knowledge_categories WHERE name = ? AND parent_id IS NULL'
      : 'SELECT id FROM knowledge_categories WHERE name = ? AND parent_id = ?'
  ).get(...(parentId == null ? [name] : [name, parentId]))) as any;
  if (dup) return NextResponse.json({ error: '同级下已有同名分类' }, { status: 409 });

  const result = (await db.prepare(`
    INSERT INTO knowledge_categories (name, parent_id, path, description, sort_order, is_restricted, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    parentId,
    '/',  // 先占位，拿到自增 id 后再回填真实 path
    typeof body.description === 'string' ? body.description : null,
    Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    body.is_restricted ? 1 : 0,
    user.id
  ));

  const newId = Number(result.lastInsertRowid);
  const path = `${parentPath}${newId}/`;
  (await db.prepare('UPDATE knowledge_categories SET path = ? WHERE id = ?').run(path, newId));

  return NextResponse.json({ success: true, id: newId, path });
}
