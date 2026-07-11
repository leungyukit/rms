import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { verifyPassword, signToken, setAuthCookie, logAudit } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 });
    }

    const db = getAsyncDb();
    const user = (await db.prepare('SELECT id, username, password_hash, display_name FROM users WHERE username = ?').get(username)) as any;
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (!verifyPassword(password, user.password_hash)) {
      // eslint-disable-next-line no-console
      console.log('[login] verify fail:', { username, hashLen: user.password_hash?.length, pwLen: password.length });
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const token = signToken({ userId: user.id, username: user.username });
    await setAuthCookie(token);

    // Log login audit
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const ua = req.headers.get('user-agent') || '';
    logAudit(user.id, user.username, 'login', '普通系统登录', ip, ua);

    return NextResponse.json({ success: true, userId: user.id, token });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '登录失败' }, { status: 500 });
  }
}
