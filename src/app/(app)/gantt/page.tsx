// 服务端组件：纯 CSS 甘特图，无第三方依赖
import { getCurrentUser, getUserRoleProjects, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 甘特图状态配色：绿色饱和度梯度承载「推进程度」
 *
 * 原本是 7 个随机色相的浅色 pastel（浅灰/浅黄/浅蓝/浅紫/浅绿/浅青/浅灰），
 * 两个问题：
 *   1. 深色主题下 7 块浅色贴在 #1C1C1C 背景上 = 一排刺眼亮斑
 *   2. 7 个色相只能区分「是哪个状态」，看不出「推进到哪了」——
 *      而甘特图最该一眼看出的是「哪些正在跑」
 *
 * 现在改成：灰(没动) → 暗绿(排上了) → 品牌绿实心(正在干，最醒目) → 深绿(收了) → 灰绿(归档)
 * 全部走 CSS 变量，深浅两套在 globals.css 里各自定义 —— 写死 hex 的话深色永远对不上。
 */
const STATUS_COLORS: Record<string, { bg: string; text: string; fg: string }> = {
  received_not_evaluated:  { bg: 'var(--status-idle-bg)',   text: 'var(--status-idle-ac)',   fg: 'var(--status-idle-fg)' },
  evaluated_not_scheduled: { bg: 'var(--status-queued-bg)', text: 'var(--status-queued-ac)', fg: 'var(--status-queued-fg)' },
  scheduled:               { bg: 'var(--status-sched-bg)',  text: 'var(--status-sched-ac)',  fg: 'var(--status-sched-fg)' },
  in_progress:             { bg: 'var(--status-active-bg)', text: 'var(--status-active-ac)', fg: 'var(--status-active-fg)' },
  completed:               { bg: 'var(--status-done-bg)',   text: 'var(--status-done-ac)',   fg: 'var(--status-done-fg)' },
  verified:                { bg: 'var(--status-done-bg)',   text: 'var(--status-done-ac)',   fg: 'var(--status-done-fg)' },
  closed:                  { bg: 'var(--status-closed-bg)', text: 'var(--status-closed-ac)', fg: 'var(--status-closed-fg)' },
};

const STATUS_FALLBACK = {
  bg: 'var(--status-idle-bg)', text: 'var(--status-idle-ac)', fg: 'var(--status-idle-fg)',
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

// 优先级保留红/橙/绿做强对比标记（跟状态梯度区分开，不然全绿分不出轻重缓急）
const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--prio-high)', medium: 'var(--prio-mid)', low: 'var(--prio-low)',
};

