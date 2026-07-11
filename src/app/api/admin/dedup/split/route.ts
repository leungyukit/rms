import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureDedupFields } from '@/lib/dedup-migrations';

/**
 * POST /api/admin/dedup/split
 * 误判回滚：把已经合并的需求恢复独立
 * body: { requirement_id: 18 }
 *
 * 1) 清掉 merged_into / merged_at / title 后缀
 * 2) 不回滚已迁移的附件/评论等（避免数据撕裂），但记录到 audit_logs
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
  const reqId = parseInt(body.requirement_id, 10);
  if (!reqId) return NextResponse.json({ error: 'requirement_id 必填' }, { status: 400 });

  const db = getAsyncDb();
  const r = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(reqId)) as any;
  if (!r) return NextResponse.json({ error: '需求不存在' }, { status: 404 });
  if (r.merged_into == null) return NextResponse.json({ error: '此需求未处于合并状态' }, { status: 400 });

  // 清掉合并标记
  (await db.prepare('UPDATE requirements SET merged_into = NULL, merged_at = NULL, title = ? WHERE id = ?')
    .run(r.title.replace(/ \[重复-已合并到#\d+\]$/, ''), reqId));

  // 删对应的 duplicate_of 关系
  (await db.prepare(`DELETE FROM requirement_relations WHERE source_id = ? AND relation_type = 'duplicate_of'`).run(reqId));

  // status_log 恢复
  (await db.prepare(`INSERT INTO status_log (requirement_id, old_status, new_status, changed_by, note) VALUES (?, ?, ?, ?, ?)`)
    .run(reqId, 'closed', r.status, user.id, `误判回滚：解除与 #${r.merged_into} 的合并（数据未回滚）`));

  logAudit(user.id, user.username, 'split_requirement',
    `误判回滚 #${reqId}（曾合并到 #${r.merged_into}）`);

  return NextResponse.json({ success: true, requirement_id: reqId, note: '已解除合并，附件/评论等已迁移数据未回滚' });
}
