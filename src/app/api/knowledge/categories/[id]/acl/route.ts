/**
 * 分类 ACL 授权管理
 *
 * 只有 is_restricted=1 的分类才需要授权（见 src/lib/knowledge-acl.ts 的取舍说明），
 * 但这里允许给任意分类预配 ACL —— 便于「先配好权限，再打开受限开关」。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';

export const dynamic = 'force-dynamic';

// GET: 查看某分类的授权列表
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const items = (await db.prepare(`
    SELECT a.id, a.category_id, a.role_name, a.can_read, a.can_write, a.can_manage, r.label AS role_label
    FROM knowledge_category_acl a
    LEFT JOIN roles r ON r.name = a.role_name
    WHERE a.category_id = ?
    ORDER BY a.role_name
  `).all(parseInt(id)));

  return NextResponse.json({ items });
}

// PUT: 设置某角色对该分类的权限（upsert）
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });
  const catId = parseInt(id);
  const body = await req.json();

  const roleName = typeof body.role_name === 'string' ? body.role_name.trim() : '';
  if (!roleName) return NextResponse.json({ error: 'role_name 为必填项' }, { status: 400 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  const cat = (await db.prepare('SELECT id FROM knowledge_categories WHERE id = ?').get(catId)) as any;
  if (!cat) return NextResponse.json({ error: '分类不存在' }, { status: 404 });

  // 角色必须真实存在，否则会配出一批永远不生效的死规则
  const role = (await db.prepare('SELECT name FROM roles WHERE name = ?').get(roleName)) as any;
  if (!role) return NextResponse.json({ error: `角色 ${roleName} 不存在` }, { status: 400 });

  const canRead = body.can_read ? 1 : 0;
  const canWrite = body.can_write ? 1 : 0;
  const canManage = body.can_manage ? 1 : 0;

  const existing = (await db.prepare(
    'SELECT id FROM knowledge_category_acl WHERE category_id = ? AND role_name = ?'
  ).get(catId, roleName)) as any;

  if (existing) {
    (await db.prepare(
      'UPDATE knowledge_category_acl SET can_read = ?, can_write = ?, can_manage = ? WHERE id = ?'
    ).run(canRead, canWrite, canManage, existing.id));
  } else {
    (await db.prepare(
      'INSERT INTO knowledge_category_acl (category_id, role_name, can_read, can_write, can_manage) VALUES (?, ?, ?, ?, ?)'
    ).run(catId, roleName, canRead, canWrite, canManage));
  }

  return NextResponse.json({ success: true });
}

// DELETE: 撤销某角色的授权
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });

  const roleName = (req.nextUrl.searchParams.get('role_name') || '').trim();
  if (!roleName) return NextResponse.json({ error: 'role_name 为必填项' }, { status: 400 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  (await db.prepare(
    'DELETE FROM knowledge_category_acl WHERE category_id = ? AND role_name = ?'
  ).run(parseInt(id), roleName));

  return NextResponse.json({ success: true });
}
