import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();

  // 菜单权限功能未启用（表不存在或没有菜单项）时返回 null，前端按未配置处理
  try {
    const menuCount = (await db.prepare('SELECT COUNT(*) as c FROM menu_items').get()) as any;
    if (!menuCount?.c) {
      return NextResponse.json({ allowedHrefs: null });
    }
  } catch {
    return NextResponse.json({ allowedHrefs: null });
  }

  // global_admin 直接拥有所有菜单权限
  const isAdmin = isGlobalAdmin(user.roles);
  if (isAdmin) {
    const allMenuItems = await db.prepare('SELECT href FROM menu_items').all();
    return NextResponse.json({ allowedHrefs: allMenuItems.map((r: any) => r.href) });
  }

  const roleIds = (await db.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').all(user.id)) as any[];
  const rids = roleIds.map((r: any) => r.role_id);

  let allowedHrefs: Set<string> | null = null;

  if (rids.length > 0) {
    const placeholders = rids.map(() => '?').join(',');
    const rows = (await db.prepare(`
      SELECT mi.href
      FROM menu_items mi
      JOIN role_menu_permissions rmp ON rmp.menu_item_id = mi.id
      WHERE rmp.role_id IN (${placeholders}) AND rmp.allowed = 1
      GROUP BY mi.href
      HAVING COUNT(DISTINCT rmp.role_id) = ?
    `).all(...rids, rids.length)) as any[];

    allowedHrefs = new Set(rows.map((r: any) => r.href));
  }

  return NextResponse.json({
    allowedHrefs: allowedHrefs ? Array.from(allowedHrefs) : [],
  });
}
