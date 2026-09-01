import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureKnowledgeTables, verifyKnowledgeSchema, resetKnowledgeMigrationCache } from '@/lib/knowledge-migrations';
import { ensureFtsIndexes, verifyFtsSchema, resetFtsMigrationCache } from '@/lib/fts-migrations';

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
    const allChecks = [
      ...knowledge.checks.map(c => ({ ...c, group: 'knowledge-schema' })),
      ...fts.checks.map(c => ({ ...c, group: 'fulltext-search' })),
    ];
    const missing = allChecks.filter(c => !c.present).map(c => c.target);

    return NextResponse.json({
      ok: knowledge.ok && fts.ok,
      repaired: repair,
      missing,
      checks: allChecks,
    });
  } catch (e: any) {
    // 这里故意不吞：迁移失败就要看得见
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
