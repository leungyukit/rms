import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Always use the main project directory for uploads (not standalone copy)
const PROJECT_ROOT = process.env.RMS_PROJECT_ROOT || '/home/itd3/www/rms';
const UPLOAD_DIR = path.join(PROJECT_ROOT, 'public/uploads');

// 上传限制（2026-08-03 新增）：原来无大小、无类型、无数量限制 ——
// 任意登录用户可上传 .html/.svg 做存储型 XSS，或直接把磁盘写满。
const MAX_FILE_SIZE = Number(process.env.UPLOAD_MAX_FILE_SIZE || 20 * 1024 * 1024); // 20MB/个
const MAX_FILES_PER_REQUEST = Number(process.env.UPLOAD_MAX_FILES || 10);
const MAX_TOTAL_SIZE = Number(process.env.UPLOAD_MAX_TOTAL_SIZE || 60 * 1024 * 1024); // 60MB/次

// 扩展名白名单（不信 client 报的 mime，以扩展名为准）
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
  '.pdf', '.txt', '.md', '.csv', '.log',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.mp4', '.mp3', '.wav',
]);

// 显式拒绘：可执行 / 可在浏览器里执行脚本的类型
const BLOCKED_EXT = new Set([
  '.html', '.htm', '.svg', '.xhtml', '.xml', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.sh', '.bash', '.zsh', '.php', '.php5', '.phtml', '.py', '.rb', '.pl', '.jar', '.war',
  '.exe', '.dll', '.so', '.bat', '.cmd', '.com', '.scr', '.msi', '.vbs', '.ps1', '.hta',
]);

// POST: Upload files for a requirement
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const formData = await req.formData();
  const requirementId = formData.get('requirement_id');
  const files = formData.getAll('files') as File[];

  if (!requirementId) return NextResponse.json({ error: '缺少 requirement_id' }, { status: 400 });
  const reqIdNum = Number(requirementId);
  if (!Number.isInteger(reqIdNum) || reqIdNum <= 0) {
    return NextResponse.json({ error: 'requirement_id 不合法' }, { status: 400 });
  }
  if (files.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `单次最多上传 ${MAX_FILES_PER_REQUEST} 个文件` }, { status: 400 });
  }

  // 先整体校验，全部通过再落盘，避免写一半报错留垃圾文件
  let totalSize = 0;
  for (const file of files) {
    const ext = path.extname(file.name || '').toLowerCase();
    if (!ext || BLOCKED_EXT.has(ext) || !ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `不允许的文件类型：${file.name || '(无名)'}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name} 超过单文件上限 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB` },
        { status: 413 }
      );
    }
    totalSize += file.size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: `单次上传总大小超过 ${Math.floor(MAX_TOTAL_SIZE / 1024 / 1024)}MB` },
      { status: 413 }
    );
  }

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const db = getAsyncDb();
  const stmt = db.prepare('INSERT INTO attachments (requirement_id, filename, original_name, mime_type, file_size, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const uploaded: any[] = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    // 二次校验：file.size 是 client 声明值，以实际字节数为准
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name} 实际大小超过上限 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB` },
        { status: 413 }
      );
    }
    fs.writeFileSync(filePath, buffer);

    const result = await stmt.run(
      reqIdNum, safeName, file.name,
      file.type || '', buffer.length, `/uploads/${safeName}`, user.id
    );

    uploaded.push({
      id: (result as any).lastInsertRowid,
      filename: safeName,
      original_name: file.name,
      mime_type: file.type,
      file_size: buffer.length,
      file_path: `/uploads/${safeName}`,
    });
  }

  return NextResponse.json({ success: true, files: uploaded });
}

// GET: List attachments for a requirement
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const reqId = searchParams.get('requirement_id');
  if (!reqId) return NextResponse.json({ error: '缺少 requirement_id' }, { status: 400 });

  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT a.*, u.display_name as uploader_name
    FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
    WHERE a.requirement_id = ? ORDER BY a.created_at DESC
  `).all(Number(reqId)));

  return NextResponse.json(rows);
}

// DELETE: Remove attachment
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少附件ID' }, { status: 400 });

  const db = getAsyncDb();
  const att = (await db.prepare('SELECT * FROM attachments WHERE id = ?').get(id)) as any;
  if (!att) return NextResponse.json({ error: '附件不存在' }, { status: 404 });

  // Delete file（防路径穿越：只删 UPLOAD_DIR 里的东西）
  const fullPath = path.resolve(PROJECT_ROOT, 'public', '.' + att.file_path);
  if (fullPath.startsWith(UPLOAD_DIR + path.sep)) {
    try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
  }

  (await db.prepare('DELETE FROM attachments WHERE id = ?').run(id));
  return NextResponse.json({ success: true });
}
