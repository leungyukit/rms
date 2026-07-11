import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// POST: submit feedback (useful / not useful)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { is_useful, comment } = body;

  if (is_useful === undefined) return NextResponse.json({ error: 'is_useful 为必填项' }, { status: 400 });

  const db = getAsyncDb();

  // Check if already submitted
  const existing = (await db.prepare('SELECT id FROM knowledge_feedback WHERE entry_id = ? AND user_id = ?').get(parseInt(id), user.id));
  if (existing) {
    // Update existing
    (await db.prepare('UPDATE knowledge_feedback SET is_useful = ?, comment = ? WHERE id = ?').run(is_useful, comment || '', (existing as any).id));
  } else {
    (await db.prepare('INSERT INTO knowledge_feedback (entry_id, user_id, is_useful, comment) VALUES (?, ?, ?, ?)').run(parseInt(id), user.id, is_useful, comment || ''));
  }

  // Update useful_count on entry
  const usefulCount = ((await db.prepare('SELECT COUNT(*) as c FROM knowledge_feedback WHERE entry_id = ? AND is_useful = 1').get(parseInt(id))) as any).c;
  (await db.prepare('UPDATE knowledge_entries SET useful_count = ? WHERE id = ?').run(usefulCount, parseInt(id)));

  return NextResponse.json({ success: true, useful_count: usefulCount });
}
