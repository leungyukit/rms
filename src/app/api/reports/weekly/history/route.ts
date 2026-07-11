import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureReportTables } from '@/lib/reports-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureReportTables();
  const db = getAsyncDb();
  const rows = (await db.prepare(`SELECT id, week_start, week_end, scope, project_id, file_size, file_path, generated_at FROM weekly_reports WHERE user_id=? ORDER BY generated_at DESC LIMIT 30`).all(user.id)) as any[];
  return NextResponse.json({ reports: rows });
}
