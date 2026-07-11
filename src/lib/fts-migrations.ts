/**
 * 全文搜索 · FTS5/FULLTEXT 索引与触发器
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 2
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureFtsIndexes() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    // MySQL FULLTEXT（InnoDB 引擎 5.6+ 支持；ngram 默认分词适合中文）
    try {
      db.exec(`
        ALTER TABLE requirements ADD FULLTEXT INDEX ft_requirements (title, description, business_unit, requester_name, benefit, solution)
      `);
    } catch (e) { /* 已存在忽略 */ }
    try {
      db.exec(`ALTER TABLE knowledge_entries ADD FULLTEXT INDEX ft_knowledge (title, question, answer, category, tags)`);
    } catch (e) { /* 已存在忽略 */ }
    try {
      db.exec(`ALTER TABLE projects ADD FULLTEXT INDEX ft_projects (name, description)`);
    } catch (e) { /* 已存在忽略 */ }
    // 设置 ngram_token_size=2（适当中文分词）—— 需要 SUPER 权限，这里仅尝试
    try { db.exec(`SET GLOBAL ngram_token_size=2`); } catch (e) { /* 权限不足忽略 */ }
  } else {
    // SQLite FTS5 外部内容模式
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS requirements_fts USING fts5(
          title, description, business_unit, requester_name, benefit, solution,
          content='requirements', content_rowid='id',
          tokenize = "unicode61 remove_diacritics 2"
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_entries_fts USING fts5(
          title, question, answer, category, tags,
          content='knowledge_entries', content_rowid='id',
          tokenize = "unicode61 remove_diacritics 2"
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
          name, description,
          content='projects', content_rowid='id',
          tokenize = "unicode61 remove_diacritics 2"
        );
      `);
    } catch (e) {
      // 兜底（已存在）
    }

    // 触发器
    const triggers = [
      `CREATE TRIGGER IF NOT EXISTS requirements_ai AFTER INSERT ON requirements BEGIN
         INSERT INTO requirements_fts(rowid, title, description, business_unit, requester_name, benefit, solution)
         VALUES (new.id, new.title, IFNULL(new.description,''), IFNULL(new.business_unit,''), IFNULL(new.requester_name,''), IFNULL(new.benefit,''), IFNULL(new.solution,''));
       END`,
      `CREATE TRIGGER IF NOT EXISTS requirements_ad AFTER DELETE ON requirements BEGIN
         INSERT INTO requirements_fts(requirements_fts, rowid, title, description, business_unit, requester_name, benefit, solution)
         VALUES('delete', old.id, old.title, IFNULL(old.description,''), IFNULL(old.business_unit,''), IFNULL(old.requester_name,''), IFNULL(old.benefit,''), IFNULL(old.solution,''));
       END`,
      `CREATE TRIGGER IF NOT EXISTS requirements_au AFTER UPDATE ON requirements BEGIN
         INSERT INTO requirements_fts(requirements_fts, rowid, title, description, business_unit, requester_name, benefit, solution)
         VALUES('delete', old.id, old.title, IFNULL(old.description,''), IFNULL(old.business_unit,''), IFNULL(old.requester_name,''), IFNULL(old.benefit,''), IFNULL(old.solution,''));
         INSERT INTO requirements_fts(rowid, title, description, business_unit, requester_name, benefit, solution)
         VALUES (new.id, new.title, IFNULL(new.description,''), IFNULL(new.business_unit,''), IFNULL(new.requester_name,''), IFNULL(new.benefit,''), IFNULL(new.solution,''));
       END`,
    ];
    for (const t of triggers) { try { db.exec(t); } catch (e) {} }

    // 回填
    try { db.exec(`INSERT IGNORE INTO requirements_fts(rowid, title, description, business_unit, requester_name, benefit, solution) SELECT id, title, IFNULL(description,''), IFNULL(business_unit,''), IFNULL(requester_name,''), IFNULL(benefit,''), IFNULL(solution,'') FROM requirements`); } catch (e) {}
    try { db.exec(`INSERT IGNORE INTO knowledge_entries_fts(rowid, title, question, answer, category, tags) SELECT id, title, IFNULL(question,''), IFNULL(answer,''), IFNULL(category,''), IFNULL(tags,'') FROM knowledge_entries`); } catch (e) {}
    try { db.exec(`INSERT IGNORE INTO projects_fts(rowid, name, description) SELECT id, name, IFNULL(description,'') FROM projects`); } catch (e) {}
  }

  ensured = true;
}

// FTS 特殊字符转义（用于 LIKE/MATCH 安全）
export function escapeFts(s: string): string {
  if (!s) return '';
  // 去掉 FTS5 操作符
  return s.replace(/[^\w\u4e00-\u9fa5\s]/g, ' ').trim();
}

// 高亮（前后包 <mark>）
export function highlight(text: string, keyword: string, maxLen = 80): string {
  if (!text || !keyword) return text || '';
  const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const k = keyword.trim();
  if (!k) return safe.substring(0, maxLen) + (safe.length > maxLen ? '...' : '');
  const idx = safe.toLowerCase().indexOf(k.toLowerCase());
  if (idx < 0) return safe.substring(0, maxLen) + (safe.length > maxLen ? '...' : '');
  const start = Math.max(0, idx - 20);
  const end = Math.min(safe.length, idx + k.length + 40);
  let snippet = (start > 0 ? '...' : '') + safe.substring(start, end) + (end < safe.length ? '...' : '');
  // 高亮
  const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return snippet.replace(re, m => `<mark>${m}</mark>`);
}
