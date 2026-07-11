import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureMilestoneTables } from '@/lib/milestone-migrations';
import { computeHealth, persistHealth } from '@/lib/health';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id } = await params;
  const h = computeHealth(parseInt(id));
  return NextResponse.json(h);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureMilestoneTables();

  const { id } = await params;
  const h = computeHealth(parseInt(id));
  persistHealth(parseInt(id), h);
  return NextResponse.json({ ...h, persisted: true });
}
