/**
 * 知识推荐 · 缓存表
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 5
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureRecommendTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_recommendations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_type VARCHAR(20) NOT NULL,
        source_id INT NOT NULL,
        target_type VARCHAR(20) NOT NULL,
        target_id INT NOT NULL,
        score DOUBLE NOT NULL,
        algo VARCHAR(30) NOT NULL,
        rank_no INT NOT NULL,
        computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY kr_unique (source_type, source_id, target_type, target_id, algo),
        KEY idx_kr_source (source_type, source_id, rank_no),
        KEY idx_kr_computed (computed_at)
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        score REAL NOT NULL,
        algo TEXT NOT NULL,
        rank_no INTEGER NOT NULL,
        computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_type, source_id, target_type, target_id, algo)
      );
      CREATE INDEX IF NOT EXISTS idx_kr_source ON knowledge_recommendations(source_type, source_id, rank_no);
      CREATE INDEX IF NOT EXISTS idx_kr_computed ON knowledge_recommendations(computed_at);
    `);
  }

  ensured = true;
}

// 计算两个 tag 数组的 Jaccard 相似度
export function jaccard(a: string[], b: string[]): { score: number; shared: string[] } {
  const sa = new Set(a.map(x => x.toLowerCase().trim()).filter(Boolean));
  const sb = new Set(b.map(x => x.toLowerCase().trim()).filter(Boolean));
  const inter = [...sa].filter(x => sb.has(x));
  const union = new Set([...sa, ...sb]);
  return { score: union.size === 0 ? 0 : inter.length / union.size, shared: inter };
}

// BM25 简化版
function tokenize(s: string): string[] {
  if (!s) return [];
  return s.toLowerCase().match(/[\u4e00-\u9fa5]|[a-z]+|[0-9]+/g) || [];
}

export function bm25(query: string, doc: string, k1 = 1.5, b = 0.75): number {
  const qTokens = tokenize(query);
  const dTokens = tokenize(doc);
  if (!qTokens.length || !dTokens.length) return 0;
  const avgdl = 100; // 假设平均 100 tokens
  const dl = dTokens.length;
  let score = 0;
  for (const qt of qTokens) {
    const tf = dTokens.filter(x => x === qt).length;
    if (tf === 0) continue;
    const idf = Math.log(1 + 1 / (tf + 0.5));
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
  }
  return score / qTokens.length;
}

interface Recommendation {
  knowledge_id: number;
  title: string;
  category: string;
  tags: string;
  snippet: string;
  score: number;
  algo_breakdown: { tag_jaccard: number; title_bm25: number; embedding_cosine: null };
  matched_tags: string[];
}

const CACHE_TTL = 60 * 60 * 1000; // 1h

// 计算并缓存单个需求的推荐
export function recommendForRequirement(reqId: number, limit = 5): { results: Recommendation[]; cached: boolean; computed_at: string } {
  ensureRecommendTables();
  const db = getDb();
  const isMysql = isMysqlEnabled();
  const ageExpr = isMysql ? `computed_at > NOW() - INTERVAL 1 HOUR` : `computed_at > datetime('now', '-1 hour')`;

  // 读缓存
  const cached = db.prepare(`
    SELECT kr.*, k.title, k.category, k.tags, k.answer
    FROM knowledge_recommendations kr
    JOIN knowledge_entries k ON k.id = kr.target_id
    WHERE kr.source_type='requirement' AND kr.source_id=? AND kr.algo='combined'
      AND ${ageExpr}
    ORDER BY kr.rank_no ASC LIMIT ?
  `).all(reqId, limit) as any[];

  if (cached.length > 0) {
    return { results: cached.map(formatResult), cached: true, computed_at: cached[0].computed_at };
  }

  // 重新计算
  const req = db.prepare(`SELECT id, title, description, business_unit FROM requirements WHERE id=?`).get(reqId) as any;
  if (!req) return { results: [], cached: false, computed_at: '' };

  const reqTags = extractTags(req);
  const candidates = db.prepare(`SELECT id, title, answer, category, tags FROM knowledge_entries WHERE status='published'`).all() as any[];

  const scored: Recommendation[] = candidates.map(k => {
    const kTags = (k.tags || '').split(/[,，;；]/).map((x: string) => x.trim()).filter(Boolean);
    const j = jaccard(reqTags, kTags);
    const b25 = bm25(req.title || '', k.title || '');
    const score = 0.6 * j.score + 0.4 * Math.min(1, b25);
    return {
      knowledge_id: k.id,
      title: k.title,
      category: k.category || '',
      tags: k.tags || '',
      snippet: (k.answer || '').substring(0, 100),
      score,
      algo_breakdown: { tag_jaccard: j.score, title_bm25: Math.min(1, b25), embedding_cosine: null },
      matched_tags: j.shared,
    };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  // 写缓存
  db.prepare(`DELETE FROM knowledge_recommendations WHERE source_type='requirement' AND source_id=?`).run(reqId);
  const ins = db.prepare(`
    INSERT INTO knowledge_recommendations(source_type, source_id, target_type, target_id, score, algo, rank_no, computed_at)
    VALUES ('requirement', ?, 'knowledge', ?, ?, 'combined', ?, CURRENT_TIMESTAMP)
  `);
  scored.forEach((r, i) => ins.run(reqId, r.knowledge_id, r.score, i + 1));

  return { results: scored, cached: false, computed_at: new Date().toISOString() };
}

// 引用此知识的需求（反向）
export function requirementsReferencing(knowledgeId: number, limit = 5): any[] {
  const db = getDb();
  const k = db.prepare(`SELECT title, tags, category, question FROM knowledge_entries WHERE id=?`).get(knowledgeId) as any;
  if (!k) return [];
  // 抽取关键词：标题、问题、tag 任一
  const keys = new Set<string>();
  const kw = (k.title || '').match(/[\u4e00-\u9fa5]{2,}/g) || [];
  kw.forEach((x: string) => keys.add(x));
  (k.tags || '').split(/[,，;；\s]+/).filter(Boolean).forEach((t: string) => keys.add(t));
  (k.question || '').match(/[\u4e00-\u9fa5]{2,}/g)?.forEach((t: string) => keys.add(t));
  if (keys.size === 0) return [];
  const all = db.prepare(`SELECT id, title, description, status, priority, updated_at FROM requirements WHERE status NOT IN ('closed')`).all() as any[];
  const ranked = all.map(r => {
    const hay = (r.title || '') + '\n' + (r.description || '');
    let matched: string[] = [];
    for (const k2 of keys) if (hay.includes(k2)) matched.push(k2);
    return { r, score: matched.length, matched };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return ranked.map(x => ({ id: x.r.id, title: x.r.title, status: x.r.status, priority: x.r.priority, updated_at: x.r.updated_at, matched_keywords: x.matched }));
}

function extractTags(req: any): string[] {
  // 从 requirements + requirement_tags 关联取 tag
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT t.name FROM requirement_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.requirement_id=?
    `).all(req.id) as any[];
    if (rows.length) return rows.map(r => r.name);
  } catch (e) {}
  // 兜底：从 title/description 提取关键词
  return (req.title || '').match(/[\u4e00-\u9fa5]{2,}/g) || [];
}

function formatResult(r: any): Recommendation {
  return {
    knowledge_id: r.target_id,
    title: r.title,
    category: r.category || '',
    tags: r.tags || '',
    snippet: (r.answer || '').substring(0, 100),
    score: r.score,
    algo_breakdown: { tag_jaccard: 0, title_bm25: 0, embedding_cosine: null },
    matched_tags: [],
  };
}
