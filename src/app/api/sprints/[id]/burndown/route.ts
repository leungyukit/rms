import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureSprintTables } from '@/lib/sprint-migrations';

// 燃尽图：按日采样 actual_remaining（status NOT IN done）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureSprintTables();

  const { id } = await params;
  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();
  const sprint = (await db.prepare(`SELECT * FROM sprints WHERE id=?`).get(id)) as any;
  if (!sprint) return NextResponse.json({ error: 'Sprint 不存在' }, { status: 404 });

  // 1. 列出所有未完成需求在 Sprint 期间的状态变化
  // 简化：把"加入 sprint"前的状态算"未开始"，完成则归 0；用 status_log 倒推每天剩余
  // 为简化，假设需求加入时全部未完成，按天计算仍 not done 的数量
  const reqs = (await db.prepare(`
    SELECT r.id, r.planned_end, r.actual_end,
      r.status,
      rs.assigned_at
    FROM requirement_sprints rs
    JOIN requirements r ON r.id = rs.requirement_id
    WHERE rs.sprint_id=? AND r.merged_into IS NULL
  `).all(id)) as any[];

  const start = new Date(sprint.start_date);
  const end = new Date(sprint.end_date);
  const today = new Date();
  // 如果 Sprint 还未开始，到今天为止都是 full；已开始则取 max(今天, 结束)
  const lastDate = today < start ? start : (today < end ? today : end);

  const days: { date: string; ideal: number; actual: number }[] = [];
  const total = reqs.length;

  for (let d = new Date(start); d <= lastDate; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().substring(0, 10);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const passedDays = Math.ceil((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const ideal = total - (total * (passedDays - 1) / totalDays);

    // actual: 这一天还"未完成"的需求数
    // 用 status + actual_end/未达成的 planned_end 推算
    let actual = 0;
    for (const r of reqs) {
      const doneSet = ['completed', 'verified', 'closed'].includes(r.status);
      if (doneSet) {
        // 已完成：看完成时间是否在这天之前
        if (r.actual_end && r.actual_end <= dayStr) continue;
        // 没 actual_end 但状态 done → 视为 Sprint 期间任意一天可完成
        // 简化：算到 assigned_at + (总跨度/2) 这天
        const assigned = new Date(r.assigned_at || sprint.start_date);
        const assumeDone = new Date(assigned.getTime() + (end.getTime() - assigned.getTime()) / 2);
        if (assumeDone.toISOString().substring(0, 10) <= dayStr) continue;
        actual++;
      } else {
        // 未完成：这一天还欠着
        actual++;
      }
    }
    days.push({ date: dayStr, ideal: Math.max(0, Math.round(ideal * 10) / 10), actual });
  }

  return NextResponse.json({
    sprint_id: parseInt(id),
    start_date: sprint.start_date,
    end_date: sprint.end_date,
    total_requirements: total,
    days,
  });
}
