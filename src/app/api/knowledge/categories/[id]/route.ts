/**
 * 单个知识分类：改 / 删 / ACL 管理
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';

export const dynamic = 'force-dynamic';

// PUT: 改名 / 移动 / 改受限标记
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });
  const catId = parseInt(id);
  const body = await req.json();

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM knowledge_categories WHERE id = ?').get(catId)) as any;
  if (!existing) return NextResponse.json({ error: '分类不存在' }, { status: 404 });

  const updates: string[] = [];
  const values: any[] = [];

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.push('name = ?');
    values.push(body.name.trim());
  }
  if (typeof body.description === 'string') {
    updates.push('description = ?');
    values.push(body.description);
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    updates.push('sort_order = ?');
    values.push(Number(body.sort_order));
  }
  if (body.is_restricted !== undefined) {
    updates.push('is_restricted = ?');
    values.push(body.is_restricted ? 1 : 0);
  }

  // 移动分类：要重算自身及整棵子树的 path
  let newPath: string | null = null;
  if (body.parent_id !== undefined) {
    const newParentId = body.parent_id === null ? null : parseInt(String(body.parent_id));

    if (newParentId === catId) {
      return NextResponse.json({ error: '不能把分类挂到自己下面' }, { status: 400 });
    }

    let parentPath = '/';
    if (newParentId != null) {
      if (!Number.isFinite(newParentId)) return NextResponse.json({ error: 'parent_id 无效' }, { status: 400 });
      const parent = (await db.prepare('SELECT id, path FROM knowledge_categories WHERE id = ?').get(newParentId)) as any;
      if (!parent) return NextResponse.json({ error: '父分类不存在' }, { status: 400 });
      // 不能挂到自己的后代下面，否则整棵子树脱离根、path 成环
      if (String(parent.path).startsWith(existing.path)) {
        return NextResponse.json({ error: '不能把分类挂到它自己的子分类下面' }, { status: 400 });
      }
      parentPath = parent.path;
    }

    newPath = `${parentPath}${catId}/`;
    updates.push('parent_id = ?', 'path = ?');
    values.push(newParentId, newPath);
  }

  if (updates.length === 0) return NextResponse.json({ error: '无更新内容' }, { status: 400 });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(catId);
  (await db.prepare(`UPDATE knowledge_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values));

  // 子树 path 批量重写：把旧前缀替换为新前缀
  if (newPath) {
    const descendants = (await db.prepare(
      'SELECT id, path FROM knowledge_categories WHERE path LIKE ? AND id != ?'
    ).all(`${existing.path}%`, catId)) as any[];
    for (const d of descendants) {
      const rewritten = newPath + String(d.path).substring(existing.path.length);
      (await db.prepare('UPDATE knowledge_categories SET path = ? WHERE id = ?').run(rewritten, d.id));
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: 删分类（有子分类或有知识条目时拒绝，避免产生孤儿数据）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });
  const catId = parseInt(id);

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT id FROM knowledge_categories WHERE id = ?').get(catId)) as any;
  if (!existing) return NextResponse.json({ error: '分类不存在' }, { status: 404 });

  const childCount = ((await db.prepare(
    'SELECT COUNT(*) AS c FROM knowledge_categories WHERE parent_id = ?'
  ).get(catId)) as any).c;
  if (Number(childCount) > 0) {
    return NextResponse.json({ error: `该分类下还有 ${childCount} 个子分类，请先处理` }, { status: 409 });
  }

  const entryCount = ((await db.prepare(
    'SELECT COUNT(*) AS c FROM knowledge_entries WHERE category_id = ?'
  ).get(catId)) as any).c;
  if (Number(entryCount) > 0) {
    return NextResponse.json({ error: `该分类下还有 ${entryCount} 条知识，请先移动或删除` }, { status: 409 });
  }

  (await db.prepare('DELETE FROM knowledge_category_acl WHERE category_id = ?').run(catId));
  (await db.prepare('DELETE FROM knowledge_categories WHERE id = ?').run(catId));

  return NextResponse.json({ success: true });
}
