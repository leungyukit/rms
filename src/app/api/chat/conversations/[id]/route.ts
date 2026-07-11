import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMemcacheChatStore, sessionKey, userSessionsKey, SESSION_TTL, type ChatSession } from '@/lib/chat-store';

// DELETE /api/chat/conversations/:id — 删除会话
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  if (!conversationId) return NextResponse.json({ error: '缺少对话ID' }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  try {
    const store = await getMemcacheChatStore();

    // 验证会话归属
    const raw = await store.get(sessionKey(user.id, conversationId));
    if (raw) {
      const session = JSON.parse(raw) as ChatSession;
      if (session.userId !== user.id) {
        return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
      }
    }

    // 删除会话
    await store.delete(sessionKey(user.id, conversationId));

    // 从用户列表索引中移除
    const listKey = userSessionsKey(user.id);
    const existing = await store.get(listKey);
    if (existing) {
      const list: string[] = JSON.parse(existing).filter((sid: string) => sid !== conversationId);
      await store.set(listKey, JSON.stringify(list), SESSION_TTL);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
