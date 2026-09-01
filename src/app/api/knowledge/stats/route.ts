import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter } from '@/lib/knowledge-acl';

// GET: knowledge stats for insights
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureKnowledgeTables();
  const db = getAsyncDb();

  // 分类级读权限（P2）。统计类接口也得挡：
  // topViewed / topUseful 直接列标题，byCategory 会把受限分类名和数量露出来。
  const acl = buildKnowledgeReadFilter(user, '');
  const aclSql = acl.sql ? ` AND ${acl.sql}` : '';
  const p = acl.params;
  // JOIN 场景要带别名的那份
  const aclKe = buildKnowledgeReadFilter(user, 'ke');

  const total = ((await db.prepare(`SELECT COUNT(*) as c FROM knowledge_entries WHERE status = 'published'${aclSql}`).get(...p)) as any).c;
  const byType = (await db.prepare(`SELECT type, COUNT(*) as count FROM knowledge_entries WHERE status = 'published'${aclSql} GROUP BY type`).all(...p));
  const byCategory = (await db.prepare(`SELECT category, COUNT(*) as count FROM knowledge_entries WHERE status = 'published' AND category != ''${aclSql} GROUP BY category ORDER BY count DESC`).all(...p));
  const drafts = ((await db.prepare(`SELECT COUNT(*) as c FROM knowledge_entries WHERE status = 'draft'${aclSql}`).get(...p)) as any).c;

  const completedReqs = ((await db.prepare("SELECT COUNT(*) as c FROM requirements WHERE status IN ('completed','verified','closed')").get()) as any).c;
  const coveredReqs = ((await db.prepare(`SELECT COUNT(DISTINCT source_requirement_id) as c FROM knowledge_entries WHERE source_requirement_id IS NOT NULL AND status = 'published'${aclSql}`).get(...p)) as any).c;
  const coverageRate = completedReqs > 0 ? Math.round((coveredReqs / completedReqs) * 100) : 0;

  const topViewed = (await db.prepare(`
    SELECT id, title, type, category, view_count, useful_count
    FROM knowledge_entries WHERE status = 'published'${aclSql}
    ORDER BY view_count DESC LIMIT 10
  `).all(...p));

  const topUseful = (await db.prepare(`
    SELECT id, title, type, category, view_count, useful_count
    FROM knowledge_entries WHERE status = 'published'${aclSql}
    ORDER BY useful_count DESC LIMIT 10
  `).all(...p));

  // 反馈统计也要按可读范围汇总，否则受限分类的反馈量会泄露
  const feedbackStats = (await db.prepare(`
    SELECT
      SUM(CASE WHEN kf.is_useful = 1 THEN 1 ELSE 0 END) as total_useful,
      SUM(CASE WHEN kf.is_useful = 0 THEN 1 ELSE 0 END) as total_not_useful,
      COUNT(*) as total_feedback
    FROM knowledge_feedback kf
    JOIN knowledge_entries ke ON ke.id = kf.entry_id
    ${aclKe.sql ? `WHERE ${aclKe.sql}` : ''}
  `).get(...aclKe.params)) as any;

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
