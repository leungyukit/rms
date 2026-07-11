import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { requirementsReferencing } from '@/lib/recommend-migrations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const refs = requirementsReferencing(parseInt(id), 10);
  return NextResponse.json({ knowledge_id: parseInt(id), references: refs, count: refs.length });
}
