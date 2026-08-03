import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/itd3/www/rms/public';

// GET: Serve static files from public directory (no auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const filePath = resolvedParams.path.join('/');

  // 安全修复（2026-08-03）：原校验只查 '..' 字面量，无法抵御编码变体；
  // 现改为 resolve 后强制校验最终路径仍在 uploads/ 内。
  if (filePath.includes('\0')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Only allow serving files from uploads directory
  if (!filePath.startsWith('uploads/')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const fullPath = path.resolve(BASE_DIR, filePath);
  const uploadsRoot = path.resolve(BASE_DIR, 'uploads');
  if (!fullPath.startsWith(uploadsRoot + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // 拒绝符号链逃逸
  if (fs.lstatSync(fullPath).isSymbolicLink()) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Check if it's a file (not directory)
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  }

  // Read and serve the file
  const fileBuffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();

  // Determine content type
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    // 安全修复（2026-08-03）：SVG 可嵌 <script> → 存储型 XSS。此端点无鉴权，风险更高。
    '.svg': 'application/octet-stream',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.zip': 'application/zip',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
