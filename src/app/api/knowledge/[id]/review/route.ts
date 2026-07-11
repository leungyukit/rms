import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const action = body.action;
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'action 必为 approve/reject' }, { status: 400 });

  const db = getAsyncDb();
  const entry = (await db.prepare(`SELECT * FROM knowledge_entries WHERE id=?`).get(id)) as any;
  if (!entry) return NextResponse.json({ error: '知识不存在' }, { status: 404 });
  if (!entry.ai_generated) return NextResponse.json({ error: '仅 AI 生成的知识可审阅' }, { status: 400 });

  // 权限：handler 或 admin
  if (!isGlobalAdmin(user.roles) && entry.created_by !== `user:${user.id}` && user.id !== entry.reviewed_by) {
    // 允许处理人（来自源需求）
    const srcReq = entry.source_requirement_id ? (await db.prepare(`SELECT handler_id FROM requirements WHERE id=?`).get(entry.source_requirement_id)) as any : null;
    if (!srcReq || srcReq.handler_id !== user.id) {
      // 也允许任何 global_admin
      if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要 admin 或源需求处理人' }, { status: 403 });
    }
  }

  if (action === 'approve') {
    (await db.prepare(`UPDATE knowledge_entries SET status='published', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id, id));
  } else {
    // 拒绝 → 软删（archived）
    (await db.prepare(`UPDATE knowledge_entries SET status='archived', reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id, id));
  }

  return NextResponse.json({ success: true, status: action === 'approve' ? 'published' : 'archived' });
}
