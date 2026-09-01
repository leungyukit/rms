import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureFtsIndexes, highlight, escapeFts } from '@/lib/fts-migrations';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter } from '@/lib/knowledge-acl';

export const dynamic = 'force-dynamic';

interface Hit { type: string; id: number; title: string; snippet: string; score: number; [k: string]: any; }

/**
 * bigram 噪音过滤
 *
 * ngram 分词把「需求池」切成「需求」+「求池」，只命中其中一个 bigram 的条目
 * 也会进结果集。实测搜「需求池」召回 5 条，最高分 10.9，后 4 条 0.83 且完全不相关。
 *
 * 用「相对最高分」而非绝对阈值：FULLTEXT 分数随语料规模浮动，
 * 写死一个数字换个库就失效。
 */
const RELEVANCE_RATIO = 0.12;

function dropWeakHits<T extends { score?: number }>(rows: T[]): T[] {
  if (rows.length <= 1) return rows;
  const top = Math.max(...rows.map(r => Number(r.score) || 0));
  // LIKE 兜底路径所有 score 都是 1，比值恒为 1，不会误杀
  if (top <= 0) return rows;
  return rows.filter(r => (Number(r.score) || 0) >= top * RELEVANCE_RATIO);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureFtsIndexes();
  ensureKnowledgeTables();

  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || sp.get('keyword') || '').trim();
  const type = sp.get('type') || 'all'; // requirements,knowledge,projects,all
  const limit = Math.min(50, parseInt(sp.get('limit') || '20'));

  if (!q) return NextResponse.json({ error: '请输入至少 1 个字符' }, { status: 400 });
  if (q.length < 1) return NextResponse.json({ error: '请输入至少 1 个字符' }, { status: 400 });

  const t0 = Date.now();
  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();
  const results: Hit[] = [];
  const facets: Record<string, Record<string, number>> = { type: {} };

  const safeQ = escapeFts(q);
  const likeQ = `%${q}%`;

  // 分类级读权限（P2）。搜索是最容易漏的出口 —— 只挡列表页不挡搜索等于没挡。
  // 两个别名各算一次：MySQL 分支裸表无别名，SQLite 分支 JOIN 后用 k。
  const acl = buildKnowledgeReadFilter(user, '');
  const aclSql = acl.sql ? ` AND ${acl.sql}` : '';
  const aclK = buildKnowledgeReadFilter(user, 'k');
  const aclKSql = aclK.sql ? ` AND ${aclK.sql}` : '';

  // 需求搜索
  if (type === 'all' || type === 'requirements') {
    let rows: any[] = [];
    if (isMysql) {
      // MySQL FULLTEXT（ngram 模式自动按 2 字切分）
      try {
        rows = (await db.prepare(`
          SELECT r.id, r.title, r.status, r.priority, r.description,
            p.name as project_name, MATCH(r.title, r.description, r.business_unit, r.requester_name, r.benefit, r.solution) AGAINST (? IN NATURAL LANGUAGE MODE) as score
          FROM requirements r
          LEFT JOIN projects p ON p.id = r.project_id
          WHERE MATCH(r.title, r.description, r.business_unit, r.requester_name, r.benefit, r.solution) AGAINST (? IN NATURAL LANGUAGE MODE)
            AND r.merged_into IS NULL
          ORDER BY score DESC
          LIMIT ?
        `).all(q, q, limit)) as any[];
      } catch (e) {
        // 兜底 LIKE
        rows = (await db.prepare(`
          SELECT r.id, r.title, r.status, r.priority, r.description, p.name as project_name, 1 as score
          FROM requirements r LEFT JOIN projects p ON p.id=r.project_id
          WHERE (r.title LIKE ? OR r.description LIKE ? OR r.business_unit LIKE ?)
            AND r.merged_into IS NULL
          ORDER BY r.updated_at DESC LIMIT ?
        `).all(likeQ, likeQ, likeQ, limit)) as any[];
      }
    } else {
      // SQLite FTS5
      try {
        rows = (await db.prepare(`
          SELECT r.id, r.title, r.status, r.priority, r.description, p.name as project_name, rank
          FROM requirements_fts fts
          JOIN requirements r ON r.id = fts.rowid
          LEFT JOIN projects p ON p.id = r.project_id
          WHERE requirements_fts MATCH ? AND r.merged_into IS NULL
          ORDER BY rank LIMIT ?
        `).all(safeQ, limit)) as any[];
        // rank 越小越相关；转换为 0-1 score
        for (const r of rows) r.score = 1 / (1 + Math.abs(r.rank));
      } catch (e) {
        rows = (await db.prepare(`
          SELECT r.id, r.title, r.status, r.priority, r.description, p.name as project_name, 1 as score
          FROM requirements r LEFT JOIN projects p ON p.id=r.project_id
          WHERE (r.title LIKE ? OR r.description LIKE ?) AND r.merged_into IS NULL
          ORDER BY r.updated_at DESC LIMIT ?
        `).all(likeQ, likeQ, limit)) as any[];
      }
    }
    for (const r of dropWeakHits(rows).slice(0, limit)) {
      results.push({
        type: 'requirement',
        id: r.id,
        title: r.title,
        snippet: highlight(r.description || r.title, q),
        score: r.score || 0.5,
        status: r.status,
        priority: r.priority,
        project_name: r.project_name,
      });
      facets.type.requirement = (facets.type.requirement || 0) + 1;
    }
  }

  // 知识搜索
  if (type === 'all' || type === 'knowledge') {
    let rows: any[] = [];
    if (isMysql) {
      try {
        rows = (await db.prepare(`
          SELECT id, title, answer, category, tags, MATCH(title, question, answer, category, tags) AGAINST (? IN NATURAL LANGUAGE MODE) as score
          FROM knowledge_entries
          WHERE status='published' AND MATCH(title, question, answer, category, tags) AGAINST (? IN NATURAL LANGUAGE MODE)${aclSql}
          ORDER BY score DESC LIMIT ?
        `).all(q, q, ...acl.params, limit)) as any[];
      } catch (e) {
        rows = (await db.prepare(`
          SELECT id, title, answer, category, tags, 1 as score
          FROM knowledge_entries WHERE status='published' AND (title LIKE ? OR answer LIKE ?)${aclSql}
          LIMIT ?
        `).all(likeQ, likeQ, ...acl.params, limit)) as any[];
      }
    } else {
      try {
        rows = (await db.prepare(`
          SELECT id, title, answer, category, tags, rank
          FROM knowledge_entries_fts fts
          JOIN knowledge_entries k ON k.id=fts.rowid
          WHERE knowledge_entries_fts MATCH ? AND k.status='published'${aclKSql}
          ORDER BY rank LIMIT ?
        `).all(safeQ, ...aclK.params, limit)) as any[];
        for (const r of rows) r.score = 1 / (1 + Math.abs(r.rank));
      } catch (e) {
        rows = (await db.prepare(`
          SELECT id, title, answer, category, tags, 1 as score
          FROM knowledge_entries WHERE status='published' AND (title LIKE ? OR answer LIKE ?)${aclSql}
          LIMIT ?
        `).all(likeQ, likeQ, ...acl.params, limit)) as any[];
      }
    }
    for (const r of dropWeakHits(rows).slice(0, limit)) {
      results.push({
        type: 'knowledge',
        id: r.id,
        title: r.title,
        snippet: highlight(r.answer || r.title, q),
        score: r.score || 0.5,
        category: r.category,
        tags: r.tags,
      });
      facets.type.knowledge = (facets.type.knowledge || 0) + 1;
    }
  }

  // 项目搜索
  if (type === 'all' || type === 'projects') {
    let rows: any[] = [];
    if (isMysql) {
      try {
        rows = (await db.prepare(`
          SELECT id, name, description, MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE) as score
          FROM projects
          WHERE MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)
          ORDER BY score DESC LIMIT ?
        `).all(q, q, limit)) as any[];
      } catch (e) {
        rows = (await db.prepare(`
          SELECT id, name, description, 1 as score FROM projects
          WHERE name LIKE ? OR description LIKE ? LIMIT ?
        `).all(likeQ, likeQ, limit)) as any[];
      }
    } else {
      try {
        rows = (await db.prepare(`
          SELECT id, name, description, rank
          FROM projects_fts fts JOIN projects p ON p.id=fts.rowid
          WHERE projects_fts MATCH ? ORDER BY rank LIMIT ?
        `).all(safeQ, limit)) as any[];
        for (const r of rows) r.score = 1 / (1 + Math.abs(r.rank));
      } catch (e) {
        rows = (await db.prepare(`
          SELECT id, name, description, 1 as score FROM projects
          WHERE name LIKE ? OR description LIKE ? LIMIT ?
        `).all(likeQ, likeQ, limit)) as any[];
      }
    }
    for (const r of dropWeakHits(rows).slice(0, limit)) {
      results.push({
        type: 'project',
        id: r.id,
        title: r.name,
        snippet: highlight(r.description || r.name, q),
        score: r.score || 0.5,
      });
      facets.type.project = (facets.type.project || 0) + 1;
    }
  }

  // 按 score 降序
  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    query: q,
    total: results.length,
    took_ms: Date.now() - t0,
    results: results.slice(0, limit),
    facets,
  });
}
