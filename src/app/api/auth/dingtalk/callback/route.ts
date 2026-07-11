import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { signToken, setAuthCookie, logAudit } from '@/lib/auth';

async function getDingtalkConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get('dingtalk_enabled', 'false')) === 'true',
    appKey: await get('dingtalk_app_key', ''),
    appSecret: await get('dingtalk_app_secret', ''),
    autoRegister: (await get('dingtalk_auto_register', 'true')) === 'true',
    defaultRole: await get('dingtalk_default_role', 'login_only'),
  };
}

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  const resp = await fetch(`https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`);
  const data = await resp.json();
  if (data.errcode !== 0) throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  return data.access_token;
}

async function getUserInfoByCode(accessToken: string, code: string) {
  const resp = await fetch(`https://oapi.dingtalk.com/topapi/v2/user/get_by_auth_code?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: code }),
  });
  const data = await resp.json();
  if (data.errcode !== 0) throw new Error(`获取用户信息失败: ${data.errmsg}`);
  return data.result;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=dingtalk_no_code', req.url));
  }

  const config = await getDingtalkConfig();
  if (!config.enabled || !config.appKey || !config.appSecret) {
    return NextResponse.redirect(new URL('/login?error=dingtalk_not_configured', req.url));
  }

  try {
    const accessToken = await getAccessToken(config.appKey, config.appSecret);
    const userInfo = await getUserInfoByCode(accessToken, code);

    const unionId = userInfo.union_id || '';
    const openId = userInfo.open_id || '';
    const displayName = userInfo.name || unionId || openId;
    const email = userInfo.email || '';
    const mobile = userInfo.mobile || '';

    if (!unionId && !openId) {
      return NextResponse.redirect(new URL('/login?error=dingtalk_no_userid', req.url));
    }

    const db = getAsyncDb();

    // Ensure dingtalk columns exist
    try { db.exec('ALTER TABLE users ADD COLUMN dingtalk_union_id TEXT'); } catch {}
    try { db.exec('ALTER TABLE users ADD COLUMN dingtalk_open_id TEXT'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_dingtalk ON users(dingtalk_union_id)'); } catch {}

    // Find existing user by dingtalk_union_id or dingtalk_open_id
    let user = null;
    if (unionId) {
      user = (await db.prepare('SELECT * FROM users WHERE dingtalk_union_id = ?').get(unionId)) as any;
    }
    if (!user && openId) {
      user = (await db.prepare('SELECT * FROM users WHERE dingtalk_open_id = ?').get(openId)) as any;
    }

    if (user) {
      // Existing user → update info and login
      if (unionId && !user.dingtalk_union_id) {
        try { (await db.prepare('UPDATE users SET dingtalk_union_id = ? WHERE id = ?').run(unionId, user.id)); } catch {}
      }
      if (openId && !user.dingtalk_open_id) {
        try { (await db.prepare('UPDATE users SET dingtalk_open_id = ? WHERE id = ?').run(openId, user.id)); } catch {}
      }

      const token = signToken({ userId: user.id, username: user.username });
      await setAuthCookie(token);
      logAudit(user.id, user.username, 'login', '钉钉登录');
      return NextResponse.redirect(new URL('/chat', req.url));
    }

    // New user → auto-register (passwordless)
    if (!config.autoRegister) {
      return NextResponse.redirect(new URL('/login?error=dingtalk_user_not_found', req.url));
    }

    const username = `dingtalk_${unionId || openId}`;

    const result = (await db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, mobile, dingtalk_union_id, dingtalk_open_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, 'DINGTALK_NOPASS', displayName, email, mobile, unionId || null, openId || null));

    const userId = result.lastInsertRowid as number;

    // Assign default role
    const role = (await db.prepare('SELECT id FROM roles WHERE name = ?').get(config.defaultRole)) as any;
    if (role) {
      try { (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id)); } catch {}
    }

    const token = signToken({ userId, username });
    await setAuthCookie(token);
    logAudit(userId, username, 'login', '钉钉登录(新用户)');
    return NextResponse.redirect(new URL('/chat', req.url));
  } catch (err: any) {
    console.error('DingTalk OAuth error:', err);
    return NextResponse.redirect(new URL(`/login?error=dingtalk_error&msg=${encodeURIComponent(err.message || 'unknown')}`, req.url));
  }
}
