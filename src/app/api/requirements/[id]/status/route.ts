import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';
import { triggerAiKnowledgeJob } from '@/lib/ai-knowledge-migrations';
import { startAiKnowledgeWorker } from '@/lib/ai-knowledge-worker';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  startAiKnowledgeWorker();

  const { id } = await params;
  const body = await req.json();
  const newStatus = body.status;
  if (!newStatus) return NextResponse.json({ error: 'status 必填' }, { status: 400 });

  const db = getAsyncDb();
  const cur = (await db.prepare(`SELECT status FROM requirements WHERE id=?`).get(id)) as any;
  if (!cur) return NextResponse.json({ error: '需求不存在' }, { status: 404 });

  // 简化：直接 update（真实生产应走专门的状态变更逻辑）
  (await db.prepare(`UPDATE requirements SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(newStatus, id));
  // status_log 在 SQLite 用 old_status/new_status，MySQL 用 from_status/to_status
  const isMysql = !!process.env.MYSQL_HOST;
  if (isMysql) {
    (await db.prepare(`INSERT INTO status_log(requirement_id, from_status, to_status, changed_by, changed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(id, cur.status, newStatus, user.id));
  } else {
    (await db.prepare(`INSERT INTO status_log(requirement_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(id, cur.status, newStatus, user.id));
  }

  // 触发 AI 知识
  const jobId = triggerAiKnowledgeJob(parseInt(id), cur.status, newStatus, user.id);

  return NextResponse.json({ success: true, status: newStatus, ai_job_id: jobId });
}
