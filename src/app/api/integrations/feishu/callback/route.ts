import { NextRequest, NextResponse } from 'next/server';
import { ensureIntegrationTables, handleInboundMessage } from '@/lib/integration-migrations';
import { getAsyncDb } from '@/lib/db';

// 飞书事件订阅：URL 验证
export async function POST(req: NextRequest) {
  ensureIntegrationTables();
  const body = await req.json().catch(() => ({}));
  // URL 验证
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }
  // 事件
  if (body.header?.event_type === 'im.message.receive_v1') {
    const ev = body.event;
    const msg = ev?.message;
    const sender = ev?.sender;
    if (!msg) return NextResponse.json({ code: 0 });
    const text = (msg.content?.text || '').trim();
    if (!text || !text.startsWith('@')) return NextResponse.json({ code: 0 }); // 只响应 @ 机器人

    const db = getAsyncDb();
    // 找默认 config：拿第一个 enabled 的 feishu config
    const cfg = (await db.prepare(`SELECT id FROM integration_configs WHERE channel='feishu' AND enabled=1 LIMIT 1`).get()) as any;
    if (!cfg) return NextResponse.json({ code: 0 });

    const result = await handleInboundMessage('feishu', cfg.id, msg.message_id, msg.chat_id, sender?.sender_id?.open_id, body, text);
    // 飞书需要用 message_id 主动发回群（这里仅返回事件状态，不回消息——简化）
    return NextResponse.json({ code: 0, result });
  }
  return NextResponse.json({ code: 0 });
}
