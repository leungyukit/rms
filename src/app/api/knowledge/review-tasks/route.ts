import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listReviewTasks } from '@/lib/freshness-migrations';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const status = req.nextUrl.searchParams.get('status') || undefined;
  const mine = req.nextUrl.searchParams.get('assigned_to') === 'me' ? user.id : null;
  const tasks = listReviewTasks(mine, status);
  return NextResponse.json({ tasks, total: tasks.length });
}
