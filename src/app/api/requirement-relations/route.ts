import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, hasFunctionalAccess } from '@/lib/auth';

const VALID_RELATIONS = new Set(['related', 'depends_on', 'blocks', 'implements', 'tests', 'fixes']);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { source_id, target_id, relation_type = 'related' } = await req.json();
  if (!source_id || !target_id) {
    return NextResponse.json({ error: '源需求和目标需求不能为空' }, { status: 400 });
  }
  if (!VALID_RELATIONS.has(relation_type)) {
    return NextResponse.json({ error: '无效的关系类型' }, { status: 400 });
  }
  if (source_id === target_id) {
    return NextResponse.json({ error: '不能关联自身' }, { status: 400 });
  }

  const db = getAsyncDb();
  try {
    const result = await db.prepare(
      'INSERT OR IGNORE INTO requirement_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)'
    ).run(source_id, target_id, relation_type);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '创建失败' }, { status: 500 });
  }
}
