import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Always use the main project directory for uploads (not standalone copy)
const UPLOAD_DIR = '/home/itd3/www/rms/public/uploads';

// POST: Upload files for a requirement
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const formData = await req.formData();
  const requirementId = formData.get('requirement_id');
  const files = formData.getAll('files') as File[];

  if (!requirementId) return NextResponse.json({ error: '缺少 requirement_id' }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 });

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const db = getAsyncDb();
  const stmt = db.prepare('INSERT INTO attachments (requirement_id, filename, original_name, mime_type, file_size, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const uploaded: any[] = [];

  for (const file of files) {
    const ext = path.extname(file.name) || '';
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const result = await stmt.run(
      Number(requirementId), safeName, file.name,
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

  // Delete file
  const fullPath = path.join('/home/itd3/www/rms', 'public', att.file_path);
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}

  (await db.prepare('DELETE FROM attachments WHERE id = ?').run(id));
  return NextResponse.json({ success: true });
}
