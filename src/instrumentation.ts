/**
 * Next.js 启动钩子
 * 文档：https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * P3 §3: 在 server 启动时启动 Webhook 投递常驻 worker
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureWorkerStarted } = await import('./lib/webhook-worker');
    ensureWorkerStarted();

    // 2026-08-31：SLA 预警扫描和工作流超时监控之前从未被任何调度器调起过
    // （代码/配置/UI 全在，就是没人调），在此接上。
    const { ensureSchedulerStarted } = await import('./lib/scheduler');
    ensureSchedulerStarted();
  }
}
