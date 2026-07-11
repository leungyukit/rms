import { NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();
  const tags = (await db.prepare(`
    SELECT t.*, COUNT(rt.requirement_id) as usage_count
    FROM tags t
    LEFT JOIN requirement_tags rt ON rt.tag_id = t.id
    GROUP BY t.id ORDER BY usage_count DESC
  `).all());

  return NextResponse.json(tags);
}
