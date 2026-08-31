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

    // 安全修复（2026-08-31）：原实现「查不到 login_only 角色就静默跳过授权」，
    // 而 roles 表里恰好没有这行数据 → 新用户落地为零角色 → 配合 isLoginOnly()
    // 的 length===1 判定失效，反而拿到全部功能权限。现改为 fail-closed：
    // 默认角色不存在就拒绝注册，绝不创建「无角色」用户。
    const role = (await db.prepare("SELECT id FROM roles WHERE name = 'login_only'").get()) as any;
    if (!role) {
      console.error('[register] 默认角色 login_only 不存在，拒绝注册以避免创建零角色用户');
      return NextResponse.json(
        { error: '注册暂不可用：系统默认角色未配置，请联系管理员' },
        { status: 503 }
      );
    }

    const hash = hashPassword(password);
    const result = (await db.prepare(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(username, hash, display_name));

    const userId = result.lastInsertRowid as number;

    (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id));

    const token = signToken({ userId, username });
    await setAuthCookie(token);

    return NextResponse.json({ success: true, userId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '注册失败' }, { status: 500 });
  }
}
