import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureImportTables } from '@/lib/import-migrations';
import { parseFile, autoMapping, normalizeRow, fileHash, loadContext, generateTemplate, insertOneRow, writeErrorReport } from '@/lib/import';
import { getAsyncDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/requirements/import?format=xlsx|csv
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const format = (req.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase();
  if (format !== 'xlsx' && format !== 'csv') return NextResponse.json({ error: 'format 非法' }, { status: 400 });

  const t = generateTemplate(format);
  const ab = new ArrayBuffer(t.content.byteLength);
  new Uint8Array(ab).set(t.content);
  // RFC 5987 中文文件名编码（避免 Node 内部 Latin-1 转换）
  const encodedFn = encodeURIComponent(t.filename);
  return new Response(ab, {
    headers: {
      'Content-Type': t.contentType,
      'Content-Disposition': `attachment; filename="${encodedFn}"; filename*=UTF-8''${encodedFn}`,
    },
  });
}

// POST /api/requirements/import (multipart)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureImportTables();

  // 权限：仅 global_admin / project_receiver 可批量导入
  if (!isGlobalAdmin(user.roles) && !user.roles.includes('project_receiver')) {
    return NextResponse.json({ error: '需要 admin 或 project_receiver 角色' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const mappingStr = (form.get('mapping') as string) || '{}';
  const dryRun = (form.get('dry_run') as string) !== '0';

  if (!file) return NextResponse.json({ error: '缺文件' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '文件超过 10MB' }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = fileHash(buf);

  // 24h 内同 hash 同用户 completed → 409（双 DB 兼容日期语法）
  const db = getAsyncDb();
  const isMysql = !!process.env.MYSQL_HOST;
  const dateExpr = isMysql ? `created_at > NOW() - INTERVAL 1 DAY` : `created_at > datetime('now', '-1 day')`;
  const recent = (await db.prepare(`
    SELECT id FROM requirement_imports
    WHERE file_hash=? AND created_by=? AND status='completed' AND ${dateExpr}
    LIMIT 1
  `).get(hash, user.id)) as any;
  if (recent) return NextResponse.json({ error: '该文件 24h 内已导入过', import_id: recent.id }, { status: 409 });

  // 解析
  let parsed;
  try {
    parsed = parseFile(buf, file.name);
  } catch (e: any) {
    return NextResponse.json({ error: '文件解析失败: ' + e.message }, { status: 400 });
  }
  const { rows, columns, extraSheets } = parsed;
  if (rows.length === 0) return NextResponse.json({ error: '文件无数据行' }, { status: 400 });

  // 映射
  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(mappingStr); } catch (e) {}
  if (Object.keys(mapping).length === 0) mapping = autoMapping(columns);
  const hasTitle = Object.values(mapping).includes('title');
  if (!hasTitle) {
    return NextResponse.json({ error: '缺少 title 字段映射', auto_mapping: autoMapping(columns) }, { status: 400 });
  }

  // 创建 import 任务
  const r = (await db.prepare(`
    INSERT INTO requirement_imports(filename, file_hash, total_rows, status, mapping_json, created_by)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(file.name, hash, rows.length, JSON.stringify(mapping), user.id));
  const importId = r.lastInsertRowid as number;

  // 逐行归一化 + 校验
  const ctx = loadContext();
  const rowInserts: any[] = [];
  let valid = 0, invalid = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const { normalized, errors } = normalizeRow(raw, mapping, ctx);
    const rawJson = JSON.stringify(raw);
    if (errors.length === 0) {
      rowInserts.push({ row_no: i + 1, raw_json: rawJson, normalized_json: JSON.stringify(normalized), status: 'success' });
      valid++;
    } else {
      rowInserts.push({ row_no: i + 1, raw_json: rawJson, normalized_json: JSON.stringify(normalized), status: 'failed', error_message: errors.map(e => e.field + ': ' + e.message).join('; ') });
      invalid++;
    }
  }

  // 写行明细
  const stmt = db.prepare(`INSERT INTO requirement_import_rows(import_id, row_no, raw_json, normalized_json, status, error_message) VALUES (?,?,?,?,?,?)`);
  if (rowInserts.length) {
    const importTx = await db.transaction(() => {
      for (const r of rowInserts) stmt.run(importId, r.row_no, r.raw_json, r.normalized_json, r.status, r.error_message || null);
    });
    importTx();
  }

  // dry_run 模式：不 commit
  if (dryRun) {
    return NextResponse.json({
      import_id: importId,
      total_rows: rows.length,
      preview: rowInserts.slice(0, 10).map(r => r.normalized_json ? JSON.parse(r.normalized_json) : null),
      errors: rowInserts.filter(r => r.status === 'failed').map(r => ({ row: r.row_no, ...((r.error_message || '').split(';').map((s: string) => s.split(':')).reduce((a: any, c: any) => { a.error_message = c.slice(1).join(':'); a.field = (a.field || []).concat(c[0]); return a; }, {} as any)) })),
      summary: { valid, invalid },
      auto_mapping: mapping,
      extra_sheets: extraSheets,
    });
  }

  // 实际导入
  let success = 0, failed = 0;
  const errorRows: any[] = [];
  for (const r of rowInserts) {
    if (r.status === 'failed') {
      failed++;
      const norm = r.normalized_json ? JSON.parse(r.normalized_json) : {};
      errorRows.push({ row_no: r.row_no, raw_title: norm.title || '', error_field: '-', error_message: r.error_message });
      continue;
    }
    try {
      const norm = JSON.parse(r.normalized_json);
      const reqId = insertOneRow(norm, user.id);
      (await db.prepare(`UPDATE requirement_import_rows SET status='success', requirement_id=? WHERE import_id=? AND row_no=?`).run(reqId, importId, r.row_no));
      success++;
    } catch (e: any) {
      failed++;
      errorRows.push({ row_no: r.row_no, raw_title: r.normalized_json ? (JSON.parse(r.normalized_json).title || '') : '', error_field: 'insert', error_message: e.message });
      (await db.prepare(`UPDATE requirement_import_rows SET status='failed', error_message=? WHERE import_id=? AND row_no=?`).run(e.message, importId, r.row_no));
    }
  }

  // 写错误报告
  let reportPath: string | null = null;
  if (errorRows.length) {
    reportPath = writeErrorReport(importId, errorRows);
  }

  (await db.prepare(`UPDATE requirement_imports SET success_count=?, failed_count=?, status='completed', error_report_path=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(success, failed, reportPath, importId));

  return NextResponse.json({ import_id: importId, success, failed, error_report_url: errorRows.length ? `/api/requirements/import/${importId}/report` : null });
}
