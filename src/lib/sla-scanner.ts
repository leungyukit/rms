/**
 * SLA 预警扫描器 · 核心逻辑
 *
 * 业务规则（详见 rms-docs/RMS-优化方案-阶段1-P0.md § 1.3.3）：
 *   - approaching：剩余时间 <= 20% 且 >= 0，通知 handler+receiver
 *   - overdue：超期 1~N 天，通知 handler+receiver
 *   - escalated：超期 >= N 天，升级通知 handler+receiver+verifier
 *   - 去重：同 req + level 在过去 7 天若有未确认记录则跳过
 *   - 边界：planned_end 为空 / 状态已完成 / 分母为 0 / handler_id 为空 全部兜底
 */
import { getDb, getAsyncDb, isMysqlEnabled } from './db';
import { ensureSlaTables, getSlaConfig } from './sla-migrations';

export type SlaStatus = 'ok' | 'approaching' | 'overdue' | 'escalated' | 'none';

interface ScanResult {
  requirement_id: number;
  warning_type: 'approaching' | 'overdue' | 'escalated';
  warning_level: 80 | 100 | 120;
  days_diff: number;
  notified_user_ids: number[];
  title: string;
  handler_id: number | null;
  receiver_id: number | null;
  verifier_id: number | null;
  status: string;
  planned_end: string;
  planned_start: string | null;
  priority: string;
}

export function getRulesForPriority(priority: string | undefined, cfg: ReturnType<typeof getSlaConfig>) {
  const p = priority || 'medium';
  if (p === 'high') return cfg.rules.high;
  if (p === 'low') return cfg.rules.low;
  return cfg.rules.medium;
}

/**
 * 计算单个需求的 SLA 状态（纯派生，不写库）
 */
export function computeSlaStatus(
  plannedStart: string | null,
  plannedEnd: string | null,
  status: string,
  cfg: { approachingPct: number; overdueGraceDays: number; escalateAfterDays: number }
): { status: SlaStatus; daysDiff: number; warningLevel: 0 | 80 | 100 | 120 } {
  if (!plannedEnd) {
    return { status: 'none', daysDiff: 0, warningLevel: 0 };
  }
  if (
    status !== 'scheduled' &&
    status !== 'in_progress' &&
    status !== 'evaluated_not_scheduled'
  ) {
    return { status: 'none', daysDiff: 0, warningLevel: 0 };
  }
  const now = Date.now();
  const endMs = new Date(plannedEnd).getTime();
  const startMs = plannedStart ? new Date(plannedStart).getTime() : endMs;
  const daysDiff = (endMs - now) / (1000 * 60 * 60 * 24);

  // 已超期
  if (daysDiff < -cfg.overdueGraceDays) {
    const overdueDays = -daysDiff - cfg.overdueGraceDays;
    if (overdueDays >= cfg.escalateAfterDays) {
      return { status: 'escalated', daysDiff, warningLevel: 120 };
    }
    return { status: 'overdue', daysDiff, warningLevel: 100 };
  }

  // 即将超期：剩余时间百分比 <= 阈值
  const totalSpan = endMs - startMs;
  if (totalSpan <= 0) {
    // 数据脏：start >= end，降级为"剩余天数 < 0 但未超期阈值"时不报警
    return { status: 'none', daysDiff, warningLevel: 0 };
  }
  const remainingPct = (daysDiff / (totalSpan / (1000 * 60 * 60 * 24))) * 100;
  if (remainingPct <= cfg.approachingPct && daysDiff >= 0) {
    return { status: 'approaching', daysDiff, warningLevel: 80 };
  }

  return { status: 'ok', daysDiff, warningLevel: 0 };
}

/**
 * 扫描全部活跃需求，生成预警列表（不写库）
 */
export function scanAllWarnings(): ScanResult[] {
  ensureSlaTables();
  const db = getDb();
  const slaCfg = getSlaConfig();

  // 仅扫描 active 状态
  // 注意：显式列名以兼容 MySQL 封装层（r.* 在 MySqlDatabase 会被丢列名）
  const rows = db.prepare(`
    SELECT
      id AS requirement_id,
      title, status, planned_start, planned_end, priority,
      handler_id, receiver_id, verifier_id
    FROM requirements
    WHERE planned_end IS NOT NULL
      AND status IN ('scheduled', 'in_progress', 'evaluated_not_scheduled')
  `).all() as any[];

  const results: ScanResult[] = [];
  for (const r of rows) {
    const rules = getRulesForPriority(r.priority, slaCfg);
    const { status, daysDiff, warningLevel } = computeSlaStatus(
      r.planned_start,
      r.planned_end,
      r.status,
      rules
    );
    if (status === 'none' || status === 'ok' || warningLevel === 0) continue;

    // 计算通知接收人
    const recipients: number[] = [];
    if (r.handler_id) recipients.push(r.handler_id);
    if (r.receiver_id) recipients.push(r.receiver_id);
    if (status === 'escalated' && r.verifier_id) recipients.push(r.verifier_id);

      results.push({
      requirement_id: r.requirement_id,
      warning_type: status as any,
      warning_level: warningLevel as 80 | 100 | 120,
      days_diff: daysDiff,
      notified_user_ids: recipients,
      title: r.title,
      handler_id: r.handler_id,
      receiver_id: r.receiver_id,
      verifier_id: r.verifier_id,
      status: r.status,
      planned_end: r.planned_end,
      planned_start: r.planned_start,
      priority: r.priority,
    });
  }
  return results;
}

