import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { dispatchWebhookEvent } from '@/lib/webhook-migrations';
import { getAsyncDb } from '@/lib/db';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const db = getAsyncDb();
  const sub = (await db.prepare(`SELECT * FROM webhook_subscriptions WHERE id=? AND owner_user_id=?`).get(parseInt(id), user.id)) as any;
  if (!sub) return NextResponse.json({ error: '订阅不存在' }, { status: 404 });
  // 用 sub 的第一个 events 作为测试事件
  const events = (sub.events || '').split(',');
  const eventType = events[0] || 'ping';
  const r = await dispatchWebhookEvent({ type: eventType, data: { test: true, from: 'manual_test' } });
  return NextResponse.json(r);
}
