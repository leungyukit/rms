import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  try {
    // 安全修复（2026-08-03）：原代码手动 base64 解 JWT payload 取 userId，
    // 完全不验签名 —— 任何人伪造 `{"userId":1}` 的 payload 就能改任意用户数据。
    // 现改为走统一的 getCurrentUser()（内部 jwt.verify 验签）。
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await req.json();
    const theme = body.theme;
    if (!['light', 'dark', 'system'].includes(theme)) {
      return NextResponse.json({ error: '无效主题值' }, { status: 400 });
    }

    const db = getAsyncDb();
    const sql = isMysqlEnabled()
      ? 'UPDATE `users` SET `theme` = ? WHERE `id` = ?'
      : 'UPDATE users SET theme = ? WHERE id = ?';
    await db.prepare(sql).run(theme, user.id);

    return NextResponse.json({ success: true, theme });
  } catch (e: any) {
    console.error('PUT /api/user/theme error:', e);
    // 不回内部错误详情
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getAsyncDb();
    const sql = isMysqlEnabled()
      ? 'SELECT `theme` FROM `users` WHERE `id` = ? LIMIT 1'
      : 'SELECT theme FROM users WHERE id = ? LIMIT 1';
    const row = await db.prepare(sql).get(user.id);
    const theme = row?.theme || 'system';

    return NextResponse.json({ success: true, theme });
  } catch (e: any) {
    console.error('GET /api/user/theme error:', e);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
