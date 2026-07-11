import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';

// Helper to read dingtalk config
async function getDingtalkConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  const enabled = await get('dingtalk_enabled', 'false');
  const appKey = await get('dingtalk_app_key', '');
  const appSecret = await get('dingtalk_app_secret', '');
  const callbackUrl = await get('dingtalk_callback_url', 'http://localhost:3001/api/auth/dingtalk/callback');
  const autoRegister = await get('dingtalk_auto_register', 'true');
  const defaultRole = await get('dingtalk_default_role', 'login_only');
  return {
    enabled: enabled === 'true',
    appKey,
    appSecret,
    callbackUrl,
    autoRegister: autoRegister === 'true',
    defaultRole,
  };
}

// GET /api/auth/dingtalk — Initiate OAuth, return QR code URL
export async function GET(req: NextRequest) {
  const config = await getDingtalkConfig();
  if (!config.enabled || !config.appKey || !config.appSecret) {
    return NextResponse.json({ error: '钉钉登录未启用或未配置', enabled: false }, { status: 400 });
  }

  const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const redirectUri = encodeURIComponent(config.callbackUrl);

  // DingTalk OAuth QR code URL
  const qrUrl = `https://oapi.dingtalk.com/connect/qrconnect?appkey=${encodeURIComponent(config.appKey)}&redirect_uri=${redirectUri}&state=${state}`;

  return NextResponse.json({
    enabled: true,
    qrUrl,
    state,
    appKey: config.appKey,
    redirectUri: config.callbackUrl,
  });
}
