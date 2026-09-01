import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureKnowledgeTables, verifyKnowledgeSchema, resetKnowledgeMigrationCache } from '@/lib/knowledge-migrations';
import { ensureFtsIndexes, verifyFtsSchema, resetFtsMigrationCache } from '@/lib/fts-migrations';
import { auditMenuPermissions } from '@/lib/menu-audit';

/**
 * 迁移自检
 *
 * 为什么需要这个端点：历史迁移全是 `try{}catch(e){}`，DDL 失败被静默吞掉，
 * 结果 15 个列一个都没建成、FULLTEXT 索引一个都没建成，活到 2026-09-01 才被发现。
 * 「假装成功」比直接报错危险得多，所以给运维一个能看到真实状态的地方。
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const repair = req.nextUrl.searchParams.get('repair') === '1';

  try {
    if (repair) {
      resetKnowledgeMigrationCache();
      ensureKnowledgeTables();
      resetFtsMigrationCache();
      ensureFtsIndexes();
    }

    const knowledge = verifyKnowledgeSchema();
    const fts = verifyFtsSchema();

    // 菜单权限审计（2026-09-01 加）：新增菜单时只插 menu_items
    // 却忘了 role_menu_permissions，非管理员会完全打不开 ——
    // 而管理侧界面把「无记录」显示成已勾选，看不出毛病。
    const menu = auditMenuPermissions();

    const allChecks = [
      ...knowledge.checks.map(c => ({ ...c, group: 'knowledge-schema' })),
      ...fts.checks.map(c => ({ ...c, group: 'fulltext-search' })),
      ...menu.issues.map(i => ({
        target: `menu_items.${i.href} 无任何角色权限记录`,
        kind: 'table' as const,
        present: false,
        group: 'menu-permissions',
      })),
    ];
    const missing = allChecks.filter(c => !c.present).map(c => c.target);

    return NextResponse.json({
      ok: knowledge.ok && fts.ok && menu.ok,
      repaired: repair,
      missing,
      checks: allChecks,
      menu: {
        ok: menu.ok,
        menuTotal: menu.menuTotal,
        unregistered: menu.issues.map(i => i.href),
      },
    });
  } catch (e: any) {
    // 这里故意不吞：迁移失败就要看得见
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
