import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password, display_name } = await req.json();
    if (!username || !password || !display_name) {
      return NextResponse.json({ error: '请填写所有必填字段' }, { status: 400 });
    }
    if (username.length < 3) {
      return NextResponse.json({ error: '用户名至少3个字符' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6个字符' }, { status: 400 });
    }

    const db = getAsyncDb();
    const existing = (await db.prepare('SELECT id FROM users WHERE username = ?').get(username));
    if (existing) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    const hash = hashPassword(password);
    const result = (await db.prepare(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(username, hash, display_name));

    const userId = result.lastInsertRowid as number;

    // Assign default role (login_only)
    const role = (await db.prepare("SELECT id FROM roles WHERE name = 'login_only'").get()) as any;
    if (role) {
      (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id));
    }

    const token = signToken({ userId, username });
    await setAuthCookie(token);

    return NextResponse.json({ success: true, userId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '注册失败' }, { status: 500 });
  }
}
