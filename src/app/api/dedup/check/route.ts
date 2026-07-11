import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureDedupFields, getDedupConfig } from '@/lib/dedup-migrations';
import { similarity } from '@/lib/dedup';

/**
 * GET /api/requirements/dedup?title=...&exclude_id=N
 * 实时查重：对所有未合并的需求标题算相似度，返回 Top 5
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureDedupFields();
  const cfg = getDedupConfig();
  const url = req.nextUrl;
  const title = (url.searchParams.get('title') || '').trim();
  const excludeId = parseInt(url.searchParams.get('exclude_id') || '0', 10);

  if (title.length < cfg.minLen) {
    return NextResponse.json({ candidates: [], threshold: cfg.threshold, minLen: cfg.minLen });
  }

  const db = getAsyncDb();
  const candidates = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.handler_id,
      u.display_name as handler_name
    FROM requirements r
    LEFT JOIN users u ON u.id = r.handler_id
    WHERE r.merged_into IS NULL AND r.id != ?
  `).all(excludeId)) as any[];

  const scored = candidates.map(c => {
    const { score, lcsSubstring } = similarity(title, c.title);
    return { ...c, similarity: score, matched_substring: lcsSubstring };
  }).filter(c => c.similarity >= cfg.threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return NextResponse.json({
    candidates: scored,
    threshold: cfg.threshold,
    minLen: cfg.minLen,
  });
}
