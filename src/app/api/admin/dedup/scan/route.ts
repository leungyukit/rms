import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureDedupFields, getDedupConfig } from '@/lib/dedup-migrations';
import { similarity } from '@/lib/dedup';

/**
 * GET /api/admin/dedup/scan?threshold=0.6&include_merged=0
 * 全表扫描疑似重复组：两两对比未合并需求
 *
 * O(n²) 在 500 条需求内 < 1s 可接受；超大数据集后续用 embedding
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // admin 校验
  const userIsAdmin = (user.roles || []).some((r: any) => r === 'global_admin' || r?.name === 'global_admin');
  if (!userIsAdmin) {
    return NextResponse.json({ error: '需要 global_admin 权限' }, { status: 403 });
  }

  ensureDedupFields();
  const cfg = getDedupConfig();
  const url = req.nextUrl;
  const threshold = parseFloat(url.searchParams.get('threshold') || String(cfg.threshold));
  const includeMerged = url.searchParams.get('include_merged') === '1';

  const db = getAsyncDb();
  const where = includeMerged ? '1=1' : 'merged_into IS NULL';
  const candidates = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.handler_id, r.merged_into,
      u.display_name as handler_name
    FROM requirements r
    LEFT JOIN users u ON u.id = r.handler_id
    WHERE ${where.replace(/merged_into/g, 'r.merged_into')}
    ORDER BY r.id
  `).all()) as any[];

  // 两两对比：union-find 分组
  const parent = new Map<number, number>();
  for (const c of candidates) parent.set(c.id, c.id);
  const find = (x: number): number => {
    if (parent.get(x) === x) return x;
    const p = find(parent.get(x)!);
    parent.set(x, p);
    return p;
  };
  const union = (x: number, y: number) => {
    const px = find(x), py = find(y);
    if (px !== py) parent.set(px, py);
  };

  const pairs: Array<{ id1: number; id2: number; title1: string; title2: string; similarity: number; snippet: string }> = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      // 长度过滤：两边都太短直接跳
      if (a.title.length < cfg.minLen || b.title.length < cfg.minLen) continue;
      const { score, lcsSubstring } = similarity(a.title, b.title);
      if (score >= threshold) {
        pairs.push({
          id1: a.id, id2: b.id, title1: a.title, title2: b.title,
          similarity: score, snippet: lcsSubstring,
        });
        union(a.id, b.id);
      }
    }
  }

  // 收集组
  const groups = new Map<number, any[]>();
  for (const c of candidates) {
    const root = find(c.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(c);
  }
  // 过滤：只保留 ≥ 2 条的疑似组
  const mergedGroups = [...groups.values()].filter(g => g.length >= 2);
  // 顺便把 pair 关联到组
  const groupPairs = pairs.map(p => {
    const g = groups.get(find(p.id1))!;
    return { ...p, group_size: g.length };
  });

  return NextResponse.json({
    threshold,
    candidate_count: candidates.length,
    pair_count: pairs.length,
    group_count: mergedGroups.length,
    pairs: groupPairs.sort((a, b) => b.similarity - a.similarity).slice(0, 100),
    groups: mergedGroups.map(g => ({
      items: g.sort((x: any, y: any) => {
        // 主需求优先：未合并 + 高优先级 + 早创建
        if (x.merged_into != null && y.merged_into == null) return 1;
        if (x.merged_into == null && y.merged_into != null) return -1;
        const px = { high: 0, medium: 1, low: 2 }[x.priority as string] ?? 1;
        const py = { high: 0, medium: 1, low: 2 }[y.priority as string] ?? 1;
        return px - py;
      }),
    })),
  });
}