// ── 日期工具 ──
function parseDate(s: any): Date | null {
  if (!s) return null;
  const d = s instanceof Date ? new Date(s.getTime()) : new Date(String(s));
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0,0,0,0); return r; }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function startOfWeek(d: Date) { const r = new Date(d); const dow = r.getDay() || 7; r.setDate(r.getDate() - (dow - 1)); r.setHours(0,0,0,0); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtCn(d: Date) { return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; }

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

// ── 视图配置 ──
type ViewKey = 'day' | 'week' | 'month';
const VIEW_CFG: Record<ViewKey, {
  pxPerDay: number;
  label: string;
  unitName: string;
  primaryLabel: (d: Date) => string;
  secondaryLabel: (d: Date) => string | null;
  showWeekend: boolean;
}> = {
  // 按天：每天 28px，主刻度=月份，次刻度=日
  day: {
    pxPerDay: 28, label: '按天', unitName: '4 周',
    primaryLabel: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    secondaryLabel: d => String(d.getDate()),
    showWeekend: true,
  },
  // 按周：每天 12px（每周 84px），主刻度=月份，次刻度=周
  week: {
    pxPerDay: 12, label: '按周', unitName: '12 周',
    primaryLabel: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    secondaryLabel: d => { const w = getWeekOfYear(d); return w === 1 && d.getMonth() > 0 ? null : `W${w}`; },
    showWeekend: true,
  },
  // 按月：每天 5px（每月约 150px），主刻度=年份，次刻度=月份
  month: {
    pxPerDay: 5, label: '按月', unitName: '12 个月',
    primaryLabel: d => `${d.getFullYear()}`,
    secondaryLabel: d => `${d.getMonth() + 1}月`,
    showWeekend: false,
  },
};

/**
 * 时间窗口：**以当前时间为锚点**，不再跟着任务日期跑。
 *  - day   offset=0 → 含今天的 4 周（今天位于第 2 周，前后都有余量）
 *  - week  offset=0 → 含本周的 12 周（本周位于第 3 周）
 *  - month offset=0 → 含当前月的 12 个月（当前月位于第 3 个月）
 * offset 为翻页步进：-1 = 上一页，+1 = 下一页，0 = 回到今天。
 */
function windowFor(view: ViewKey, offset: number, today: Date): { start: Date; end: Date } {
  if (view === 'month') {
    const base = startOfMonth(today);
    const start = addMonths(base, offset * 12 - 2);
    const end = addDays(addMonths(start, 12), -1);
    return { start, end };
  }
  const span = view === 'day' ? 28 : 84;   // 天数
  const lead = view === 'day' ? 7 : 14;    // 今天之前预留
  const base = startOfWeek(today);
  const start = addDays(base, offset * span - lead);
  return { start, end: addDays(start, span - 1) };
}

export default async function GanttPage(props: any) {
  const sp = (await props.searchParams) || {};
  const currentView: ViewKey = sp.view === 'week' ? 'week' : sp.view === 'month' ? 'month' : 'day';
  const rawOffset = Number.parseInt(String(sp.offset ?? '0'), 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(-120, Math.min(120, rawOffset)) : 0;

  const cfg = VIEW_CFG[currentView];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 窗口只由「今天 + 视图 + 翻页」决定，与任务数据无关
  const { start: tlStart, end: tlEnd } = windowFor(currentView, offset, today);
  const totalDays = daysBetween(tlStart, tlEnd) + 1;

  let items: any[] = [];
  let isAdmin = false;
  let noPermission = false;
  let nearest: { min_s: string | null; max_e: string | null } | null = null;
  let queryFailed = false;

  try {
    const user = await getCurrentUser();
    let userProjectIds: number[] = [];
    if (user) {
      isAdmin = isGlobalAdmin(user.roles);
      if (!isAdmin) userProjectIds = getUserRoleProjects(user.id);
    }

    const db = getAsyncDb();
    const where: string[] = [
      'planned_start IS NOT NULL',
      'planned_end IS NOT NULL',
      'merged_into IS NULL',            // 排除已合并需求
      'planned_start <= ?',             // 与窗口有交集即可
      'planned_end >= ?',
    ];
    const args: any[] = [ymd(tlEnd), ymd(tlStart)];

    if (!isAdmin) {
      if (userProjectIds.length > 0) {
        where.push(`project_id IN (${userProjectIds.map(() => '?').join(',')})`);
        args.push(...userProjectIds);
      } else {
        where.push('1=0');
        noPermission = true;
      }
    }

    const sql = `SELECT id, title, status, planned_start, planned_end, priority
                 FROM requirements
                 WHERE ${where.join(' AND ')}
                 ORDER BY planned_start, planned_end
                 LIMIT 200`;
    items = (await db.prepare(sql).all(...args)) as any[];

    // 窗口内没数据时，找出最近的排期区间，给用户一个跳转提示
    if (items.length === 0 && !noPermission) {
      const nWhere = ['planned_start IS NOT NULL', 'planned_end IS NOT NULL', 'merged_into IS NULL'];
      const nArgs: any[] = [];
      if (!isAdmin && userProjectIds.length > 0) {
        nWhere.push(`project_id IN (${userProjectIds.map(() => '?').join(',')})`);
        nArgs.push(...userProjectIds);
      }
      nearest = (await db
        .prepare(`SELECT MIN(planned_start) AS min_s, MAX(planned_end) AS max_e FROM requirements WHERE ${nWhere.join(' AND ')}`)
        .get(...nArgs)) as any;
    }
  } catch (e) {
    queryFailed = true;
    console.error('Gantt query error:', e);
  }

  // ── 刻度 ──
  const primaryTicks: { label: string; offset: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(tlStart, i);
    const prev = i === 0 ? null : addDays(tlStart, i - 1);
    const isBoundary = currentView === 'month'
      ? (i === 0 || (d.getMonth() === 0 && prev != null && prev.getFullYear() !== d.getFullYear()))
      : (i === 0 || d.getDate() === 1);
    if (isBoundary) primaryTicks.push({ label: cfg.primaryLabel(d), offset: i });
  }

  const secondaryTicks: { label: string; offset: number; dim?: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(tlStart, i);
    let show = false; let dim = false;
    if (currentView === 'day') show = true;
    else if (currentView === 'week') show = d.getDay() === 1;
    else if (currentView === 'month') { show = d.getDate() === 1; dim = d.getMonth() % 3 !== 0; }
    if (show) {
      const lbl = cfg.secondaryLabel(d);
      if (lbl != null) secondaryTicks.push({ label: lbl, offset: i, dim });
    }
  }

  const todayOffset = daysBetween(tlStart, today);
  const todayInWindow = todayOffset >= 0 && todayOffset < totalDays;

  // 条形：裁剪到窗口内，越界侧加箭头标记
  const bar = (item: any) => {
    const s = parseDate(item.planned_start), e = parseDate(item.planned_end);
    if (!s || !e) return null;
    const rawL = daysBetween(tlStart, s);
    const rawR = daysBetween(tlStart, e);
    if (rawR < 0 || rawL > totalDays - 1) return null;         // 完全在窗口外
    const l = Math.max(0, rawL);
    const r = Math.min(totalDays - 1, rawR);
    return {
      style: { left: `${(l / totalDays) * 100}%`, width: `${((r - l + 1) / totalDays) * 100}%` },
      cutLeft: rawL < 0,
      cutRight: rawR > totalDays - 1,
    };
  };

  const hrefFor = (v: ViewKey, o: number) => `?view=${v}${o !== 0 ? `&offset=${o}` : ''}`;

  // 窗口区间文案
  const rangeText = currentView === 'month'
    ? `${tlStart.getFullYear()}年${tlStart.getMonth() + 1}月 ~ ${tlEnd.getFullYear()}年${tlEnd.getMonth() + 1}月`
    : `${fmtCn(tlStart)} ~ ${fmtCn(tlEnd)}`;

  const jumpOffset = (() => {
    if (!nearest?.min_s) return null;
    const target = parseDate(nearest.min_s);
    if (!target) return null;
    // 必须用 floor：round 会把目标日期甩到窗口起点之前，点了跳转还是空窗口
    if (currentView === 'month') {
      const base = startOfMonth(today);
      const diff = (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth());
      return Math.floor((diff + 2) / 12);
    }
    const span = currentView === 'day' ? 28 : 84;
    const lead = currentView === 'day' ? 7 : 14;
    return Math.floor((daysBetween(startOfWeek(today), target) + lead) / span);
  })();

  return (
    <div className="space-y-4">
      {/* 头部 + 视图切换（无论有无数据都渲染，避免切换按钮消失） */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">📅 甘特图</h1>
          <p className="page-subtitle">
            {rangeText}
            {todayInWindow ? ' · 含今天' : ''}
            {items.length > 0 ? ` · ${items.length} 个需求` : ''}
            {!isAdmin ? ' · 仅显示你有权限的项目' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 翻页 */}
          <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5">
            <a href={hrefFor(currentView, offset - 1)} title={`上一${cfg.unitName}`}
               className="px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">←</a>
            <a href={hrefFor(currentView, 0)}
               className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${offset === 0 ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>今天</a>
            <a href={hrefFor(currentView, offset + 1)} title={`下一${cfg.unitName}`}
               className="px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">→</a>
          </div>
          {/* 视图切换：切换时重置回今天 */}
          <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5">
            {(['day', 'week', 'month'] as const).map(view => {
              const active = currentView === view;
              return (
                <a key={view} href={hrefFor(view, 0)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  {VIEW_CFG[view].label}
                </a>
              );
            })}
          </div>
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
            const b = bar(item);
            if (!b) return null;
            const sc = STATUS_COLORS[item.status] || STATUS_FALLBACK;
            const pEnd = parseDate(item.planned_end);
            const isOverdue = !['completed', 'verified', 'closed'].includes(item.status)
                              && pEnd != null && pEnd < today;
            const pc = PRIORITY_COLORS[item.priority] || 'var(--prio-none)';
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
                            style={{ left: `${(i / totalDays) * 100}%`, ...(isWeekend ? { width: `${(1 / totalDays) * 100}%` } : {}) }} />
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
                  {todayInWindow && (
                    <span className="gantt-today" style={{ left: `${(todayOffset / totalDays) * 100}%` }} />
                  )}
                  {/* 进度条 */}
                  <div className="gantt-bar"
                       style={{ ...b.style, background: sc.bg, color: sc.fg, borderLeft: b.cutLeft ? 'none' : `3px solid ${sc.text}` }}
                       title={`#${item.id} ${item.title}\n${ymd(parseDate(item.planned_start)!)} ~ ${ymd(pEnd!)}\n${STATUS_LABELS[item.status] || item.status}`}>
                    {b.cutLeft && <span className="gantt-bar-text" style={{ flex: '0 0 auto', opacity: 0.6 }}>‹</span>}
                    <span className="gantt-bar-text">{item.title}</span>
                    {b.cutRight && <span className="gantt-bar-text" style={{ flex: '0 0 auto', opacity: 0.6 }}>›</span>}
                    <span className="gantt-bar-priority" style={{ background: pc }} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* 空窗口：保留刻度，只在下方提示 */}
          {items.length === 0 && (
            <div className="gantt-row">
              <div className="gantt-label"><span className="gantt-title" style={{ opacity: 0.5 }}>—</span></div>
              <div className="gantt-track">
                {todayInWindow && (
                  <span className="gantt-today" style={{ left: `${(todayOffset / totalDays) * 100}%` }} />
                )}
              </div>
            </div>
          )}
        </div>

        {items.length === 0 && (
          <div className="empty-state" style={{ paddingTop: '1.5rem' }}>
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-text">
              {queryFailed
                ? '查询失败，请稍后重试或联系管理员'
                : noPermission
                  ? '你还没有任何项目权限，无法查看排期'
                  : `当前时间范围（${rangeText}）内没有排期需求`}
            </div>
            {!queryFailed && !noPermission && nearest?.min_s && jumpOffset != null && (
              <div className="text-xs text-gray-500 mt-2">
                已有排期集中在 {ymd(parseDate(nearest.min_s)!)} ~ {ymd(parseDate(nearest.max_e)!)}
                {jumpOffset !== offset && (
                  <>
                    {' · '}
                    <a href={hrefFor(currentView, jumpOffset)} className="text-blue-600 hover:underline">跳到那段时间</a>
                  </>
                )}
              </div>
            )}
            {!queryFailed && !noPermission && !nearest?.min_s && (
              <div className="text-xs text-gray-500 mt-2">系统里还没有任何带计划开始/结束日期的需求</div>
            )}
          </div>
        )}

        {/* 图例：按推进顺序排列，让「灰 → 绿」的梯度本身可读。
            completed/verified 共用同一组绿色（都属于「收了」），所以图例合并成一条，
            否则会出现两个一模一样的色块让人以为是 bug。 */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 text-xs text-gray-500">
          {[
            'received_not_evaluated',
            'evaluated_not_scheduled',
            'scheduled',
            'in_progress',
            'completed',
            'closed',
          ].map(k => {
            const v = STATUS_COLORS[k];
            const label = k === 'completed' ? '已完成 / 已验证' : STATUS_LABELS[k];
            return (
              <span key={k} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ background: v.bg, borderLeft: `2px solid ${v.text}` }} />
                {label}
              </span>
            );
          })}
          <span className="flex items-center gap-1">
            <span className="w-0.5 h-3 inline-block" style={{ background: 'var(--destructive)' }} /> 今日
          </span>
          <span className="ml-auto">
            优先级
            <span className="inline-block w-2 h-2 rounded-full mx-0.5" style={{ background: 'var(--prio-high)' }} />高
            <span className="inline-block w-2 h-2 rounded-full mx-0.5" style={{ background: 'var(--prio-mid)' }} />中
            <span className="inline-block w-2 h-2 rounded-full mx-0.5" style={{ background: 'var(--prio-low)' }} />低
          </span>
        </div>
      </div>
    </div>
  );
}
