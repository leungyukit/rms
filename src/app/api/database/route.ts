import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { testMysqlConnection, resetMysqlPool } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { action } = await req.json();

  if (action === 'test') {
    resetMysqlPool(); // Reset to pick up new config
    const result = await testMysqlConnection();
    return NextResponse.json(result);
  }

  if (action === 'reset') {
    resetMysqlPool();
    return NextResponse.json({ success: true, message: '连接池已重置' });
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}
