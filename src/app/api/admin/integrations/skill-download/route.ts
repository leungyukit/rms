import { NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // 安全修复（2026-08-03）：原代码在 /api/admin/ 下却完全无鉴权，
    // 任何未登录访客可读取服务器上的 skill 文件（含脚本源码）。
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!isGlobalAdmin(user.roles)) {
      return NextResponse.json({ error: '需要全局管理员权限' }, { status: 403 });
    }

    const skillDir = path.join(process.env.HOME || '/home/itd3', '.openclaw/plugin-skills/rms');
    
    // Read SKILL.md
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    
    // Read rms-api.js
    const scriptPath = path.join(skillDir, 'scripts/rms-api.js');
    const script = fs.readFileSync(scriptPath, 'utf-8');
    
    // Read skill.json
    const skillJson = fs.readFileSync(path.join(skillDir, 'skill.json'), 'utf-8');

    // Return as downloadable package
    const packageData = {
      name: 'rms-skill',
      version: '1.0.0',
      files: {
        'SKILL.md': skillMd,
        'scripts/rms-api.js': script,
        'skill.json': skillJson,
      },
      installPath: '~/.openclaw/plugin-skills/rms/',
    };

    return new NextResponse(JSON.stringify(packageData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="rms-skill-package.json"',
      },
    });
  } catch (e: any) {
    console.error('[skill-download] error:', e?.message);
    return NextResponse.json({ error: '读取 Skill 文件失败' }, { status: 500 });
  }
}
