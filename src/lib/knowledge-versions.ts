/**
 * 知识版本历史（P4）
 *
 * 设计要点：
 *
 * 1. **自动快照** —— PUT 时先存旧值再更新，不指望人手动点「创建快照」。
 *    现有 requirement_versions 就是反面教材：只能手动 POST 触发，
 *    改需求时不会自动存版本，等于绝大多数变更都没有历史。
 *
 * 2. **存旧值不存新值** —— 快照记录的是「改之前长什么样」。
 *    这样 version_no=N 表示「第 N 次修改前的状态」，回滚到 N 就是拿这份数据。
 *
 * 3. **tags 存 JSON 快照** —— 不引用 join 表。
 *    历史版本要的是「当时长什么样」，跟随现在的标签关系变动就不叫快照了。
 *
 * 4. **回滚本身也产生新版本** —— 否则回滚会丢掉「回滚前的状态」，历史断链。
 */

type AsyncDb = {
  prepare: (sql: string) => {
    get: (...p: any[]) => Promise<any>;
    all: (...p: any[]) => Promise<any>;
    run: (...p: any[]) => Promise<any>;
  };
};

/** 快照里保存的字段（与 knowledge_versions 表列对应） */
const SNAPSHOT_FIELDS = [
  'title', 'question', 'answer', 'content',
  'category', 'category_id', 'type', 'status',
] as const;

/**
 * 为某条目当前状态创建版本快照。
 *
 * @param entry   当前条目行（改动之前的值）
 * @param tags    当时的标签名列表
 * @returns 新版本号
 */
export async function snapshotKnowledgeVersion(
  db: AsyncDb,
  entry: any,
  tags: string[],
  changeSummary: string,
  changedBy: number
): Promise<number> {
  const entryId = Number(entry.id);

  const maxRow = (await db.prepare(
    'SELECT MAX(version_no) AS max_v FROM knowledge_versions WHERE entry_id = ?'
  ).get(entryId)) as any;
  const nextVersion = Number(maxRow?.max_v || 0) + 1;

  (await db.prepare(`
    INSERT INTO knowledge_versions (
      entry_id, version_no, title, question, answer, content,
      category, category_id, tags_snapshot, type, status, change_summary, changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entryId,
    nextVersion,
    entry.title ?? null,
    entry.question ?? null,
    entry.answer ?? null,
    entry.content ?? null,
    entry.category ?? null,
    entry.category_id ?? null,
    JSON.stringify(Array.isArray(tags) ? tags : []),
    entry.type ?? null,
    entry.status ?? null,
    // 列宽 255，超长会在严格模式下直接报错而不是静默截断
    String(changeSummary || '内容更新').slice(0, 255),
    changedBy || null
  ));

  return nextVersion;
}

/** 列出某条目的版本历史 */
export async function listKnowledgeVersions(db: AsyncDb, entryId: number): Promise<any[]> {
  const rows = (await db.prepare(`
    SELECT v.id, v.entry_id, v.version_no, v.title, v.category, v.category_id,
           v.type, v.status, v.change_summary, v.changed_by, v.changed_at,
           u.display_name AS changed_by_name
    FROM knowledge_versions v
    LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.entry_id = ?
    ORDER BY v.version_no DESC
  `).all(entryId)) as any[];
  return Array.isArray(rows) ? rows : [];
}

/** 取某个具体版本的完整内容 */
export async function getKnowledgeVersion(
  db: AsyncDb,
  entryId: number,
  versionNo: number
): Promise<any | null> {
  const row = (await db.prepare(`
    SELECT v.*, u.display_name AS changed_by_name
    FROM knowledge_versions v
    LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.entry_id = ? AND v.version_no = ?
  `).get(entryId, versionNo)) as any;

  if (!row) return null;

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags_snapshot || '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((x: any) => typeof x === 'string');
  } catch {
    tags = [];
  }

  return { ...row, tags };
}

/** 两个版本（或版本与当前值）的字段级差异 */
export function diffKnowledgeVersions(a: any, b: any): Array<{ field: string; from: any; to: any }> {
  const diffs: Array<{ field: string; from: any; to: any }> = [];

  for (const field of SNAPSHOT_FIELDS) {
    const from = a?.[field] ?? null;
    const to = b?.[field] ?? null;
    if (String(from ?? '') !== String(to ?? '')) {
      diffs.push({ field, from, to });
    }
  }

  // 标签比较按集合语义，顺序不同不算变更
  const tagsA = [...(Array.isArray(a?.tags) ? a.tags : [])].sort();
  const tagsB = [...(Array.isArray(b?.tags) ? b.tags : [])].sort();
  if (JSON.stringify(tagsA) !== JSON.stringify(tagsB)) {
    diffs.push({ field: 'tags', from: tagsA, to: tagsB });
  }

  return diffs;
}
