/**
 * 全文搜索 · FTS5/FULLTEXT 索引与触发器
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 2
 *
 * 2026-09-01 P1 重写。原实现有三个真问题（全部实测复现）：
 *
 * 1. MySQL 侧 FULLTEXT 索引**一个都没建成**
 *    （information_schema.STATISTICS WHERE INDEX_TYPE='FULLTEXT' 返回 0 行），
 *    检索一直在走 LIKE 兜底，而 catch{} 把失败吞了所以没人知道。
 * 2. 即便建成也漏了 `WITH PARSER ngram` —— 不带 parser 的 FULLTEXT 对中文
 *    等于按空格切词，整句中文会被当成一个 token，基本搜不出东西。
 * 3. SQLite 侧只给 requirements 建了同步触发器，knowledge_entries_fts 和
 *    projects_fts 只做了一次性回填 → 新增/修改的知识永远搜不到。
 *
 * 规矩：DDL 先探元数据再执行（幂等），失败一律上抛，不再 catch{} 吞掉。
 *
 * ⚠️ MySQL 要求 MATCH() 的列清单与 FULLTEXT 索引**完全一致**，
 * 所以下面 FT_INDEXES 的列顺序必须与 api/search/route.ts 里的 MATCH() 保持同步。
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

/** [表, 索引名, 列清单] —— 列清单须与 search/route.ts 的 MATCH() 逐字一致 */
const FT_INDEXES: Array<[string, string, string]> = [
  ['requirements', 'ft_requirements', 'title, description, business_unit, requester_name, benefit, solution'],
  ['knowledge_entries', 'ft_knowledge', 'title, question, answer, category, tags'],
  ['projects', 'ft_projects', 'name, description'],
];

/** SQLite 外部内容 FTS5 虚表定义：[虚表, 源表, 列清单] */
const FTS5_TABLES: Array<[string, string, string[]]> = [
  ['requirements_fts', 'requirements', ['title', 'description', 'business_unit', 'requester_name', 'benefit', 'solution']],
  ['knowledge_entries_fts', 'knowledge_entries', ['title', 'question', 'answer', 'category', 'tags']],
  ['projects_fts', 'projects', ['name', 'description']],
];

// ---------- 探测 ----------

function currentSchema(): string {
  const db = getDb();
  const row = db.prepare('SELECT DATABASE() AS db_name').get() as any;
  return row?.db_name || '';
}

function mysqlIndexExists(table: string, index: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`
  ).get(currentSchema(), table, index) as any;
  return Number(row?.cnt || 0) > 0;
}

function mysqlTableExists(table: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`
  ).get(currentSchema(), table) as any;
  return Number(row?.cnt || 0) > 0;
}

