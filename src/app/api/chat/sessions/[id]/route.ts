import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMemcacheChatStore, sessionKey, userSessionsKey, SESSION_TTL, type ChatSession } from '@/lib/chat-store';

function validateSession(session: ChatSession | null, userId: number): { ok: true; session: ChatSession } | { ok: false; res: NextResponse } {
  if (!session) return { ok: false, res: NextResponse.json({ error: '会话不存在' }, { status: 404 }) };
  if (session.userId !== userId) return { ok: false, res: NextResponse.json({ error: '无权访问该会话' }, { status: 403 }) };
  return { ok: true, session };
}

// GET /api/chat/sessions/:id - 获取会话详情（含消息）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  try {
    const store = await getMemcacheChatStore();
    const raw = await store.get(sessionKey(user.id, id));
    const session = raw ? (JSON.parse(raw) as ChatSession) : null;
    const check = validateSession(session, user.id);
    if (!check.ok) return check.res;
    return NextResponse.json({ session: check.session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/chat/sessions/:id - 更新会话（重命名等）
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  try {
    const store = await getMemcacheChatStore();
    const raw = await store.get(sessionKey(user.id, id));
    const session = raw ? (JSON.parse(raw) as ChatSession) : null;
    const check = validateSession(session, user.id);
    if (!check.ok) return check.res;

    const body = await req.json().catch(() => ({}));
    if (body.title && typeof body.title === 'string') {
      check.session.title = body.title.trim().slice(0, 100);
    }
    check.session.updatedAt = Date.now();
    await store.set(sessionKey(user.id, id), JSON.stringify(check.session), SESSION_TTL);
    return NextResponse.json({ session: check.session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/chat/sessions/:id - 删除会话
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  try {
    const store = await getMemcacheChatStore();
    const raw = await store.get(sessionKey(user.id, id));
    const session = raw ? (JSON.parse(raw) as ChatSession) : null;
    const check = validateSession(session, user.id);
    if (!check.ok) return check.res;

    await store.delete(sessionKey(user.id, id));

    // 从用户列表索引中移除
    const listKey = userSessionsKey(user.id);
    const existing = await store.get(listKey);
    if (existing) {
      const list: string[] = JSON.parse(existing).filter((sid: string) => sid !== id);
      await store.set(listKey, JSON.stringify(list), SESSION_TTL);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
