import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureFtsIndexes, highlight, escapeFts, escapeFtsMySQL } from '@/lib/fts-migrations';
import { ensureKnowledgeTables } from '@/lib/knowledge-migrations';
import { buildKnowledgeReadFilter } from '@/lib/knowledge-acl';

export const dynamic = 'force-dynamic';

interface Hit { type: string; id: number; title: string; snippet: string; score: number; [k: string]: any; }

/**
 * bigram 噪音过滤（仅用于非精确匹配路径）
 *
 * 历史背景：MySQL 原本用 NATURAL LANGUAGE MODE，ngram 把「需求池」切成
 * 「需求」+「求池」再 OR，实测搜「需求池」返 17 条而真正包含的只有 1 条。
 * 当时只能用「相对最高分比例」做事后降噪。
 *
 * 现在 MySQL 改用 BOOLEAN MODE 短语匹配（+"需求池"），从源头保证精度，
 * 该路径下不再降噪 —— 短语模式下低分命中也是真命中，
 * 再按比例砍就变成误杀（长文档 vs 短标题的 TF-IDF 分差本来就大）。
 * 仍保留给 SQLite 与 LIKE 兜底路径。
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

  // MySQL BOOLEAN MODE 表达式。空串 = 查询全是单字符 token，
  // ngram_token_size=2 根本没索引它们，必须走 LIKE（实测：搜「流」MATCH 0 条、LIKE 5 条）。
  const boolQ = isMysql ? escapeFtsMySQL(q) : '';
  // MySQL 且能用短语模式时，结果已经是精确的，不再比例降噪
  const precise = isMysql && boolQ.length > 0;
  const refine = <T extends { score?: number }>(rows: T[]): T[] => (precise ? rows : dropWeakHits(rows));

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
      // MySQL FULLTEXT BOOLEAN MODE 短语匹配。
      // 原先用 NATURAL LANGUAGE MODE，ngram 把多字词切成 bigram 再 OR，
      // 实测搜「需求池」返 17 条而真含的只 1 条；改 +"需求池" 后精确为 1 条。
      // boolQ 为空（查询全是单字）时直接走 LIKE，ngram 没索引单字。
      if (boolQ) {
        try {
          rows = (await db.prepare(`
            SELECT r.id, r.title, r.status, r.priority, r.description,
              p.name as project_name, MATCH(r.title, r.description, r.business_unit, r.requester_name, r.benefit, r.solution) AGAINST (? IN BOOLEAN MODE) as score
            FROM requirements r
            LEFT JOIN projects p ON p.id = r.project_id
            WHERE MATCH(r.title, r.description, r.business_unit, r.requester_name, r.benefit, r.solution) AGAINST (? IN BOOLEAN MODE)
              AND r.merged_into IS NULL
            ORDER BY score DESC
            LIMIT ?
          `).all(boolQ, boolQ, limit)) as any[];
        } catch (e) {
          rows = [];
        }
      }
      // 单字查询或 FULLTEXT 无果：LIKE 兜底
      if (rows.length === 0) {
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
    for (const r of refine(rows).slice(0, limit)) {
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
      if (boolQ) {
        try {
          rows = (await db.prepare(`
            SELECT id, title, answer, category, tags, MATCH(title, question, answer, category, tags) AGAINST (? IN BOOLEAN MODE) as score
            FROM knowledge_entries
            WHERE status='published' AND MATCH(title, question, answer, category, tags) AGAINST (? IN BOOLEAN MODE)${aclSql}
            ORDER BY score DESC LIMIT ?
          `).all(boolQ, boolQ, ...acl.params, limit)) as any[];
        } catch (e) {
          rows = [];
        }
      }
      if (rows.length === 0) {
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
    for (const r of refine(rows).slice(0, limit)) {
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
      if (boolQ) {
        try {
          rows = (await db.prepare(`
            SELECT id, name, description, MATCH(name, description) AGAINST (? IN BOOLEAN MODE) as score
            FROM projects
            WHERE MATCH(name, description) AGAINST (? IN BOOLEAN MODE)
            ORDER BY score DESC LIMIT ?
          `).all(boolQ, boolQ, limit)) as any[];
        } catch (e) {
          rows = [];
        }
      }
      if (rows.length === 0) {
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
    for (const r of refine(rows).slice(0, limit)) {
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
