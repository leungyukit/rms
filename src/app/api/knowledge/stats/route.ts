import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET: knowledge stats for insights
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();

  const total = ((await db.prepare("SELECT COUNT(*) as c FROM knowledge_entries WHERE status = 'published'").get()) as any).c;
  const byType = (await db.prepare("SELECT type, COUNT(*) as count FROM knowledge_entries WHERE status = 'published' GROUP BY type").all());
  const byCategory = (await db.prepare("SELECT category, COUNT(*) as count FROM knowledge_entries WHERE status = 'published' AND category != '' GROUP BY category ORDER BY count DESC").all());
  const drafts = ((await db.prepare("SELECT COUNT(*) as c FROM knowledge_entries WHERE status = 'draft'").get()) as any).c;

  const completedReqs = ((await db.prepare("SELECT COUNT(*) as c FROM requirements WHERE status IN ('completed','verified','closed')").get()) as any).c;
  const coveredReqs = ((await db.prepare("SELECT COUNT(DISTINCT source_requirement_id) as c FROM knowledge_entries WHERE source_requirement_id IS NOT NULL AND status = 'published'").get()) as any).c;
  const coverageRate = completedReqs > 0 ? Math.round((coveredReqs / completedReqs) * 100) : 0;

  const topViewed = (await db.prepare(`
    SELECT id, title, type, category, view_count, useful_count
    FROM knowledge_entries WHERE status = 'published'
    ORDER BY view_count DESC LIMIT 10
  `).all());

  const topUseful = (await db.prepare(`
    SELECT id, title, type, category, view_count, useful_count
    FROM knowledge_entries WHERE status = 'published'
    ORDER BY useful_count DESC LIMIT 10
  `).all());

  const feedbackStats = (await db.prepare(`
    SELECT
      SUM(CASE WHEN is_useful = 1 THEN 1 ELSE 0 END) as total_useful,
      SUM(CASE WHEN is_useful = 0 THEN 1 ELSE 0 END) as total_not_useful,
      COUNT(*) as total_feedback
    FROM knowledge_feedback
  `).get()) as any;

  // Uncovered completed requirements
  const uncovered = (await db.prepare(`
    SELECT r.id, r.title, r.priority, p.name as project_name
    FROM requirements r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.status IN ('completed','verified','closed')
    AND r.id NOT IN (SELECT DISTINCT source_requirement_id FROM knowledge_entries WHERE source_requirement_id IS NOT NULL)
    ORDER BY r.priority DESC
  `).all());

  return NextResponse.json({
    total,
    byType,
    byCategory,
    drafts,
    coverage: { completedReqs, coveredReqs, coverageRate },
    topViewed,
    topUseful,
    feedback: {
      useful: feedbackStats?.total_useful || 0,
      notUseful: feedbackStats?.total_not_useful || 0,
      total: feedbackStats?.total_feedback || 0,
      qualityRate: feedbackStats?.total_feedback > 0 ? Math.round(((feedbackStats?.total_useful || 0) / feedbackStats.total_feedback) * 100) : 0,
    },
    uncovered,
  });
}
