import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { signToken, setAuthCookie, logAudit } from '@/lib/auth';

async function getFeishuConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get('feishu_enabled', 'false')) === 'true',
    appId: await get('feishu_app_id', ''),
    appSecret: await get('feishu_app_secret', ''),
    autoRegister: (await get('feishu_auto_register', 'true')) === 'true',
    defaultRole: await get('feishu_default_role', 'login_only'),
  };
}

async function getAccessToken(code: string, appId: string, appSecret: string) {
  const resp = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_access_token: await getAppAccessToken(appId, appSecret), grant_type: 'authorization_code', code }),
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`获取 access_token 失败: ${data.msg}`);
  return data.data;
}

async function getAppAccessToken(appId: string, appSecret: string): Promise<string> {
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`获取 app_access_token 失败: ${data.msg}`);
  return data.app_access_token;
}

async function getUserInfoByCode(code: string, appId: string, appSecret: string) {
  const tokenData = await getAccessToken(code, appId, appSecret);
  const accessToken = tokenData.access_token;

  const resp = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`获取用户信息失败: ${data.msg}`);
  return data.data;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=feishu_no_code', req.url));
  }

  const config = await getFeishuConfig();
  if (!config.enabled || !config.appId || !config.appSecret) {
    return NextResponse.redirect(new URL('/login?error=feishu_not_configured', req.url));
  }

  try {
    const userInfo = await getUserInfoByCode(code, config.appId, config.appSecret);

    const unionId = userInfo.union_id || userInfo.open_id;
    const openId = userInfo.open_id;
    const displayName = userInfo.name || userInfo.en_name || unionId;
    const email = userInfo.email || '';
    const avatarUrl = userInfo.avatar_url || '';

    if (!unionId && !openId) {
      return NextResponse.redirect(new URL('/login?error=feishu_no_userid', req.url));
    }

    const db = getAsyncDb();

    // Ensure feishu columns exist
    try { db.exec('ALTER TABLE users ADD COLUMN feishu_union_id TEXT'); } catch {}
    try { db.exec('ALTER TABLE users ADD COLUMN feishu_open_id TEXT'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_feishu ON users(feishu_union_id)'); } catch {}

    // Find existing user by feishu_union_id or feishu_open_id
    let user = null;
    if (unionId) {
      user = (await db.prepare('SELECT * FROM users WHERE feishu_union_id = ?').get(unionId)) as any;
    }
    if (!user && openId) {
      user = (await db.prepare('SELECT * FROM users WHERE feishu_open_id = ?').get(openId)) as any;
    }

    if (user) {
      // Existing user → update info and login
      if (unionId && !user.feishu_union_id) {
        try { (await db.prepare('UPDATE users SET feishu_union_id = ? WHERE id = ?').run(unionId, user.id)); } catch {}
      }
      if (openId && !user.feishu_open_id) {
        try { (await db.prepare('UPDATE users SET feishu_open_id = ? WHERE id = ?').run(openId, user.id)); } catch {}
      }

      const token = signToken({ userId: user.id, username: user.username });
      await setAuthCookie(token);
      logAudit(user.id, user.username, 'login', '飞书登录');
      return NextResponse.redirect(new URL('/chat', req.url));
    }

    // New user → auto-register (passwordless)
    if (!config.autoRegister) {
      return NextResponse.redirect(new URL('/login?error=feishu_user_not_found', req.url));
    }

    const username = `feishu_${unionId || openId}`;

    const result = (await db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, feishu_union_id, feishu_open_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, 'FEISHU_NOPASS', displayName, email, unionId || null, openId || null));

    const userId = result.lastInsertRowid as number;

    // Assign default role
    const role = (await db.prepare('SELECT id FROM roles WHERE name = ?').get(config.defaultRole)) as any;
    if (role) {
      try { (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id)); } catch {}
    }

    const token = signToken({ userId, username });
    await setAuthCookie(token);
    logAudit(userId, username, 'login', '飞书登录(新用户)');
    return NextResponse.redirect(new URL('/chat', req.url));
  } catch (err: any) {
    console.error('Feishu OAuth error:', err);
    return NextResponse.redirect(new URL(`/login?error=feishu_error&msg=${encodeURIComponent(err.message || 'unknown')}`, req.url));
  }
}
