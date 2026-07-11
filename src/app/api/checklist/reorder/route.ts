import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ensureChecklistTables } from '@/lib/checklist-migrations';

/**
 * POST /api/checklist/reorder
 * body: { ids: [itemId1, itemId2, ...] }
 * 按数组顺序重设 sequence = 1..N × 100
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureChecklistTables();
  const body = await req.json();
  const db = getAsyncDb();

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids 必须为非空数组' }, { status: 400 });
  }
  const ids = body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
  if (ids.length === 0) return NextResponse.json({ error: 'ids 无有效数字' }, { status: 400 });

  const update = db.prepare('UPDATE requirement_checklist SET sequence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const runTx = await db.transaction(async () => {
    for (let i = 0; i < ids.length; i++) {
      await update.run((i + 1) * 100, ids[i]);
    }
  });
  await runTx();

  logAudit(user.id, user.username, 'reorder_checklist', `重排子任务 ${ids.length} 条`);

  return NextResponse.json({ success: true, count: ids.length });
}
