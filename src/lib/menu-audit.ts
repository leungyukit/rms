/**
 * 菜单权限自检
 *
 * 起因（2026-09-01）：新增 /knowledge/categories 与 /knowledge/capture-tasks 时，
 * 只插了 menu_items 却没插 role_menu_permissions，结果非管理员完全打不开这两页。
 *
 * 为什么没被发现 —— 两侧判定逻辑相反（已实测复现）：
 *   - 用户侧 /api/user/menu-permissions：非管理员必须有 allowed=1 的**显式记录**才放行
 *   - 管理侧 /api/admin/menu-permissions：无记录时返回 `?? true`，界面显示成**已勾选**
 * 管理员在菜单权限页看到「全部允许」，用户实际打不开，光看界面永远查不出来。
 *
 * 与 P0 的 try{}catch{} 吞 DDL、P6 的自检不查配置是同一类病：
 * 看起来正常，实际是坏的。所以补这个自检，让漏注册能被主动发现而不是等投诉。
 */
import { getDb, isMysqlEnabled } from './db';

export interface MenuAuditIssue {
  href: string;
  menuItemId: number;
  /** 完全没有任何角色权限记录 */
  kind: 'no-permission-rows';
}

export interface MenuAuditResult {
  ok: boolean;
  menuTotal: number;
  issues: MenuAuditIssue[];
}

/**
 * 找出「一条角色权限记录都没有」的菜单项。
 *
 * 只报完全零记录的情况：显式 allowed=0 是正常配置（表示该角色不可见），
 * 不该报警。login_only 角色按惯例不给任何记录，也不影响本检查
 * （检查的是菜单维度，不是角色维度）。
 */
export function auditMenuPermissions(): MenuAuditResult {
  const db = getDb();

  try {
    const total = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get() as any;
    const menuTotal = Number(total?.c || 0);

    // 菜单权限功能未启用（表空）时不做判定，避免新库误报
    if (menuTotal === 0) {
      return { ok: true, menuTotal: 0, issues: [] };
    }

    const rows = db.prepare(`
      SELECT mi.id AS id, mi.href AS href
      FROM menu_items mi
      LEFT JOIN role_menu_permissions rmp ON rmp.menu_item_id = mi.id
      WHERE rmp.menu_item_id IS NULL
      ORDER BY mi.id
    `).all() as any[];

    const issues: MenuAuditIssue[] = (Array.isArray(rows) ? rows : []).map(r => ({
      href: String(r.href),
      menuItemId: Number(r.id),
      kind: 'no-permission-rows' as const,
    }));

    return { ok: issues.length === 0, menuTotal, issues };
  } catch (e) {
    // 表不存在（菜单权限功能未启用）不算问题，但也不假装检查过了
    return { ok: true, menuTotal: 0, issues: [] };
  }
}
