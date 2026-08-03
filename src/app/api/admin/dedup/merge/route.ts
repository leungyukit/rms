import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureDedupFields } from '@/lib/dedup-migrations';

/**
 * POST /api/admin/dedup/merge
 * body: {
 *   primary_id: 主需求 ID,
 *   duplicate_ids: [重复1, 重复2, ...],
 *   merge_attachments, merge_comments, merge_children, merge_timeline, merge_tags: bool,
 *   note?: string
 * }
 *
 * 事务内：
 *   1) 校验 primary 未被合并，且所有 duplicate 不等于 primary
 *   2) 迁移附件/评论/子任务/时间线/标签到主需求
 *   3) 在 requirement_relations 写 duplicate_of 关系
 *   4) 标记 duplicate.merged_into = primary，title 加 [重复-已合并到#N] 后缀
 *   5) 在 status_log 记 closed
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const userIsAdmin = (user.roles || []).some((r: any) => r === 'global_admin' || r?.name === 'global_admin');
  if (!userIsAdmin) {
    return NextResponse.json({ error: '需要 global_admin 权限' }, { status: 403 });
  }

  ensureDedupFields();
  const body = await req.json();
  const db = getAsyncDb();

  const primaryId = parseInt(body.primary_id, 10);
  const dupIds: number[] = (body.duplicate_ids || []).map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));

  if (!primaryId || dupIds.length === 0) {
    return NextResponse.json({ error: 'primary_id 和 duplicate_ids 必填' }, { status: 400 });
  }
  if (dupIds.includes(primaryId)) {
    return NextResponse.json({ error: '主需求不能在 duplicate_ids 中' }, { status: 400 });
  }

  // 1) 校验
  const primary = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(primaryId)) as any;
  if (!primary) return NextResponse.json({ error: `主需求 #${primaryId} 不存在` }, { status: 404 });
  if (primary.merged_into != null) {
    return NextResponse.json({ error: `主需求 #${primaryId} 已被合并到 #${primary.merged_into}，不可作为主` }, { status: 400 });
  }
  const duplicates = await Promise.all(dupIds.map(async id => {
    const r = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(id)) as any;
    if (!r) throw new Error(`需求 #${id} 不存在`);
    if (r.merged_into != null) throw new Error(`需求 #${id} 已被合并到 #${r.merged_into}`);
    return r;
  }));

  const mergeFlags = {
    attachments: body.merge_attachments !== false,
    comments: body.merge_comments !== false,
    children: body.merge_children !== false,
    timeline: body.merge_timeline !== false,
    tags: body.merge_tags !== false,
  };

  // 2) 事务化合并
  const migrationSummary: Record<string, number> = {
    attachments: 0, comments: 0, children: 0, timeline: 0, tags: 0, relations: 0,
  };

  const exec = async (sql: string, ...params: any[]) => (await db.prepare(sql).run(...params));
  const all = async (sql: string, ...params: any[]) => (await db.prepare(sql).all(...params)) as any[];

  // 真事务（2026-08-03 修复）：
  // 原实现只有 try/catch，且 exec() 全程未 await —— 任一步失败时前面的 UPDATE 已提交，
  // 需求被“半合并”（附件迁走了、merged_into 没写上），数据永久错乱且无法回滚。
  // 现统一走 db.transaction()：MySQL 用 AsyncLocalStorage 绑同一连接，SQLite 走串行化 BEGIN IMMEDIATE。
  const mergeTx = await db.transaction(async () => {
    for (const dup of duplicates) {
      // 附件
      if (mergeFlags.attachments) {
        const attsBefore = (await all('SELECT id FROM attachments WHERE requirement_id = ?', dup.id) || []).length;
        await exec('UPDATE attachments SET requirement_id = ? WHERE requirement_id = ?', primaryId, dup.id);
        migrationSummary.attachments += attsBefore;
      }
      // 评论
      if (mergeFlags.comments) {
        const cBefore = (await all('SELECT id FROM requirement_comments WHERE requirement_id = ?', dup.id) || []).length;
        await exec('UPDATE requirement_comments SET requirement_id = ? WHERE requirement_id = ?', primaryId, dup.id);
        migrationSummary.comments += cBefore;
      }
      // 子任务
      if (mergeFlags.children) {
        const chBefore = (await all('SELECT id FROM requirements WHERE parent_id = ?', dup.id) || []).length;
        await exec('UPDATE requirements SET parent_id = ? WHERE parent_id = ?', primaryId, dup.id);
        migrationSummary.children += chBefore;
      }
      // 时间线
      if (mergeFlags.timeline) {
        const tBefore = (await all('SELECT id FROM requirement_timeline WHERE requirement_id = ?', dup.id) || []).length;
        await exec('UPDATE requirement_timeline SET requirement_id = ? WHERE requirement_id = ?', primaryId, dup.id);
        migrationSummary.timeline += tBefore;
      }
      // 标签：只迁移主需求还没有的，避开唯一键冲突（原来的 ON CONFLICT/INSERT IGNORE 双写在两种方言下都不可靠）
      if (mergeFlags.tags) {
        const dupTags = await all('SELECT tag_id FROM requirement_tags WHERE requirement_id = ?', dup.id);
        const primaryTags = new Set(
          (await all('SELECT tag_id FROM requirement_tags WHERE requirement_id = ?', primaryId)).map((t: any) => t.tag_id)
        );
        let moved = 0;
        for (const t of dupTags) {
          if (primaryTags.has(t.tag_id)) continue;
          await exec('INSERT INTO requirement_tags (requirement_id, tag_id) VALUES (?, ?)', primaryId, t.tag_id);
          primaryTags.add(t.tag_id);
          moved++;
        }
        await exec('DELETE FROM requirement_tags WHERE requirement_id = ?', dup.id);
        migrationSummary.tags += moved;
      }

      // 关系表登记
      await exec(`INSERT INTO requirement_relations (source_id, target_id, relation_type) VALUES (?, ?, 'duplicate_of')`, dup.id, primaryId);
      migrationSummary.relations += 1;

      // 标记合并
      const newTitle = dup.title + ` [重复-已合并到#${primaryId}]`;
      await exec('UPDATE requirements SET merged_into = ?, merged_at = CURRENT_TIMESTAMP, title = ? WHERE id = ?', primaryId, newTitle, dup.id);

      // 写 status_log
      await exec(`INSERT INTO status_log (requirement_id, old_status, new_status, changed_by, note) VALUES (?, ?, 'closed', ?, ?)`,
        dup.id, dup.status, user.id, body.note || `合并到 #${primaryId}`);
    }
  });

  try {
    await mergeTx();
  } catch (e: any) {
    return NextResponse.json({ error: '合并失败（已整体回滚）：' + (e?.message || '未知错误') }, { status: 500 });
  }

  await logAudit(user.id, user.username, 'merge_requirements',
    `合并 ${dupIds.length} 条到 #${primaryId}：${JSON.stringify(migrationSummary)}。备注：${body.note || ''}`);

  return NextResponse.json({ success: true, primary_id: primaryId, merged_count: dupIds.length, summary: migrationSummary });
}
