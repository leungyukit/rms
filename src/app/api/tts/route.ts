import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function getConfig(prefix: string) {
  const db = getAsyncDb();
  const get = async (key: string, def: string = ''): Promise<string> => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get(`${prefix}_enabled`, 'false')) === 'true',
    apiUrl: await get(`${prefix}_api_url`, ''),
    apiKey: await get(`${prefix}_api_key`, ''),
    model: await get(`${prefix}_model`, ''),
    voice: await get(`${prefix}_voice`, ''),
  };
}

// POST /api/tts — Text to Speech
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const config = await getConfig('tts');
  if (!config.enabled || !config.apiKey) {
    return NextResponse.json({ error: 'TTS 未启用或未配置' }, { status: 400 });
  }

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: '文本不能为空' }, { status: 400 });

  try {
    const resp = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text.slice(0, 2000),
        voice: config.voice || 'alloy',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: `TTS 失败: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const audioBuffer = await resp.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `TTS 错误: ${e.message}` }, { status: 500 });
  }
}

// GET /api/tts — Check TTS status
export async function GET() {
  const config = await getConfig('tts');
  return NextResponse.json({ enabled: config.enabled && !!config.apiKey });
}
