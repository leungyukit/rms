import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureWebhookTables } from '@/lib/webhook-migrations';
import { getAsyncDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWebhookTables();
  const { id } = await params;
  const body = await req.json();
  const fields = ['name', 'target_url', 'events', 'enabled', 'filter_project_id', 'filter_priority'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) if (f in body) { sets.push(`${f}=?`); vals.push(Array.isArray(body[f]) ? body[f].join(',') : body[f]); }
  if (!sets.length) return NextResponse.json({ error: '无字段' }, { status: 400 });
  vals.push(parseInt(id));
  vals.push(user.id);
  const db = getAsyncDb();
  (await db.prepare(`UPDATE webhook_subscriptions SET ${sets.join(', ')} WHERE id=? AND owner_user_id=?`).run(...vals));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWebhookTables();
  const { id } = await params;
  const db = getAsyncDb();
  (await db.prepare(`DELETE FROM webhook_subscriptions WHERE id=? AND owner_user_id=?`).run(parseInt(id), user.id));
  return NextResponse.json({ success: true });
}