/**
 * 持久化扫描结果（含 7 天去重 + 写通知）
 *
 * 2026-08-31 改为 async：原实现用同步 getDb().transaction()，而同步 MySQL 路径
 * 每条语句都 fork 一个新 mysql CLI 进程 = 独立连接。START TRANSACTION 开在进程 A
 * （随进程退出隐式回滚）、业务 SQL 在进程 B/C 各自自动提交、COMMIT 打在进程 D，
 * 事务保护完全无效 —— 扫描中途失败会留下「发了通知但预警记录不完整」的脏数据，
 * 而 7 天去重又依赖 sla_warnings 表，脏数据会污染后续判断。
 * （同款 bug 已于 2026-08-03 在异步路径修过，同步路径被漏掉。）
 * 现改走 getAsyncDb()，它用 AsyncLocalStorage 把整个事务绑在同一连接上。
 *
 * @param dryRun true=不写库只返回
 */
export async function persistScan(dryRun: boolean = false): Promise<{
  scanned: number;
  created: number;
  skipped_dedup: number;
  notifications: number;
  items: ScanResult[];
}> {
  const items = scanAllWarnings();
  if (dryRun) {
    return { scanned: items.length, created: 0, skipped_dedup: 0, notifications: 0, items };
  }

  ensureSlaTables();
  const db = getAsyncDb();
  let created = 0;
  let skipped = 0;
  let notifications = 0;

  const insertWarningSql = `
    INSERT INTO sla_warnings
      (requirement_id, warning_type, warning_level, planned_end, days_diff, notified_user_ids)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  // 去重：同 req + level 在过去 7 天是否有未确认记录
  // MySQL 用 DATE_SUB(NOW(), INTERVAL 7 DAY)，SQLite 用 datetime('now', '-7 days')
  const isMysql = isMysqlEnabled();
  const dedupSql = isMysql
    ? `SELECT id FROM sla_warnings
       WHERE requirement_id = ? AND warning_level = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       LIMIT 1`
    : `SELECT id FROM sla_warnings
       WHERE requirement_id = ? AND warning_level = ? AND created_at >= datetime('now', '-7 days')
       LIMIT 1`;
  const insertNotifSql = `
    INSERT INTO notifications (user_id, type, title, content, link, is_read)
    VALUES (?, 'sla_warning', ?, ?, ?, 0)
  `;

  const tx = await db.transaction(async () => {
    for (const it of items) {
      // 7 天去重
      const dup = await db.prepare(dedupSql).get(it.requirement_id, it.warning_level);
      if (dup) {
        skipped++;
        continue;
      }

      await db.prepare(insertWarningSql).run(
        it.requirement_id,
        it.warning_type,
        it.warning_level,
        it.planned_end,
        it.days_diff,
        JSON.stringify(it.notified_user_ids)
      );

      created++;

      // 写通知
      const emoji = it.warning_type === 'escalated' ? '🚨' : it.warning_type === 'overdue' ? '⚠️' : '🟡';
      const titleText = it.warning_type === 'escalated' ? '严重超期' : it.warning_type === 'overdue' ? '需求已超期' : '需求即将超期';
      const daysAbs = Math.abs(it.days_diff).toFixed(1);
      const content = `${emoji} ${titleText}（${daysAbs} 天）- ${it.title}`;
      const link = `/requirements/${it.requirement_id}`;
      for (const uid of it.notified_user_ids) {
        await db.prepare(insertNotifSql).run(uid, content, content, link);
        notifications++;
      }
    }
  });

  await tx();

  return { scanned: items.length, created, skipped_dedup: skipped, notifications, items };
}

/**
 * 列出某条需求的预警历史
 */
export function listWarningsForRequirement(requirementId: number) {
  ensureSlaTables();
  const db = getDb();
  return db.prepare(`
    SELECT sw.*, u.display_name as acknowledged_by_name
    FROM sla_warnings sw
    LEFT JOIN users u ON u.id = sw.acknowledged_by
    WHERE sw.requirement_id = ?
    ORDER BY sw.created_at DESC
  `).all(requirementId);
}

/**
 * 确认预警
 */
export function ackWarning(warningId: number, userId: number): boolean {
  ensureSlaTables();
  const db = getDb();
  const result = db.prepare(`
    UPDATE sla_warnings
    SET acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
    WHERE id = ? AND acknowledged_at IS NULL
  `).run(userId, warningId);
  return result.changes > 0;
}

/**
 * 看板数据
 */
export function getSlaDashboard() {
  ensureSlaTables();
  const db = getDb();
  const cfg = getSlaConfig();
  const items = scanAllWarnings();
  const summary = {
    approaching: items.filter((i) => i.warning_type === 'approaching').length,
    overdue: items.filter((i) => i.warning_type === 'overdue').length,
    escalated: items.filter((i) => i.warning_type === 'escalated').length,
  };

  // 未确认预警
  const unack = db.prepare(`
    SELECT sw.*, r.title as requirement_title, r.priority
    FROM sla_warnings sw
    JOIN requirements r ON r.id = sw.requirement_id
    WHERE sw.acknowledged_at IS NULL
    ORDER BY sw.created_at DESC
    LIMIT 100
  `).all() as any[];

  return { summary, config: cfg, items, unacknowledged: unack };
}
