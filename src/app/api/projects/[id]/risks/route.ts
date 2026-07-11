import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ensureRiskTables } from '@/lib/risk-migrations';
import { computeHealth, persistHealth } from '@/lib/health';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureRiskTables();

  const { id } = await params;
  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT r.*, u.display_name as owner_name, c.display_name as creator_name
    FROM project_risks r
    LEFT JOIN users u ON u.id = r.owner_id
    LEFT JOIN users c ON c.id = r.created_by
    WHERE r.project_id = ?
    ORDER BY
      CASE r.level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      CASE r.status WHEN 'open' THEN 1 WHEN 'mitigating' THEN 2 WHEN 'accepted' THEN 3 ELSE 4 END
  `).all(id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureRiskTables();
  ensureMilestoneTables();

  const { id } = await params;
  const body = await req.json();
  const { title, description, type, level, strategy, owner_id, impact, mitigation_plan } = body;
  if (!title) return NextResponse.json({ error: '标题必填' }, { status: 400 });

  const db = getAsyncDb();
  const r = (await db.prepare(`
    INSERT INTO project_risks(project_id, title, description, type, level, strategy, owner_id, impact, mitigation_plan, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', type || 'technical', level || 'medium', strategy || 'mitigate',
         owner_id || null, impact || '', mitigation_plan || '', user.id));

  // 触发健康度重算
  const h = computeHealth(parseInt(id));
  persistHealth(parseInt(id), h);

  return NextResponse.json({ id: r.lastInsertRowid, success: true });
}
