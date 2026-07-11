/**
 * 团队容量 vs 已排期 SP
 * GET /api/workload/capacity?week=YYYY-Www
 *
 * 业务：
 * - 顶层需求（parent_id IS NULL）按 planned_start 周聚合 SP 之和
 * - 4 周视图：本周 + 后 3 周
 * - 当周 SP 之和 > team_velocity_sp 标红
 *
 * 设计依据：rms-docs/RMS-优化方案-阶段1-P0.md § 5.3
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureEstimationFields, getEstimationConfig } from '@/lib/estimation-migrations';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureEstimationFields();
  const cfg = getEstimationConfig();
  const db = getAsyncDb();
  const url = req.nextUrl;
  const weeks = Math.min(8, Math.max(1, parseInt(url.searchParams.get('weeks') || '4', 10)));

  // 计算 4 个周区间（基于周一）
  const now = new Date();
  const mondayThis = startOfWeek(now);
  const intervals: Array<{ week: string; start: string; end: string }> = [];
  for (let i = 0; i < weeks; i++) {
    const s = new Date(mondayThis);
    s.setDate(s.getDate() + i * 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    intervals.push({
      week: isoWeekLabel(s),
      start: ymd(s),
      end: ymd(e),
    });
  }

  // 一次性查所有未完成顶层需求的 SP 和 planned_start
  // MySQL/SQLite 兼容：日期字符串比较 YYYY-MM-DD 字典序即可
  // 状态过滤：只计 3 个 active 态（scheduled/in_progress/evaluated_not_scheduled）
  const rows = (await db.prepare(`
    SELECT id, title, story_points, planned_start, planned_end, status, priority,
      handler_id, receiver_id
    FROM requirements
    WHERE parent_id IS NULL
      AND planned_start IS NOT NULL
      AND status IN ('scheduled', 'in_progress', 'evaluated_not_scheduled')
  `).all()) as any[];

  // 聚合到周
  const itemsByWeek: Record<string, any[]> = {};
  for (const iv of intervals) itemsByWeek[iv.week] = [];
  const spByWeek: Record<string, number> = {};
  const countByWeek: Record<string, number> = {};
  for (const iv of intervals) {
    spByWeek[iv.week] = 0;
    countByWeek[iv.week] = 0;
  }
  // 未排期（无 planned_start 或 planned_start 超出范围）
  let unscheduledSp = 0;
  let unscheduledCount = 0;
  const unscheduledItems: any[] = [];

  for (const r of rows) {
    if (!r.planned_start) {
      // 已在 SQL 过滤掉，但保留分支以防漏
      if (r.story_points) {
        unscheduledSp += r.story_points;
        unscheduledCount++;
        unscheduledItems.push(r);
      }
      continue;
    }
    const placed = r.planned_start instanceof Date
      ? r.planned_start.toISOString().slice(0, 10)
      : String(r.planned_start).slice(0, 10); // YYYY-MM-DD
    let matched = false;
    for (const iv of intervals) {
      if (placed >= iv.start && placed < iv.end) {
        spByWeek[iv.week] += r.story_points || 0;
        countByWeek[iv.week]++;
        itemsByWeek[iv.week].push({
          requirement_id: r.id,
          title: r.title,
          sp: r.story_points || 0,
          handler_id: r.handler_id,
          priority: r.priority,
          status: r.status,
        });
        matched = true;
        break;
      }
    }
    if (!matched && r.story_points) {
      // 超出周范围但有 SP 计入"未排期"提示
      unscheduledSp += r.story_points;
      unscheduledCount++;
      unscheduledItems.push(r);
    }
  }

  const result = {
    capacity_sp: cfg.teamVelocitySp,
    sp_allow_values: cfg.spAllowValues,
    hours_per_day: cfg.hoursPerDay,
    weeks: intervals.map((iv) => ({
      week: iv.week,
      start: iv.start,
      end: iv.end,
      capacity_sp: cfg.teamVelocitySp,
      scheduled_sp: spByWeek[iv.week],
      scheduled_count: countByWeek[iv.week],
      overload: spByWeek[iv.week] > cfg.teamVelocitySp,
      load_pct: cfg.teamVelocitySp > 0 ? Math.round((spByWeek[iv.week] / cfg.teamVelocitySp) * 100) : 0,
      items: itemsByWeek[iv.week],
    })),
    unscheduled: {
      total_sp: unscheduledSp,
      count: unscheduledCount,
      items: unscheduledItems,
    },
  };

  return NextResponse.json(result);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = (day === 0 ? -6 : 1 - day);
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoWeekLabel(d: Date): string {
  // 简化版：YYYY-Www（不算 ISO 严格周，按 1/1 起算）
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const diffDays = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const w = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(w).padStart(2, '0')}`;
}
