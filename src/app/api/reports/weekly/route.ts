import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureReportTables, collectWeeklyData, renderWeeklyHtml, isoWeek } from '@/lib/reports-migrations';
import { getAsyncDb } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureReportTables();

  const now = new Date();
  const weekParam = req.nextUrl.searchParams.get('week');
  let target: Date = now;
  if (weekParam) {
    const m = weekParam.match(/^(\d{4})-W(\d{1,2})$/);
    if (m) {
      // ISO 周第一天
      const simple = new Date(parseInt(m[1]), 0, 1 + (parseInt(m[2]) - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = new Date(simple);
      if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
      target = ISOweekStart;
    }
  }
  const iw = isoWeek(target);
  const scope = (req.nextUrl.searchParams.get('scope') as 'global' | 'project') || 'global';
  const projectId = req.nextUrl.searchParams.get('project_id') ? parseInt(req.nextUrl.searchParams.get('project_id')!) : undefined;

  const data = collectWeeklyData(iw.start, iw.end, scope, projectId);
  const html = renderWeeklyHtml(data, { userName: (user as any).display_name || (user as any).username, weekLabel: `${iw.year}-W${String(iw.week).padStart(2, '0')}` });

  // 存盘
  const year = iw.start.getFullYear();
  const dir = path.join(process.cwd(), 'data', 'reports', 'weekly', String(year));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `week-${iw.year}-W${String(iw.week).padStart(2, '0')}-${scope}.html`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, html, 'utf8');

  // 记录
  const db = getAsyncDb();
  (await db.prepare(`INSERT INTO weekly_reports(week_start, week_end, generated_by, user_id, scope, project_id, file_path, file_size, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(iw.start.toISOString().slice(0, 10), iw.end.toISOString().slice(0, 10), user.id, user.id, scope, projectId || null, filepath, html.length, JSON.stringify(data.totals)));

  // 直接返回 HTML（用 application/pdf 响应类型以便下载）
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="RMS-weekly-${filename}"`,
    },
  });
}

export async function POST(req: NextRequest) {
  // preview 模式：返回 JSON summary 不存盘
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureReportTables();
  const body = await req.json().catch(() => ({}));
  const iw = isoWeek(new Date());
  const data = collectWeeklyData(iw.start, iw.end, body.scope || 'global', body.project_id);
  return NextResponse.json({ summary: data, period: iw });
}
