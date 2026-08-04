// 服务端组件：纯 CSS 甘特图，无第三方依赖
import { getCurrentUser, getUserRoleProjects, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received_not_evaluated: { bg: '#F3F4F6', text: '#6B7280' },
  evaluated_not_scheduled: { bg: '#FEF3C7', text: '#B45309' },
  scheduled:            { bg: '#DBEAFE', text: '#1D4ED8' },
  in_progress:          { bg: '#EDE9FE', text: '#6D28D9' },
  completed:            { bg: '#D1FAE5', text: '#065F46' },
  verified:             { bg: '#CFFAFE', text: '#0E7490' },
  closed:               { bg: '#E5E7EB', text: '#374151' },
};

const STATUS_LABELS: Record<string, string> = {
  received_not_evaluated: '仅接收未评估',
  evaluated_not_scheduled: '已评估未排期',
  scheduled: '已排期',
  in_progress: '处理中',
  completed: '已完成',
  verified: '已验证',
  closed: '已关闭',
};

const PRIORITY_COLORS: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

// ── 视图配置 ──
type ViewKey = 'day' | 'week' | 'month';
const VIEW_CFG: Record<ViewKey, { pxPerDay: number; primaryLabel: (d: Date) => string; secondaryLabel: (d: Date) => string | null; alignStart: (d: Date) => Date; showWeekend: boolean }> = {
  // 按天：每天 28px，主刻度=月份，次刻度=日
  day:   { pxPerDay: 28, primaryLabel: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, secondaryLabel: d => String(d.getDate()),     alignStart: d => { const r = new Date(d); const day = r.getDay() || 7; r.setDate(r.getDate() - (day - 1)); r.setHours(0,0,0,0); return r; }, showWeekend: true },
  // 按周：每天 12px（每周 84px），主刻度=月份，次刻度=周
  week:  { pxPerDay: 12, primaryLabel: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, secondaryLabel: d => { const w = getWeekOfYear(d); return w === 1 && d.getMonth() > 0 ? null : `W${w}`; }, alignStart: d => { const r = new Date(d); const day = r.getDay() || 7; r.setDate(r.getDate() - (day - 1)); r.setHours(0,0,0,0); return r; }, showWeekend: true },
  // 按月：每天 5px（每月约 150px），主刻度=年份，次刻度=月份
  month: { pxPerDay: 5,  primaryLabel: d => `${d.getFullYear()}`,                                              secondaryLabel: d => `${d.getMonth() + 1}月`,  alignStart: d => { const r = new Date(d.getFullYear(), d.getMonth(), 1); return r; }, showWeekend: false },
};
function getWeekOfYear(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

export default async function GanttPage(props: any) {
  const params = (await props.searchParams) || {};
  const currentView = params.view === 'week' ? 'week' : params.view === 'month' ? 'month' : 'day';

  let items: any[] = [];
  let userProjectIds: number[] = [];
  let isAdmin = false;
  try {
    const user = await getCurrentUser();
    if (user) {
      isAdmin = isGlobalAdmin(user.roles);
      if (!isAdmin) {
        userProjectIds = getUserRoleProjects(user.id);
      }
    }
    const db = getAsyncDb();
    const where: string[] = ['planned_start IS NOT NULL', 'planned_end IS NOT NULL'];
    const params: any[] = [];
    if (!isAdmin) {
      if (userProjectIds.length > 0) {
        where.push(`project_id IN (${userProjectIds.map(() => '?').join(',')})`);
        params.push(...userProjectIds);
      } else {
        where.push('1=0');
      }
    }
    const sql = `SELECT id, title, status, planned_start, planned_end, priority
                 FROM requirements
                 WHERE ${where.join(' AND ')}
                 ORDER BY planned_start
                 LIMIT 30`;
    items = (await db.prepare(sql).all(...params)) as any[];
  } catch (e) { console.error('Gantt query error:', e); }

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">📅 甘特图</h1>
          <p className="page-subtitle">需求排期可视化</p>
        </div>
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-text">暂无排期数据（需求需要有计划开始/结束日期）</div>
          </div>
        </div>
      </div>
    );
  }

  // ── 时间窗口（按视图对齐到合适的边界） ──
  const cfg = VIEW_CFG[currentView];
  const starts = items.map(i => parseDate(i.planned_start)).filter(Boolean) as Date[];
  const ends   = items.map(i => parseDate(i.planned_end)).filter(Boolean) as Date[];
  const rawStart = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : new Date();
  const rawEnd   = ends.length ? new Date(Math.max(...ends.map(d => d.getTime()))) : new Date();
  // tlStart 在 alignStart（周初/月初）之前再推 3 天，留 padding
  const tlStart = addDays(cfg.alignStart(rawStart), -3);
  // tlEnd 在 alignStart 之后再推 3/31 天
  const tlEnd   = addDays(cfg.alignStart(rawEnd),   currentView === 'month' ? 31 : 3);
  // 对齐到日
  tlStart.setHours(0,0,0,0); tlEnd.setHours(0,0,0,0);
  const totalDays = daysBetween(tlStart, tlEnd) + 1;

  // ── 刻度生成：主刻度（按月/按年）+ 次刻度（按日/按周/按月） ──
  // 主刻度：每个月份/年份开始一天
  const primaryTicks: { label: string; offset: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(tlStart, i);
    const prev = i === 0 ? null : addDays(tlStart, i - 1);
    const isBoundary = currentView === 'month'
      ? d.getMonth() === 0 && (prev == null || prev.getFullYear() !== d.getFullYear())
      : d.getDate() === 1;
    if (isBoundary) {
      primaryTicks.push({ label: cfg.primaryLabel(d), offset: i });
    }
  }
  // 次刻度：日=每天、周=每周一、月=每月1号
  const secondaryTicks: { label: string; offset: number; dim?: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(tlStart, i);
    let show = false; let dim = false;
    if (currentView === 'day') { show = true; }
    else if (currentView === 'week') { show = d.getDay() === 1; }
    else if (currentView === 'month') { show = d.getDate() === 1; dim = d.getMonth() % 3 !== 0; }
    if (show) {
      const lbl = cfg.secondaryLabel(d);
      if (lbl != null) secondaryTicks.push({ label: lbl, offset: i, dim });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = daysBetween(tlStart, today);

  const bar = (item: any) => {
    const s = parseDate(item.planned_start), e = parseDate(item.planned_end);
    if (!s || !e) return {};
    const left = daysBetween(tlStart, s);
    const width = daysBetween(s, e) + 1;
    return { left: `${(left / totalDays) * 100}%`, width: `${(width / totalDays) * 100}%` };
  };

  return (
    <div className="space-y-4">
      {/* 头部 + 视图切换 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">📅 甘特图</h1>
          <p className="page-subtitle">需求排期可视化 · {items.length} 个需求{!isAdmin ? ' · 仅显示你有权限的项目' : ''}</p>
        </div>
        <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5">
          {(['day', 'week', 'month'] as const).map(view => {
            const active = currentView === view;
            return (
              <a key={view} href={`?view=${view}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {view === 'day' ? '按天' : view === 'week' ? '按周' : '按月'}
              </a>
            );
          })}
        </div>
      </div>

      {/* 甘特图主体 */}
      <div className="card overflow-x-auto">
        <div className="gantt" style={{ minWidth: totalDays * cfg.pxPerDay + 200 }}>
          {/* 主刻度（年/月） */}
          <div className="gantt-ruler gantt-ruler--primary">
            <div className="gantt-ruler-label" />
            <div className="gantt-ruler-ticks">
              {primaryTicks.map((t, i) => {
                const next = primaryTicks[i + 1];
                const span = next ? (next.offset - t.offset) : (totalDays - t.offset);
                return (
                  <span key={`p${i}`} className="gantt-primary"
                        style={{ left: `${(t.offset / totalDays) * 100}%`, width: `${(span / totalDays) * 100}%` }}>
                    {t.label}
                  </span>
                );
              })}
            </div>
          </div>
          {/* 次刻度（日/周/月） */}
          <div className="gantt-ruler gantt-ruler--secondary">
            <div className="gantt-ruler-label" />
            <div className="gantt-ruler-ticks">
              {secondaryTicks.map((t, i) => (
                <span key={`s${i}`} className={`gantt-tick${t.dim ? ' gantt-tick--dim' : ''}`}
                      style={{ left: `${(t.offset / totalDays) * 100}%` }}>
                  <span className="gantt-tick-line" />
                  <span className="gantt-tick-text">{t.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* 行 */}
          {items.map(item => {
            const s = bar(item);
            const sc = STATUS_COLORS[item.status] || { bg: '#F3F4F6', text: '#6B7280' };
            const isOverdue = !['completed', 'verified', 'closed'].includes(item.status)
                              && parseDate(item.planned_end)! < today;
            const pc = PRIORITY_COLORS[item.priority] || '#9CA3AF';
            return (
              <div key={item.id} className={`gantt-row ${isOverdue ? 'gantt-row--overdue' : ''}`}>
                <div className="gantt-label">
                  <span className="gantt-title">{item.title}</span>
                  <span className="gantt-status-dot" style={{ background: sc.text }} />
                </div>
                <div className="gantt-track">
                  {/* 周分隔 / 周末（仅日/周视图） */}
                  {cfg.showWeekend && Array.from({ length: totalDays }).map((_, i) => {
                    const d = addDays(tlStart, i);
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isWeekStart = dow === 1;
                    if (!isWeekStart && !isWeekend) return null;
                    return (
                      <span key={i} className={`gantt-weekline ${isWeekend ? 'gantt-weekend' : ''}`}
                            style={{ left: `${(i / totalDays) * 100}%` }} />
                    );
                  })}
                  {/* 网格线（月视图：每月1号竖线） */}
                  {!cfg.showWeekend && Array.from({ length: totalDays }).map((_, i) => {
                    const d = addDays(tlStart, i);
                    if (d.getDate() !== 1) return null;
                    return (
                      <span key={`m${i}`} className="gantt-weekline"
                            style={{ left: `${(i / totalDays) * 100}%` }} />
                    );
                  })}
                  {/* 今日线 */}
                  {todayOffset >= 0 && todayOffset <= totalDays && (
                    <span className="gantt-today" style={{ left: `${(todayOffset / totalDays) * 100}%` }} />
                  )}
                  {/* 进度条 */}
                  <div className="gantt-bar"
                       style={{ left: s.left, width: s.width, background: sc.bg, borderLeft: `3px solid ${sc.text}` }}
                       title={`#${item.id} ${item.title}\n${item.planned_start} ~ ${item.planned_end}\n${STATUS_LABELS[item.status]}`}>
                    <span className="gantt-bar-text">{item.title}</span>
                    <span className="gantt-bar-priority" style={{ background: pc }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 text-xs text-gray-500">
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ background: v.bg, borderLeft: `2px solid ${v.text}` }} />
              {STATUS_LABELS[k]}
            </span>
          ))}
          <span className="flex items-center gap-1 text-gray-400">
            <span className="w-0.5 h-3 bg-red-400 inline-block" /> 今日
          </span>
          <span className="text-gray-400 ml-auto">
            优先级 <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-0.5" />高 <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mx-0.5" />中 <span className="inline-block w-2 h-2 rounded-full bg-gray-500 mx-0.5" />低
          </span>
        </div>
      </div>
    </div>
  );
}
