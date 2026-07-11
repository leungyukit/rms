import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureIntegrationTables } from '@/lib/integration-migrations';
import { getAsyncDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureIntegrationTables();
  const { id } = await params;
  const body = await req.json();
  const fields = ['name', 'webhook_url', 'secret', 'verification_token', 'encrypt_key', 'project_id', 'enabled', 'notify_on_create', 'notify_on_status_change', 'notify_on_high_priority'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) if (f in body) { sets.push(`${f}=?`); vals.push(body[f]); }
  if (!sets.length) return NextResponse.json({ error: '无字段' }, { status: 400 });
  vals.push(parseInt(id));
  const db = getAsyncDb();
  (await db.prepare(`UPDATE integration_configs SET ${sets.join(', ')} WHERE id=?`).run(...vals));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureIntegrationTables();
  const { id } = await params;
  const db = getAsyncDb();
  (await db.prepare(`DELETE FROM integration_configs WHERE id=?`).run(parseInt(id)));
  return NextResponse.json({ success: true });
}
