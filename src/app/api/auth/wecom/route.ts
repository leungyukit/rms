import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';

// Helper to read wecom config
async function getWecomConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  const enabled = await get('wecom_enabled', 'false');
  const corpId = await get('wecom_corp_id', '');
  const agentId = await get('wecom_agent_id', '');
  const secret = await get('wecom_secret', '');
  const callbackUrl = await get('wecom_callback_url', 'http://localhost:3001/api/auth/wecom/callback');
  const autoRegister = await get('wecom_auto_register', 'true');
  const defaultRole = await get('wecom_default_role', 'login_only');
  return {
    enabled: enabled === 'true',
    corpId,
    agentId,
    secret,
    callbackUrl,
    autoRegister: autoRegister === 'true',
    defaultRole,
  };
}

// GET /api/auth/wecom — Initiate OAuth, return QR code URL
export async function GET(req: NextRequest) {
  const config = await getWecomConfig();
  if (!config.enabled || !config.corpId || !config.agentId) {
    return NextResponse.json({ error: '企业微信登录未启用或未配置', enabled: false }, { status: 400 });
  }

  const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

  // WeCom OAuth QR code URL
  const qrUrl = `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=${encodeURIComponent(config.corpId)}&agentid=${encodeURIComponent(config.agentId)}&redirect_uri=${encodeURIComponent(config.callbackUrl)}&state=${state}`;

  return NextResponse.json({
    enabled: true,
    qrUrl,
    state,
    corpId: config.corpId,
    agentId: config.agentId,
    redirectUri: config.callbackUrl,
  });
}
