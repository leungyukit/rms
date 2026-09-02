/**
 * 后台调度器（2026-08-31 新增）
 *
 * 存在理由：审计发现 SLA 预警扫描器（sla-scanner.ts）和工作流超时监控
 * （workflow-monitor.ts）**从未运行过**。
 *
 * 代码写好了、配置项 `sla_scan_cron = '0 9 * * *'` 也躺在库里、UI 上还写着
 * 「每天上午 9 点扫描」，但全库 grep 没有任何 setInterval / cron / systemd timer
 * 调用它们（crontab 和 systemctl list-timers 都实测确认过）。
 * sla_warnings 表里那 72 行数据全是管理员手动点 admin API 攒出来的。
 *
 * 后果：需求超期没人知道，工作流卡住也没人知道 —— 功能事实上是死的，
 * 而且因为页面显示正常，属于最难发现的那类静默故障。
 *
 * 这里照 webhook-worker 的既有范式接上调度。
 */
import { getSlaConfig } from './sla-migrations';

const CHECK_INTERVAL_MS = 60_000; // 每分钟检查一次是否到点

let handle: NodeJS.Timeout | null = null;
let started = false;

// 记录当天是否已跑过，避免同一天重复扫描
let lastSlaScanDate = '';
// 工作流监控的上次执行时间戳
let lastWorkflowRun = 0;
const WORKFLOW_INTERVAL_MS = 5 * 60_000; // 每 5 分钟
// 通知推送的上次执行时间戳
let lastNotificationPush = 0;
const NOTIFICATION_PUSH_INTERVAL_MS = 2 * 60_000; // 每 2 分钟

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 解析 cron 表达式里的「小时 分钟」。
 * 只支持 `M H * * *` 这种固定时刻的写法（配置项默认 '0 9 * * *'），
 * 复杂表达式不硬扛 —— 解析不出来就退回默认 9:00，并留一条日志。
 */
function parseDailyCron(expr: string): { hour: number; minute: number } {
  const fallback = { hour: 9, minute: 0 };
  if (!expr || typeof expr !== 'string') return fallback;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 2) return fallback;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return fallback;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return fallback;
  // 只认「每天固定时刻」；带 */ , - 的复杂表达式退回默认
  if (/[*\/,-]/.test(parts[0]) || /[*\/,-]/.test(parts[1])) return fallback;
  return { hour, minute };
}

async function tickSlaScan(now: Date): Promise<void> {
  let hour = 9;
  let minute = 0;
  try {
    const parsed = parseDailyCron(String(getSlaConfig().scanCron ?? '0 9 * * *'));
    hour = parsed.hour;
    minute = parsed.minute;
  } catch {
    // 配置读不到就用默认 9:00
  }

  const today = localYmd(now);
  if (lastSlaScanDate === today) return;
  // 到点才跑（给 5 分钟窗口，避免刚好错过这一分钟）
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const targetMins = hour * 60 + minute;
  if (nowMins < targetMins || nowMins > targetMins + 5) return;

  lastSlaScanDate = today;
  const { persistScan } = await import('./sla-scanner');
  const r = await persistScan(false);
  // eslint-disable-next-line no-console
  console.log(`[scheduler] SLA 扫描完成: 命中=${r.scanned} 新建=${r.created} 去重跳过=${r.skipped_dedup} 通知=${r.notifications}`);
}

async function tickWorkflowMonitor(now: Date): Promise<void> {
  if (now.getTime() - lastWorkflowRun < WORKFLOW_INTERVAL_MS) return;
  lastWorkflowRun = now.getTime();
  const { runWorkflowMonitor } = await import('./workflow-monitor');
  const r = runWorkflowMonitor();
  if (r.overdue.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[scheduler] 工作流监控: 扫描=${r.scanned} 超时节点=${r.overdue.length} 已通知=${r.notified}`);
  }
  if (r.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] 工作流监控部分失败:', r.errors.slice(0, 5).join('; '));
  }
}

async function tickNotificationPush(now: Date): Promise<void> {
  if (now.getTime() - lastNotificationPush < NOTIFICATION_PUSH_INTERVAL_MS) return;
  lastNotificationPush = now.getTime();
  const { pushUnreadNotifications } = await import('./notification-push');
  const r = await pushUnreadNotifications();
  if (r.pushed > 0 || r.failed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[scheduler] 通知推送: 成功=${r.pushed} 失败=${r.failed} 跳过=${r.skipped}`);
  }
}

export function ensureSchedulerStarted(): void {
  if (handle || started) return;
  started = true;

  handle = setInterval(() => {
    const now = new Date();
    // 两个任务互相隔离：一个炸了不能拖死另一个，也不能让 worker 整体死掉
    void tickSlaScan(now).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] SLA 扫描失败:', e?.message || e);
    });
    void tickWorkflowMonitor(now).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] 工作流监控失败:', e?.message || e);
    });
    void tickNotificationPush(now).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] 通知推送失败:', e?.message || e);
    });
  }, CHECK_INTERVAL_MS);

  // 别让定时器拖着进程不退出
  if (typeof handle.unref === 'function') handle.unref();

  // eslint-disable-next-line no-console
  console.log(`[scheduler] started, check interval ${CHECK_INTERVAL_MS}ms (SLA 每日定时 / 工作流每 ${WORKFLOW_INTERVAL_MS / 60000} 分钟 / 通知推送每 ${NOTIFICATION_PUSH_INTERVAL_MS / 60000} 分钟)`);
}

export function stopScheduler(): void {
  if (handle) clearInterval(handle);
  handle = null;
  started = false;
}
