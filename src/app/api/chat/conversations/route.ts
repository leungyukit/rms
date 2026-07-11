import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMemcacheChatStore, sessionKey, userSessionsKey, SESSION_TTL, type ChatSession } from '@/lib/chat-store';

// GET /api/chat/conversations — 列出当前用户的会话
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  try {
    const store = await getMemcacheChatStore();
    const listKey = userSessionsKey(user.id);
    const raw = await store.get(listKey);
    if (!raw) return NextResponse.json({ conversations: [] });

    const sessionIds: string[] = JSON.parse(raw);
    const conversations: any[] = [];

    for (const sid of sessionIds) {
      const data = await store.get(sessionKey(user.id, sid));
      if (!data) continue;
      try {
        const s = JSON.parse(data) as ChatSession;
        if (s.userId !== user.id) continue;
        conversations.push({
          id: s.id,
          title: s.title,
          updated_at: s.updatedAt,
          created_at: s.createdAt,
          mode: s.mode,
        });
      } catch { /* skip corrupt */ }
    }

    conversations.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    return NextResponse.json({ conversations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/chat/conversations — 创建新会话
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const title: string = body.title || '新对话';
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const newSession: ChatSession = {
      id: sessionId,
      userId: user.id,
      title,
      mode: 'basic',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    const store = await getMemcacheChatStore();
    await store.set(sessionKey(user.id, sessionId), JSON.stringify(newSession), SESSION_TTL);

    // 更新用户会话列表索引
    const listKey = userSessionsKey(user.id);
    const existing = await store.get(listKey);
    const list: string[] = existing ? JSON.parse(existing) : [];
    list.unshift(sessionId);
    await store.set(listKey, JSON.stringify(list), SESSION_TTL);

    return NextResponse.json({
      id: newSession.id,
      title: newSession.title,
      mode: newSession.mode,
      created_at: newSession.createdAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
