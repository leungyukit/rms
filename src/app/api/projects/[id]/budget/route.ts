import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureBudgetTables, checkBudgetAlerts } from '@/lib/budget-migrations';
import { getAsyncDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureBudgetTables();
  const { id } = await params;
  const body = await req.json();
  const fields = ['budget', 'currency', 'cost_center', 'budget_period', 'alert_threshold_80', 'alert_threshold_100'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) if (f in body) { sets.push(`${f}=?`); vals.push(body[f]); }
  if (!sets.length) return NextResponse.json({ error: '无字段' }, { status: 400 });
  vals.push(parseInt(id));
  const db = getAsyncDb();
  (await db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id=?`).run(...vals));
  // 重新评估告警
  const alerts = checkBudgetAlerts(parseInt(id));
  return NextResponse.json({ success: true, triggered_alerts: alerts.triggered });
}
