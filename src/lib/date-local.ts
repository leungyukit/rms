/**
 * 本地日期工具（2026-08-31 新增）
 *
 * 背景：项目里多处用 `new Date().toISOString().slice(0,10)` 取「今天」。
 * 这是个真 bug —— toISOString() 先把本地时间转成 UTC 再截断。
 * 本项目时区 Asia/Shanghai (GMT+8)，CST 00:00-08:00 期间 UTC 还在前一天，
 * 于是「今天」会算成昨天。
 *
 * 已知踩坑现场：
 *   - timesheet 周报：查询窗口整体左移一天，周日工时永远查不出来
 *   - calendar 日历：凌晨打开时网格左移一天
 *   - checklist 到期判定：凌晨把「今天到期」误判成「未来」
 *   - worklog 工时录入：凌晨记工时默认日期是昨天，**直接写错数据入库**
 *
 * 一律改用本地时间格式化。
 */

/** 把 Date 格式化成本地时区的 YYYY-MM-DD */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 本地时区的今天，YYYY-MM-DD */
export function todayLocal(): string {
  return ymdLocal(new Date());
}

/** 按本地日期算相差天数（a - b），避免时区导致的 off-by-one */
export function diffDaysLocal(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}
