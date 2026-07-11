import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureWebhookTables, dispatchWebhookEvent } from '@/lib/webhook-migrations';
import { getAsyncDb } from '@/lib/db';
import crypto from 'crypto';

function genSecret(): string {
  return 'whsec_' + crypto.randomBytes(20).toString('hex');
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWebhookTables();
  const db = getAsyncDb();
  const subs = (await db.prepare(`SELECT id, name, target_url, events, enabled, filter_project_id, filter_priority, last_triggered_at, last_status_code, consecutive_failures, created_at FROM webhook_subscriptions WHERE owner_user_id=? ORDER BY id DESC`).all(user.id)) as any[];
  return NextResponse.json({ subscriptions: subs });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWebhookTables();
  const body = await req.json();
  if (!body.name || !body.target_url || !body.events?.length) return NextResponse.json({ error: 'name/target_url/events 必填' }, { status: 400 });
  const secret = genSecret();
  const db = getAsyncDb();
  const r = (await db.prepare(`
    INSERT INTO webhook_subscriptions(owner_user_id, name, target_url, secret, events, enabled, filter_project_id, filter_priority)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(user.id, body.name, body.target_url, secret, body.events.join(','), body.filter_project_id || null, body.filter_priority || null));
  return NextResponse.json({ id: r.lastInsertRowid, secret, message: '请妥善保存 secret，仅显示一次' });
}
