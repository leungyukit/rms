import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureIntegrationTables } from '@/lib/integration-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureIntegrationTables();
  const db = getAsyncDb();
  const rows = (await db.prepare(`SELECT id, channel, name, webhook_url, enabled, project_id, notify_on_create, notify_on_status_change, notify_on_high_priority, created_at FROM integration_configs ORDER BY id DESC`).all()) as any[];
  // 掩码 webhook_url
  const masked = rows.map(r => ({ ...r, webhook_url_masked: r.webhook_url ? `${r.webhook_url.substring(0, 30)}...***` : '' }));
  return NextResponse.json({ configs: masked });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureIntegrationTables();
  const body = await req.json();
  const { channel, name, webhook_url, secret, verification_token, encrypt_key, project_id, notify_on_create, notify_on_status_change, notify_on_high_priority } = body;
  if (!['feishu', 'wecom', 'dingtalk'].includes(channel)) return NextResponse.json({ error: 'channel 必为 feishu/wecom/dingtalk' }, { status: 400 });
  if (!name || !webhook_url) return NextResponse.json({ error: 'name/webhook_url 必填' }, { status: 400 });
  const db = getAsyncDb();
  const r = (await db.prepare(`
    INSERT INTO integration_configs(channel, name, webhook_url, secret, verification_token, encrypt_key, project_id, notify_on_create, notify_on_status_change, notify_on_high_priority, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(channel, name, webhook_url, secret || null, verification_token || null, encrypt_key || null, project_id || null, notify_on_create ?? 1, notify_on_status_change ?? 1, notify_on_high_priority ?? 1, user.id));
  return NextResponse.json({ success: true, id: r.lastInsertRowid });
}
