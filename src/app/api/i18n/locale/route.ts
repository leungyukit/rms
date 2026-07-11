import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { ensureI18nTables, isValidLocale, resolveLocale } from '@/lib/i18n-migrations';

export async function POST(req: NextRequest) {
  ensureI18nTables();
  const body = await req.json().catch(() => ({}));
  const locale = body.locale;
  if (!isValidLocale(locale)) return NextResponse.json({ error: '不支持的语言' }, { status: 400 });

  // 写 cookie（HttpOnly 不需要，前端要读）
  const res = NextResponse.json({ success: true, locale });
  res.cookies.set('rms_locale', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });

  // 已登录则同步到 users.preferred_locale
  const user = await getCurrentUser();
  if (user) {
    const db = getAsyncDb();
    try {
      if (isMysqlEnabled()) {
        (await db.prepare(`UPDATE users SET preferred_locale=? WHERE id=?`).run(locale, user.id));
      } else {
        (await db.prepare(`UPDATE users SET preferred_locale=? WHERE id=?`).run(locale, user.id));
      }
    } catch (e) {}
  }
  return res;
}

export async function GET(req: NextRequest) {
  ensureI18nTables();
  const urlLocale = req.nextUrl.searchParams.get('lang') || undefined;
  const cookieLocale = req.cookies.get('rms_locale')?.value;
  const user = await getCurrentUser();
  const userLocale = (user as any)?.preferred_locale;
  const locale = resolveLocale({ urlLocale, cookieLocale, userLocale });
  return NextResponse.json({ locale, supported: ['zh-CN', 'en-US'] });
}
