import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMemcacheChatStore, sessionKey, SESSION_TTL, type ChatSession } from '@/lib/chat-store';

// POST /api/chat/sessions/:id/messages - 追加消息到会话
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { role, text, type, url, data } = body;

    if (!role || !['user', 'assistant'].includes(role)) {
      return NextResponse.json({ error: 'role 必须为 user 或 assistant' }, { status: 400 });
    }
    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'text 必填且为字符串' }, { status: 400 });
    }

    const store = await getMemcacheChatStore();
    const raw = await store.get(sessionKey(user.id, id));
    if (!raw) return NextResponse.json({ error: '会话不存在' }, { status: 404 });

    const session = JSON.parse(raw) as ChatSession;
    if (session.userId !== user.id) {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }

    const msg = {
      role,
      text,
      type: type || 'text',
      url,
      data,
      timestamp: Date.now(),
    };

    session.messages.push(msg);
    session.updatedAt = Date.now();

    // 标题自动命名：第一条用户消息的内容作为标题（前 30 字）
    const userMsgCount = session.messages.filter((m) => m.role === 'user').length;
    if (userMsgCount === 1 && role === 'user') {
      session.title = text.trim().slice(0, 30);
    }

    await store.set(sessionKey(user.id, id), JSON.stringify(session), SESSION_TTL);
    return NextResponse.json({ message: msg, session });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
