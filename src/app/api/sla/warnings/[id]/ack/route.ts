import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, logAudit } from '@/lib/auth';
import { ackWarning } from '@/lib/sla-scanner';

// POST /api/sla/warnings/:id/ack
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const warningId = parseInt(id);
  if (!warningId) return NextResponse.json({ error: '无效的预警 ID' }, { status: 400 });

  const ok = ackWarning(warningId, user.id);
  if (!ok) return NextResponse.json({ error: '预警不存在或已确认' }, { status: 400 });

  logAudit(user.id, user.username, 'sla_ack', `确认 SLA 预警 #${warningId}`);
  return NextResponse.json({ ok: true });
}
