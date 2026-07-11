/**
 * Webhook Worker 管理 API
 * P3 §3：查看状态、暂停/恢复、手动触发轮询
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureWorkerStarted, stopWorker, triggerPollNow, getWorkerStatus } from '@/lib/webhook-worker';

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !me.roles?.includes('global_admin')) return NextResponse.json({ error: '需要全局管理员权限' }, { status: 403 });
  return NextResponse.json({ ok: true, status: getWorkerStatus() });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !me.roles?.includes('global_admin')) return NextResponse.json({ error: '需要全局管理员权限' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action === 'start') {
    ensureWorkerStarted();
    return NextResponse.json({ ok: true, status: getWorkerStatus(), action });
  }
  if (action === 'stop') {
    stopWorker();
    return NextResponse.json({ ok: true, status: getWorkerStatus(), action });
  }
  if (action === 'trigger') {
    const r = await triggerPollNow();
    return NextResponse.json({ ok: true, triggered: r, status: getWorkerStatus() });
  }
  return NextResponse.json({ error: 'action must be start|stop|trigger' }, { status: 400 });
}
