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
  // status_log 统一用 old_status/new_status。
  // 修复（2026-08-03）：原代码在 MySQL 分支写 from_status/to_status，但两边 schema
  // （docker/rms-init.sql:1303 与 data/rms.db）都只有 old_status/new_status，也无任何迁移
  // 会添加 from/to 列 —— 导致生产（DB_TYPE=mysql）每次改状态都撞 ER_BAD_FIELD_ERROR，
  // 状态变更历史全部丢失（时间线/停滞检测/燃尽图失去数据源）。
  (await db.prepare(`INSERT INTO status_log(requirement_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(id, cur.status, newStatus, user.id));

  // 触发 AI 知识
  const jobId = triggerAiKnowledgeJob(parseInt(id), cur.status, newStatus, user.id);

  return NextResponse.json({ success: true, status: newStatus, ai_job_id: jobId });
}
