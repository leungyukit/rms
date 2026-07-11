import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET: single knowledge entry detail
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: '无效的ID' }, { status: 400 });
  const db = getAsyncDb();

  const entry = (await db.prepare(`
    SELECT ke.*, r.title as source_title, r.status as source_status, r.priority as source_priority,
           u.display_name as approved_by_name
    FROM knowledge_entries ke
    LEFT JOIN requirements r ON r.id = ke.source_requirement_id
    LEFT JOIN users u ON u.id = ke.approved_by
    WHERE ke.id = ?
  `).get(parseInt(id))) as any;

  if (!entry) return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });

  // Increment view count
  (await db.prepare('UPDATE knowledge_entries SET view_count = view_count + 1 WHERE id = ?').run(parseInt(id)));
  entry.view_count += 1;
  entry.tags = (() => { try { return JSON.parse(entry.tags); } catch { return []; } })();

  // Get feedback stats
  const feedback = (await db.prepare(`
    SELECT
      SUM(CASE WHEN is_useful = 1 THEN 1 ELSE 0 END) as useful,
      SUM(CASE WHEN is_useful = 0 THEN 1 ELSE 0 END) as not_useful,
      COUNT(*) as total
    FROM knowledge_feedback WHERE entry_id = ?
  `).get(parseInt(id))) as any;
  entry.feedback = { useful: feedback?.useful || 0, not_useful: feedback?.not_useful || 0, total: feedback?.total || 0 };

  // Get related entries
  const related = (await db.prepare(`
    SELECT ke.id, ke.title, ke.type, ke.category, kr.relation_type, kr.weight
    FROM knowledge_relations kr
    JOIN knowledge_entries ke ON (ke.id = kr.target_entry_id OR ke.id = kr.source_entry_id) AND ke.id != ?
    WHERE kr.source_entry_id = ? OR kr.target_entry_id = ?
    ORDER BY kr.weight DESC
    LIMIT 10
  `).all(parseInt(id), parseInt(id), parseInt(id)));
  entry.related = related;

  return NextResponse.json(entry);
}

// PUT: update knowledge entry
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(parseInt(id))) as any;
  if (!existing) return NextResponse.json({ error: '知识条目不存在' }, { status: 404 });

  const fields = ['title', 'question', 'answer', 'category', 'type', 'status', 'confidence'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }
  if (body.tags !== undefined) {
    updates.push('tags = ?');
    values.push(JSON.stringify(body.tags));
  }

  if (updates.length === 0) return NextResponse.json({ error: '无更新内容' }, { status: 400 });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(parseInt(id));

  (await db.prepare(`UPDATE knowledge_entries SET ${updates.join(', ')} WHERE id = ?`).run(...values));

  return NextResponse.json({ success: true });
}

// DELETE: delete knowledge entry
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const db = getAsyncDb();

  (await db.prepare('DELETE FROM knowledge_feedback WHERE entry_id = ?').run(parseInt(id)));
  (await db.prepare('DELETE FROM knowledge_relations WHERE source_entry_id = ? OR target_entry_id = ?').run(parseInt(id), parseInt(id)));
  (await db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(parseInt(id)));

  return NextResponse.json({ success: true });
}
