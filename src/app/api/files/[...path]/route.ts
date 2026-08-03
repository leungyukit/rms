import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/home/itd3/www/rms/public';

// GET: Serve static files from public directory
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // 安全修复（2026-08-03）：原代码无鉴权，任何人可遍历整个 public/ 目录。
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const resolvedParams = await params;
  const filePath = resolvedParams.path.join('/');

  // 安全修复：原校验只查 '..' 字面量，无法抵御 URL 编码（%2e%2e）等变体。
  // 现改为：resolve 后强制校验最终路径仍在 BASE_DIR 内。
  if (filePath.includes('\0')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const fullPath = path.resolve(BASE_DIR, filePath);
  const baseResolved = path.resolve(BASE_DIR);
  if (fullPath !== baseResolved && !fullPath.startsWith(baseResolved + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // 拒绝符号链逃逸（lstat 看真实类型）
  const lst = fs.lstatSync(fullPath);
  if (lst.isSymbolicLink()) {
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
    // 安全修复（2026-08-03）：原来 .svg 以 image/svg+xml 返回，SVG 内可嵌 <script>
    // → 上传附件即可触发存储型 XSS。改为强制下载，不在浏览器里渲染。
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
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'private, max-age=31536000',
      // 阻止浏览器猜测类型导致的 XSS
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
