import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureBudgetTables, checkBudgetAlerts } from '@/lib/budget-migrations';
import { getAsyncDb } from '@/lib/db';

const CATEGORIES = ['labor', 'outsource', 'infra', 'license', 'other'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureBudgetTables();
  const { id } = await params;
  const db = getAsyncDb();
  const rows = (await db.prepare(`SELECT * FROM project_costs WHERE project_id=? ORDER BY occurred_on DESC LIMIT 200`).all(parseInt(id)));
  return NextResponse.json({ costs: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureBudgetTables();
  const { id } = await params;
  const body = await req.json();
  const { category, amount, occurred_on, description, vendor, requirement_id, attachment_id } = body;
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: 'category 必为 ' + CATEGORIES.join('/') }, { status: 400 });
  if (typeof amount !== 'number' || amount <= 0) return NextResponse.json({ error: 'amount 必须为正数' }, { status: 400 });
  if (!occurred_on) return NextResponse.json({ error: 'occurred_on 必填' }, { status: 400 });
  const db = getAsyncDb();
  const r = (await db.prepare(`
    INSERT INTO project_costs(project_id, category, amount, occurred_on, description, vendor, requirement_id, attachment_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(parseInt(id), category, amount, occurred_on, description || null, vendor || null, requirement_id || null, attachment_id || null, user.id));
  // 评估告警
  const alerts = checkBudgetAlerts(parseInt(id));
  return NextResponse.json({ success: true, id: r.lastInsertRowid, triggered_alerts: alerts.triggered });
}
