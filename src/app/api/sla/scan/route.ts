import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin, logAudit } from '@/lib/auth';
import { persistScan } from '@/lib/sla-scanner';

// GET /api/sla/scan?dry_run=1  预览
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
  const result = persistScan(dryRun);
  return NextResponse.json({ ok: true, dry_run: dryRun, ...result });
}

// POST /api/sla/scan  真实扫描
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

  const result = persistScan(false);
  logAudit(user.id, user.username, 'sla_scan', `SLA 扫描：命中 ${result.scanned}，新建 ${result.created}，去重跳过 ${result.skipped_dedup}`);
  return NextResponse.json({ ok: true, dry_run: false, ...result });
}
