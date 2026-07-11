import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { scanStaleEntries } from '@/lib/freshness-migrations';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const r = scanStaleEntries({ thresholdMonths: body.threshold_months, dryRun: !!body.dry_run });
  return NextResponse.json(r);
}
