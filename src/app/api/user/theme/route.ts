import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get('rms_token')?.value || '';
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await req.json();
    const theme = body.theme;
    if (!['light', 'dark', 'system'].includes(theme)) {
      return NextResponse.json({ error: '无效主题值' }, { status: 400 });
    }

    const db = getAsyncDb();
    const sql = isMysqlEnabled()
      ? 'UPDATE `users` SET `theme` = ? WHERE `id` = ?'
      : 'UPDATE users SET theme = ? WHERE id = ?';
    await db.prepare(sql).run(theme, userId);

    return NextResponse.json({ success: true, theme });
  } catch (e: any) {
    console.error('PUT /api/user/theme error:', e);
    return NextResponse.json({ error: e.message || '保存失败' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('rms_token')?.value || '';
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = getAsyncDb();
    const sql = isMysqlEnabled()
      ? 'SELECT `theme` FROM `users` WHERE `id` = ? LIMIT 1'
      : 'SELECT theme FROM users WHERE id = ? LIMIT 1';
    const row = await db.prepare(sql).get(userId);
    const theme = row?.theme || 'system';

    return NextResponse.json({ success: true, theme });
  } catch (e: any) {
    console.error('GET /api/user/theme error:', e);
    return NextResponse.json({ error: e.message || '查询失败' }, { status: 500 });
  }
}
