import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureIntegrationTables, sendFeishu, sendWecom, sendDingtalk } from '@/lib/integration-migrations';
import { getAsyncDb } from '@/lib/db';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  ensureIntegrationTables();
  const { id } = await params;
  const db = getAsyncDb();
  const cfg = (await db.prepare(`SELECT * FROM integration_configs WHERE id=?`).get(parseInt(id))) as any;
  if (!cfg) return NextResponse.json({ error: '配置不存在' }, { status: 404 });
  const content = '🧪 这是一条 RMS 集成测试消息';
  let r: { ok: boolean; status: number; body: string };
  if (cfg.channel === 'feishu') r = await sendFeishu(cfg.webhook_url, { msg_type: 'text', content: { text: content } }, cfg.secret);
  else if (cfg.channel === 'wecom') r = await sendWecom(cfg.webhook_url, content);
  else if (cfg.channel === 'dingtalk') r = await sendDingtalk(cfg.webhook_url, content, cfg.secret);
  else return NextResponse.json({ error: '未知 channel' }, { status: 400 });
  return NextResponse.json({ ok: r.ok, status: r.status, body: r.body });
}
