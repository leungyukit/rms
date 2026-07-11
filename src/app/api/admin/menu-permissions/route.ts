import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const db = getAsyncDb();

  const roles = (await db.prepare('SELECT id, name, label FROM roles ORDER BY id').all()) as any[];
  const menuItems = (await db.prepare('SELECT id, href, icon, label_key, section, sort_order FROM menu_items ORDER BY section, sort_order').all()) as any[];
  const permissions = (await db.prepare(`
    SELECT rmp.role_id, rmp.menu_item_id, rmp.allowed
    FROM role_menu_permissions rmp
    JOIN roles r ON r.id = rmp.role_id
    JOIN menu_items m ON m.id = rmp.menu_item_id
  `).all()) as any[];

  const permMap = new Map<string, boolean>();
  for (const p of permissions) {
    permMap.set(`${p.role_id}-${p.menu_item_id}`, p.allowed === 1 || p.allowed === true);
  }

  return NextResponse.json({
    roles,
    menuItems,
    permissions: Object.fromEntries(
      roles.map((r: any) => [
        r.id,
        Object.fromEntries(
          menuItems.map((m: any) => [`${m.id}`, permMap.get(`${r.id}-${m.id}`) ?? true])
        ),
      ])
    ),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { role_id, menu_item_id, allowed } = body;
  if (!role_id || !menu_item_id || allowed === undefined) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 });
  }

  const db = getAsyncDb();
  await db.prepare(`
    INSERT INTO role_menu_permissions (role_id, menu_item_id, allowed)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)
  `).run(role_id, menu_item_id, allowed ? 1 : 0);

  return NextResponse.json({ success: true });
}
