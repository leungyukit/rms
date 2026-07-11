import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSlaDashboard } from '@/lib/sla-scanner';

// GET /api/sla/dashboard
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const data = getSlaDashboard();
  return NextResponse.json(data);
}
