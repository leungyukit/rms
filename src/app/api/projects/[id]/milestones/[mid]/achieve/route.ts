import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';
import { computeHealth, persistHealth } from '@/lib/health';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id, mid } = await params;
  const body = await req.json().catch(() => ({}));
  const actualDate: string = body.actual_date || new Date().toISOString().substring(0, 10);

  const db = getAsyncDb();
  const m = (await db.prepare(`SELECT * FROM project_milestones WHERE id=? AND project_id=?`).get(mid, id)) as any;
  if (!m) return NextResponse.json({ error: '里程碑不存在' }, { status: 404 });
  if (m.status === 'achieved') return NextResponse.json({ error: '里程碑已达成' }, { status: 400 });

  // 判断是 on-time 还是 missed
  const status = actualDate <= m.planned_date ? 'achieved' : 'achieved'; // v1: 都算 achieved
  // 如果超过计划日期 14 天以上，标记 missed（说明严重延期）
  const days = (new Date(actualDate).getTime() - new Date(m.planned_date).getTime()) / (1000 * 60 * 60 * 24);
  const finalStatus = days > 14 ? 'achieved' : 'achieved'; // 简化：达成即 achieved
  // 注：missed 状态只有"过期后无人达成"才会自动判定（由定时任务或 read 时计算）

  (await db.prepare(`UPDATE project_milestones SET status=?, actual_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run('achieved', actualDate, mid));

  // 重算健康度
  const h = computeHealth(parseInt(id));
  persistHealth(parseInt(id), h);

  return NextResponse.json({ success: true, status: 'achieved', health: h });
}
