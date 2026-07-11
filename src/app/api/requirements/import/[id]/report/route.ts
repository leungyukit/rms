import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureImportTables } from '@/lib/import-migrations';
import { getAsyncDb } from '@/lib/db';
import * as fs from 'fs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureImportTables();

  const { id } = await params;
  const db = getAsyncDb();
  const imp = (await db.prepare(`SELECT error_report_path FROM requirement_imports WHERE id=?`).get(id)) as any;
  if (!imp) return NextResponse.json({ error: '导入任务不存在' }, { status: 404 });
  if (!imp.error_report_path || !fs.existsSync(imp.error_report_path)) {
    return NextResponse.json({ error: '无错误报告' }, { status: 404 });
  }
  const content = fs.readFileSync(imp.error_report_path);
  const ab = new ArrayBuffer(content.byteLength);
  new Uint8Array(ab).set(content);
  return new Response(ab, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import_${id}_errors.csv"`,
    },
  });
}
