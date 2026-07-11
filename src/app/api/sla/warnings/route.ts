import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWarningsForRequirement } from '@/lib/sla-scanner';
import { getAsyncDb } from '@/lib/db';
import { ensureSlaTables } from '@/lib/sla-migrations';

// GET /api/sla/warnings?requirement_id=N
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureSlaTables();
  const reqId = req.nextUrl.searchParams.get('requirement_id');
  if (reqId) {
    const data = listWarningsForRequirement(parseInt(reqId));
    return NextResponse.json({ data });
  }

  // 全表：最近 100 条
  const db = getAsyncDb();
  const data = (await db.prepare(`
    SELECT sw.*, r.title as requirement_title, r.priority
    FROM sla_warnings sw
    JOIN requirements r ON r.id = sw.requirement_id
    ORDER BY sw.created_at DESC
    LIMIT 100
  `).all());
  return NextResponse.json({ data });
}
