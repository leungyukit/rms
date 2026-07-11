import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP, PRIORITY_MAP, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // ?timing=1 开启查询计时（默认关）
  const withTiming = req.nextUrl.searchParams.get('timing') === '1';
  const timings: Array<{ name: string; ms: number; rows?: number }> = [];
  async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!withTiming) return fn();
    const t0 = performance.now();
    const r = await fn();
    const ms = +(performance.now() - t0).toFixed(2);
    timings.push({ name, ms, rows: Array.isArray(r) ? r.length : undefined });
    return r;
  }

  const db = getAsyncDb();
  // MySQL 与 SQLite 的日期函数不兼容：CURDATE() / DATE_SUB(..., INTERVAL n MONTH) 在 SQLite 中不存在
  // 这里集中算两个表达式，SQL 里直接拼进去
  const isMysql = isMysqlEnabled();
  const todayExpr = isMysql ? 'CURDATE()' : "DATE('now')";
  const sixMonthsAgoExpr = isMysql
    ? "DATE_SUB(CURDATE(), INTERVAL 6 MONTH)"
    : "DATE('now', '-6 months')";

  // 1. Handler workload (需求处理人工作量)
  const handlers = (await timed('handlers', () => db.prepare(`
    SELECT u.id, u.display_name, u.username,
      COUNT(r.id) as total,
      SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN r.status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN r.status IN ('completed','verified','closed') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN r.status IN ('received_not_evaluated','evaluated_not_scheduled') THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN r.priority = 'high' THEN 1 ELSE 0 END) as high_count,
      SUM(CASE WHEN r.planned_end IS NOT NULL AND r.planned_end < ${todayExpr} AND r.status NOT IN ('completed','verified','closed') THEN 1 ELSE 0 END) as overdue
    FROM users u
    LEFT JOIN requirements r ON r.handler_id = u.id
    WHERE u.id IN (SELECT DISTINCT handler_id FROM requirements WHERE handler_id IS NOT NULL)
    GROUP BY u.id
    ORDER BY total DESC
  `).all())) as any[];

  // 2. Receiver workload (需求接收人工作量)
  const receivers = (await timed('receivers', () => db.prepare(`
    SELECT u.id, u.display_name, u.username,
      COUNT(r.id) as total,
      SUM(CASE WHEN r.status = 'received_not_evaluated' THEN 1 ELSE 0 END) as not_evaluated,
      SUM(CASE WHEN r.status != 'received_not_evaluated' THEN 1 ELSE 0 END) as processed
    FROM users u
    LEFT JOIN requirements r ON r.receiver_id = u.id
    WHERE u.id IN (SELECT DISTINCT receiver_id FROM requirements WHERE receiver_id IS NOT NULL)
    GROUP BY u.id
    ORDER BY total DESC
  `).all())) as any[];

  // 3. Completion rate per handler
  const completionRates = handlers.map(h => ({
    ...h,
    completion_rate: h.total > 0 ? Math.round((h.completed / h.total) * 100) : 0,
  }));

  // 4. On-time delivery per handler
  const onTimeByHandler = (await timed('onTimeByHandler', () => db.prepare(`
    SELECT u.display_name,
      COUNT(*) as total_completed,
      SUM(CASE WHEN r.actual_end <= r.planned_end THEN 1 ELSE 0 END) as on_time
    FROM requirements r
    JOIN users u ON u.id = r.handler_id
    WHERE r.status IN ('completed','verified','closed')
      AND r.actual_end IS NOT NULL AND r.planned_end IS NOT NULL
    GROUP BY u.id
    ORDER BY total_completed DESC
  `).all())) as any[];

  // 5. Monthly completion trend per handler (last 6 months)
  const monthlyByHandler = (await timed('monthlyByHandler', () => db.prepare(`
    SELECT u.display_name,
      ${isMysql ? "DATE_FORMAT(r.actual_end, '%Y-%m')" : "strftime('%Y-%m', r.actual_end)"} as month,
      COUNT(*) as count
    FROM requirements r
    JOIN users u ON u.id = r.handler_id
    WHERE r.status IN ('completed','verified','closed')
      AND r.actual_end IS NOT NULL
      AND r.actual_end >= ${sixMonthsAgoExpr}
    GROUP BY u.id, month
    ORDER BY month, u.display_name
  `).all())) as any[];

  // 6. Role-based summary
  const roleSummary = (await timed('roleSummary', () => db.prepare(`
    SELECT ro.label as role_label, ro.name as role_name,
      COUNT(DISTINCT ur.user_id) as user_count,
      COUNT(DISTINCT CASE WHEN r.handler_id = ur.user_id THEN r.id END) as handling_count,
      COUNT(DISTINCT CASE WHEN r.receiver_id = ur.user_id THEN r.id END) as receiving_count
    FROM roles ro
    JOIN user_roles ur ON ur.role_id = ro.id
    LEFT JOIN requirements r ON r.handler_id = ur.user_id OR r.receiver_id = ur.user_id
    GROUP BY ro.id
    ORDER BY ro.id
  `).all())) as any[];

  // 7. Workload distribution (for balance analysis)
  const maxLoad = Math.max(...handlers.map(h => h.total), 1);
  const avgLoad = handlers.length > 0 ? Math.round(handlers.reduce((s, h) => s + h.total, 0) / handlers.length) : 0;

  // 8. Unassigned requirements
  const unassigned = ((await timed('unassigned', () => db.prepare(`
    SELECT COUNT(*) as c FROM requirements WHERE handler_id IS NULL AND status NOT IN ('closed','verified','completed')
  `).get())) as any).c;

  // 9. Workload by business unit
  const byBusinessUnit = (await timed('byBusinessUnit', () => db.prepare(`
    SELECT
      COALESCE(NULLIF(r.business_unit, ''), '(未填)') AS business_unit,
      COUNT(r.id) AS total,
      SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN r.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN r.status IN ('completed','verified','closed') THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN r.status IN ('received_not_evaluated','evaluated_not_scheduled') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN r.priority = 'high' THEN 1 ELSE 0 END) AS high_count,
      SUM(CASE WHEN r.planned_end IS NOT NULL AND r.planned_end < ${todayExpr} AND r.status NOT IN ('completed','verified','closed') THEN 1 ELSE 0 END) AS overdue,
      SUM(COALESCE(r.story_points, 0)) AS total_sp
    FROM requirements r
    GROUP BY business_unit
    ORDER BY total DESC
  `).all())) as any[];

  // 10. Workload by project (top 10)
  const byProject = (await timed('byProject', () => db.prepare(`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      COUNT(r.id) AS total,
      SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN r.status IN ('received_not_evaluated','evaluated_not_scheduled') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN r.status IN ('completed','verified','closed') THEN 1 ELSE 0 END) AS completed,
      SUM(COALESCE(r.story_points, 0)) AS total_sp
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    GROUP BY p.id
    HAVING total > 0
    ORDER BY total DESC
    LIMIT 10
  `).all())) as any[];

  // 11. Handler × Business unit matrix (每人每个 BU 的在胅数量)
  const handlerBuMatrix = (await timed('handlerBuMatrix', () => db.prepare(`
    SELECT
      u.id AS handler_id,
      u.display_name,
      COALESCE(NULLIF(r.business_unit, ''), '(未填)') AS business_unit,
      COUNT(r.id) AS total
    FROM users u
    JOIN requirements r ON r.handler_id = u.id
    GROUP BY u.id, business_unit
    ORDER BY u.display_name, total DESC
  `).all())) as any[];

  const body: any = {
    handlers: completionRates,
    receivers,
    onTimeByHandler,
    monthlyByHandler,
    roleSummary,
    byBusinessUnit,
    byProject,
    handlerBuMatrix,
    stats: { maxLoad, avgLoad, unassigned, totalHandlers: handlers.length, totalReceivers: receivers.length },
  };
  if (withTiming) {
    body._timing = {
      total_ms: +timings.reduce((s, t) => s + t.ms, 0).toFixed(2),
      queries: timings,
    };
  }
  return NextResponse.json(body);
}
