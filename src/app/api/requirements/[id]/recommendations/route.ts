import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { recommendForRequirement } from '@/lib/recommend-migrations';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const limit = Math.min(10, parseInt(req.nextUrl.searchParams.get('limit') || '5'));
  const t0 = Date.now();
  const r = recommendForRequirement(parseInt(id), limit);
  return NextResponse.json({
    source: { type: 'requirement', id: parseInt(id) },
    results: r.results,
    took_ms: Date.now() - t0,
    cached: r.cached,
    computed_at: r.computed_at,
  });
}
