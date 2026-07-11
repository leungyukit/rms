import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { signToken, setAuthCookie, logAudit } from '@/lib/auth';

async function getWecomConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get('wecom_enabled', 'false')) === 'true',
    corpId: await get('wecom_corp_id', ''),
    secret: await get('wecom_secret', ''),
    autoRegister: (await get('wecom_auto_register', 'true')) === 'true',
    defaultRole: await get('wecom_default_role', 'login_only'),
  };
}

async function getAccessToken(corpId: string, secret: string): Promise<string> {
  const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  return data.access_token;
}

async function getUserInfoByCode(accessToken: string, code: string) {
  const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(`获取用户信息失败: ${data.errmsg}`);
  return data;
}

async function getUserDetail(accessToken: string, userid: string) {
  const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${userid}`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(`获取用户详情失败: ${data.errmsg}`);
  return data;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=wecom_no_code', req.url));
  }

  const config = await getWecomConfig();
  if (!config.enabled || !config.corpId || !config.secret) {
    return NextResponse.redirect(new URL('/login?error=wecom_not_configured', req.url));
  }

  try {
    const accessToken = await getAccessToken(config.corpId, config.secret);
    const authInfo = await getUserInfoByCode(accessToken, code);

    const wecomUserId = authInfo.userid || authInfo.UserId;
    const openId = authInfo.openid || authInfo.OpenId || '';

    if (!wecomUserId && !openId) {
      return NextResponse.redirect(new URL('/login?error=wecom_no_userid', req.url));
    }

    // Get user detail
    let displayName = wecomUserId || openId;
    let email = '';
    if (wecomUserId) {
      try {
        const detail = await getUserDetail(accessToken, wecomUserId);
        displayName = detail.name || wecomUserId;
        email = detail.email || detail.biz_mail || '';
      } catch {}
    }

    const db = getAsyncDb();

    // Ensure wecom columns exist
    try { db.exec('ALTER TABLE users ADD COLUMN wecom_userid TEXT'); } catch {}
    try { db.exec('ALTER TABLE users ADD COLUMN wecom_openid TEXT'); } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_wecom ON users(wecom_userid)'); } catch {}

    // Find existing user by wecom_userid or wecom_openid
    let user = null;
    if (wecomUserId) {
      user = (await db.prepare('SELECT * FROM users WHERE wecom_userid = ?').get(wecomUserId)) as any;
    }
    if (!user && openId) {
      user = (await db.prepare('SELECT * FROM users WHERE wecom_openid = ?').get(openId)) as any;
    }

    if (user) {
      // Existing user → update info and login
      if (wecomUserId && !user.wecom_userid) {
        try { (await db.prepare('UPDATE users SET wecom_userid = ? WHERE id = ?').run(wecomUserId, user.id)); } catch {}
      }
      if (openId && !user.wecom_openid) {
        try { (await db.prepare('UPDATE users SET wecom_openid = ? WHERE id = ?').run(openId, user.id)); } catch {}
      }

      const token = signToken({ userId: user.id, username: user.username });
      await setAuthCookie(token);
      logAudit(user.id, user.username, 'login', '企业微信登录');
      return NextResponse.redirect(new URL('/chat', req.url));
    }

    // New user → auto-register (passwordless)
    if (!config.autoRegister) {
      return NextResponse.redirect(new URL('/login?error=wecom_user_not_found', req.url));
    }

    // Create user without password (password_hash = 'WECOM_NOPASS' placeholder)
    const username = wecomUserId ? `wecom_${wecomUserId}` : `wecom_${openId}`;

    const result = (await db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, wecom_userid, wecom_openid) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, 'WECOM_NOPASS', displayName, email, wecomUserId || null, openId || null));

    const userId = result.lastInsertRowid as number;

    // Assign default role
    const role = (await db.prepare('SELECT id FROM roles WHERE name = ?').get(config.defaultRole)) as any;
    if (role) {
      (await db.prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id));
    }

    // Auto-login
    const token = signToken({ userId, username });
    await setAuthCookie(token);
    logAudit(userId, username, 'login', '企业微信登录(新用户)');
    return NextResponse.redirect(new URL('/chat', req.url));

  } catch (e: any) {
    console.error('WeCom OAuth error:', e);
    return NextResponse.redirect(new URL(`/login?error=wecom_error&msg=${encodeURIComponent(e.message || '')}`, req.url));
  }
}
