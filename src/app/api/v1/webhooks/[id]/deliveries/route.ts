import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureWebhookTables } from '@/lib/webhook-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWebhookTables();
  const { id } = await params;
  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT d.*, s.name as subscription_name
    FROM webhook_deliveries d
    JOIN webhook_subscriptions s ON s.id = d.subscription_id
    WHERE d.subscription_id=? AND s.owner_user_id=?
    ORDER BY d.scheduled_at DESC LIMIT 50
  `).all(parseInt(id), user.id)) as any[];
  return NextResponse.json({ deliveries: rows });
}