function sqliteObjectExists(name: string): boolean {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE name = ?`
  ).get(name) as any;
  return Number(row?.cnt || 0) > 0;
}

// ---------- SQLite 触发器 ----------

/**
 * 给外部内容 FTS5 虚表生成 insert/delete/update 三件套触发器。
 *
 * 外部内容模式（content=）不会自动跟随源表，必须靠触发器同步；
 * delete/update 要先写一条 'delete' 指令行再插新行，否则索引会残留旧词。
 */
function sqliteTriggersFor(fts: string, src: string, cols: string[]): string[] {
  const colList = cols.join(', ');
  // title 之外的列可能为 NULL，FTS5 遇 NULL 会整行跳过，统一 IFNULL 兜底
  const newVals = cols.map(c => (c === 'title' || c === 'name' ? `new.${c}` : `IFNULL(new.${c},'')`)).join(', ');
  const oldVals = cols.map(c => (c === 'title' || c === 'name' ? `old.${c}` : `IFNULL(old.${c},'')`)).join(', ');
  const prefix = src.replace(/[^a-z_]/g, '');

  return [
    `CREATE TRIGGER IF NOT EXISTS ${prefix}_fts_ai AFTER INSERT ON ${src} BEGIN
       INSERT INTO ${fts}(rowid, ${colList}) VALUES (new.id, ${newVals});
     END`,
    `CREATE TRIGGER IF NOT EXISTS ${prefix}_fts_ad AFTER DELETE ON ${src} BEGIN
       INSERT INTO ${fts}(${fts}, rowid, ${colList}) VALUES('delete', old.id, ${oldVals});
     END`,
    `CREATE TRIGGER IF NOT EXISTS ${prefix}_fts_au AFTER UPDATE ON ${src} BEGIN
       INSERT INTO ${fts}(${fts}, rowid, ${colList}) VALUES('delete', old.id, ${oldVals});
       INSERT INTO ${fts}(rowid, ${colList}) VALUES (new.id, ${newVals});
     END`,
  ];
}

// ---------- 入口 ----------

export function ensureFtsIndexes() {
  if (ensured) return;
  const db = getDb();

  if (isMysqlEnabled()) {
    for (const [table, index, cols] of FT_INDEXES) {
      if (!mysqlTableExists(table)) continue;
      if (mysqlIndexExists(table, index)) continue;
      // WITH PARSER ngram 是中文检索的关键；ngram_token_size 是只读全局变量，
      // 需在 my.cnf 配置，运行时 SET GLOBAL 改不了 —— 原实现那行纯属无效代码，已删。
      db.exec(`ALTER TABLE ${table} ADD FULLTEXT INDEX ${index} (${cols}) WITH PARSER ngram`);
    }
  } else {
    // SQLite FTS5 外部内容模式
    for (const [fts, src, cols] of FTS5_TABLES) {
      if (!sqliteObjectExists(src)) continue;

      if (!sqliteObjectExists(fts)) {
        db.exec(`
          CREATE VIRTUAL TABLE ${fts} USING fts5(
            ${cols.join(', ')},
            content='${src}', content_rowid='id',
            tokenize = "unicode61 remove_diacritics 2"
          )
        `);
        // 新建虚表才回填；已存在则交给触发器，避免重复插入把索引搞脏
        const selectCols = cols.map(c => (c === 'title' || c === 'name' ? c : `IFNULL(${c},'')`)).join(', ');
        db.exec(`INSERT INTO ${fts}(rowid, ${cols.join(', ')}) SELECT id, ${selectCols} FROM ${src}`);
      }

      // 触发器：原实现只给 requirements 建了，knowledge/projects 漏了
      for (const trigger of sqliteTriggersFor(fts, src, cols)) {
        db.exec(trigger);
      }
    }
  }

  ensured = true;
}

/** 测试/巡检用：强制重跑 */
export function resetFtsMigrationCache() {
  ensured = false;
}

// ---------- 自检 ----------

export interface FtsCheck {
  target: string;
  kind: 'index' | 'trigger' | 'table';
  present: boolean;
}

/** 逐项核对全文索引/触发器是否真的落地了（原实现全靠 catch{} 静默，什么都看不到） */
export function verifyFtsSchema(): { ok: boolean; checks: FtsCheck[] } {
  const checks: FtsCheck[] = [];

  if (isMysqlEnabled()) {
    for (const [table, index] of FT_INDEXES) {
      checks.push({
        target: `${table}.${index}`,
        kind: 'index',
        present: mysqlTableExists(table) ? mysqlIndexExists(table, index) : true,
      });
    }
  } else {
    for (const [fts, src] of FTS5_TABLES) {
      if (!sqliteObjectExists(src)) continue;
      checks.push({ target: fts, kind: 'table', present: sqliteObjectExists(fts) });
      const prefix = src.replace(/[^a-z_]/g, '');
      for (const suffix of ['ai', 'ad', 'au']) {
        checks.push({
          target: `${prefix}_fts_${suffix}`,
          kind: 'trigger',
          present: sqliteObjectExists(`${prefix}_fts_${suffix}`),
        });
      }
    }
  }

  return { ok: checks.every(c => c.present), checks };
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
