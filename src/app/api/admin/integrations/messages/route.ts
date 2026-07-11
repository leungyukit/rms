import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureIntegrationTables } from '@/lib/integration-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureIntegrationTables();
  const status = req.nextUrl.searchParams.get('status');
  const db = getAsyncDb();
  const where = status ? `WHERE m.status=?` : '';
  const rows = (await db.prepare(`
    SELECT m.*, c.name as config_name, c.channel
    FROM integration_messages m
    LEFT JOIN integration_configs c ON c.id = m.config_id
    ${where}
    ORDER BY m.received_at DESC LIMIT 100
  `).all(...(status ? [status] : []))) as any[];
  return NextResponse.json({ messages: rows });
}
