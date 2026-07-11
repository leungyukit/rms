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
  }
}
