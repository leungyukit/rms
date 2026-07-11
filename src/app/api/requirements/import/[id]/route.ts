import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureImportTables } from '@/lib/import-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureImportTables();

  const { id } = await params;
  const db = getAsyncDb();
  const imp = (await db.prepare(`SELECT * FROM requirement_imports WHERE id=?`).get(id)) as any;
  if (!imp) return NextResponse.json({ error: '导入任务不存在' }, { status: 404 });
  const rows = (await db.prepare(`
    SELECT row_no, status, error_message, requirement_id
    FROM requirement_import_rows WHERE import_id=?
    ORDER BY row_no ASC
  `).all(id)) as any[];
  return NextResponse.json({ ...imp, rows });
}
