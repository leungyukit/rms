/**
 * 知识标签 · join 表读写
 *
 * 迁移策略：双写一轮。
 * - 写：同时写 knowledge_tags join 表和老的 tags JSON 列
 * - 读：join 表优先，为空时回落 JSON 列
 *
 * 为什么不直接摘掉 JSON 列：老数据全在 JSON 里，且前端多处直接读 item.tags。
 * 双写期过后（数据回填完、前端切到 join 表）再单独提一次清理。
 */
import { dedupeTags, normalizeTagKey } from './tag-normalize';

type AsyncDb = {
  prepare: (sql: string) => {
    get: (...p: any[]) => Promise<any>;
    all: (...p: any[]) => Promise<any>;
    run: (...p: any[]) => Promise<any>;
  };
};

/**
 * 按归一化键找到或创建标签，返回 tag id 列表。
 *
 * 复用已有的 tags 表（原本只服务需求），这样知识标签和需求标签共用词表，
 * 「性能优化」在两边是同一个标签，才能做跨域聚合。
 */
export async function resolveTagIds(db: AsyncDb, rawTags: unknown): Promise<number[]> {
  const tags = dedupeTags(rawTags);
  if (tags.length === 0) return [];

  const ids: number[] = [];

  for (const { name, key } of tags) {
    // 先按归一化键找（能命中「性能优化」vs「性能优化 」这类变体）
    let row = (await db.prepare('SELECT id FROM tags WHERE norm_key = ? LIMIT 1').get(key)) as any;

    // norm_key 尚未回填的老数据兜底：按原名精确匹配
    if (!row) {
      row = (await db.prepare('SELECT id FROM tags WHERE name = ? LIMIT 1').get(name)) as any;
      if (row) {
        // 顺手补上归一化键，下次就能走上面那条路径
        (await db.prepare('UPDATE tags SET norm_key = ? WHERE id = ?').run(key, row.id));
      }
    }

    if (row) {
      ids.push(Number(row.id));
      continue;
    }

    const result = (await db.prepare(
      'INSERT INTO tags (name, norm_key) VALUES (?, ?)'
    ).run(name, key)) as any;
    ids.push(Number(result.lastInsertRowid));
  }

  return ids;
}

/** 全量替换某知识条目的标签关联 */
export async function syncKnowledgeTags(db: AsyncDb, entryId: number, rawTags: unknown): Promise<string[]> {
  const tags = dedupeTags(rawTags);
  const ids = await resolveTagIds(db, rawTags);

  (await db.prepare('DELETE FROM knowledge_tags WHERE entry_id = ?').run(entryId));
  for (const tagId of ids) {
    // 并发重复插入不该让整个请求失败，用 IGNORE 语义兜住
    try {
      (await db.prepare('INSERT INTO knowledge_tags (entry_id, tag_id) VALUES (?, ?)').run(entryId, tagId));
    } catch {
      // 主键冲突 = 已存在，忽略
    }
  }

  return tags.map(t => t.name);
}

/** 读取某条目的标签名列表（join 表优先，回落 JSON 列） */
export async function readKnowledgeTags(db: AsyncDb, entryId: number, jsonFallback: unknown): Promise<string[]> {
  const rows = (await db.prepare(`
    SELECT t.name AS name FROM knowledge_tags kt
    JOIN tags t ON t.id = kt.tag_id
    WHERE kt.entry_id = ?
    ORDER BY t.name
  `).all(entryId)) as any[];

  if (Array.isArray(rows) && rows.length > 0) return rows.map(r => String(r.name));

  // 回落：老数据仍在 JSON 列里
  if (typeof jsonFallback === 'string') {
    try {
      const parsed = JSON.parse(jsonFallback);
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(jsonFallback) ? (jsonFallback as string[]) : [];
}

/** 按标签名查条目 id（用于标签检索），名字走归一化匹配 */
export async function entryIdsByTag(db: AsyncDb, tagName: string): Promise<number[]> {
  const key = normalizeTagKey(tagName);
  if (!key) return [];

  const rows = (await db.prepare(`
    SELECT kt.entry_id AS entry_id FROM knowledge_tags kt
    JOIN tags t ON t.id = kt.tag_id
    WHERE t.norm_key = ?
  `).all(key)) as any[];

  return Array.isArray(rows) ? rows.map(r => Number(r.entry_id)) : [];
}
