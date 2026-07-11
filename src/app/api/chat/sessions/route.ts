import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMemcacheChatStore, sessionKey, userSessionsKey, SESSION_TTL, type ChatSession } from '@/lib/chat-store';

// GET /api/chat/sessions - 获取当前用户的会话列表
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  try {
    const store = await getMemcacheChatStore();
    const listKey = userSessionsKey(user.id);
    const raw = await store.get(listKey);
    if (!raw) return NextResponse.json({ sessions: [] });

    const sessionIds: string[] = JSON.parse(raw);
    const sessions: ChatSession[] = [];

    for (const sid of sessionIds) {
      const data = await store.get(sessionKey(user.id, sid));
      if (data) {
        try {
          const s = JSON.parse(data) as ChatSession;
          if (s.userId !== user.id) continue;
          sessions.push(s);
        } catch { /* skip corrupt */ }
      }
    }

    // 按 updatedAt 倒序
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ sessions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/chat/sessions - 创建新会话
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'basic';
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const newSession: ChatSession = {
      id: sessionId,
      userId: user.id,
      title: '新对话',
      mode,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    const store = await getMemcacheChatStore();
    await store.set(sessionKey(user.id, sessionId), JSON.stringify(newSession), SESSION_TTL);

    // 更新用户的会话列表索引
    const listKey = userSessionsKey(user.id);
    const existing = await store.get(listKey);
    const list: string[] = existing ? JSON.parse(existing) : [];
    list.unshift(sessionId); // 最新的在前
    await store.set(listKey, JSON.stringify(list), SESSION_TTL);

    return NextResponse.json({ session: newSession }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
