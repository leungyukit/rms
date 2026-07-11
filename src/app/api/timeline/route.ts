import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET: List timeline entries for a requirement
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const reqId = searchParams.get('requirement_id');
  if (!reqId) return NextResponse.json({ error: '缺少 requirement_id' }, { status: 400 });

  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT t.*, u.display_name as author_name
    FROM requirement_timeline t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.requirement_id = ?
    ORDER BY t.created_at DESC
  `).all(Number(reqId)));

  return NextResponse.json(rows);
}

// POST: Add timeline entry
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { requirement_id, content, type } = await req.json();
  if (!requirement_id || !content?.trim()) return NextResponse.json({ error: '内容不能为空' }, { status: 400 });

  const db = getAsyncDb();
  const result = (await db.prepare('INSERT INTO requirement_timeline (requirement_id, type, content, created_by) VALUES (?, ?, ?, ?)')
    .run(requirement_id, type || 'description', content.trim(), user.id));

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}
