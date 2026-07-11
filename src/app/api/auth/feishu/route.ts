import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';

// Helper to read feishu config
async function getFeishuConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  const enabled = await get('feishu_enabled', 'false');
  const appId = await get('feishu_app_id', '');
  const appSecret = await get('feishu_app_secret', '');
  const callbackUrl = await get('feishu_callback_url', 'http://localhost:3001/api/auth/feishu/callback');
  const autoRegister = await get('feishu_auto_register', 'true');
  const defaultRole = await get('feishu_default_role', 'login_only');
  return {
    enabled: enabled === 'true',
    appId,
    appSecret,
    callbackUrl,
    autoRegister: autoRegister === 'true',
    defaultRole,
  };
}

// GET /api/auth/feishu — Initiate OAuth, return QR code URL
export async function GET(req: NextRequest) {
  const config = await getFeishuConfig();
  if (!config.enabled || !config.appId || !config.appSecret) {
    return NextResponse.json({ error: '飞书登录未启用或未配置', enabled: false }, { status: 400 });
  }

  const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const redirectUri = encodeURIComponent(config.callbackUrl);

  // Feishu OAuth QR code URL (self-built app)
  const qrUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&state=${state}`;

  return NextResponse.json({
    enabled: true,
    qrUrl,
    state,
    appId: config.appId,
    redirectUri: config.callbackUrl,
  });
}
