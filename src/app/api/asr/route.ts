import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

async function getConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = ''): Promise<string> => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get('asr_enabled', 'false')) === 'true',
    apiUrl: await get('asr_api_url', ''),
    apiKey: await get('asr_api_key', ''),
    model: await get('asr_model', ''),
  };
}

// POST /api/asr — Transcribe audio
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const config = await getConfig();
  if (!config.enabled || !config.apiKey) {
    return NextResponse.json({ error: 'ASR 未启用或未配置' }, { status: 400 });
  }

  const { attachment_id } = await req.json();
  if (!attachment_id) return NextResponse.json({ error: '缺少附件ID' }, { status: 400 });

  const db = getAsyncDb();
  const att = (await db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachment_id)) as any;
  if (!att) return NextResponse.json({ error: '附件不存在' }, { status: 404 });

  const filePath = path.join(process.cwd(), 'public', att.file_path);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: '文件不存在' }, { status: 404 });

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), att.original_name);
    formData.append('model', config.model);
    formData.append('language', 'zh');

    const resp = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: `ASR 失败: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await resp.json();
    return NextResponse.json({ success: true, text: data.text || '' });
  } catch (e: any) {
    return NextResponse.json({ error: `ASR 错误: ${e.message}` }, { status: 500 });
  }
}

// GET /api/asr — Check ASR status
export async function GET() {
  const config = await getConfig();
  return NextResponse.json({ enabled: config.enabled && !!config.apiKey });
}
