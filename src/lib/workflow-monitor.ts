/**
 * 工作流超时监控（v1.2 high）
 *
 * 功能：
 * - 扫描 instance_nodes 中 node_status='active' 的节点
 * - 找出 entered_at 超过阈值的节点
 * - 标记为 'overdue'，写 notifications 表（assignee）
 * - 通知上级处理人（fallback 到 workflow 的 created_by）
 * - 不自动推进（避免破坏流程），留接口让管理员手动决定
 *
 * 阈值优先级：
 *   1. 节点 config.timeout_min（如 "1440"）
 *   2. 需求 priority 默认阈值（high=720 / medium=2880 / low=7200）
 *   3. 1440 分钟（24h）
 *
 * 调度：OpenClaw cron every 5min
 */
import { getDb } from './db';

const DEFAULT_TIMEOUT_MIN = 1440; // 24h
const PRIORITY_DEFAULT: Record<string, number> = {
  high: 720,    // 12h
  medium: 2880, // 48h
  low: 7200,    // 5d
};

export interface OverdueNode {
  instanceId: number;
  requirementId: number;
  nodeKey: string;
  nodeLabel: string;
  assigneeId: number | null;
  enteredAt: string;
  durationMin: number;
  thresholdMin: number;
  priority: string;
}

export interface MonitorResult {
  scanned: number;
  overdue: OverdueNode[];
  notified: number;
  errors: string[];
}

/**
 * 解析节点 config.timeout_min
 */
function parseNodeTimeoutMin(node: any): number | null {
  if (!node.config) return null;
  let cfg = node.config;
  if (typeof cfg === 'string') {
    try { cfg = JSON.parse(cfg); } catch { return null; }
  }
  const v = cfg?.timeout_min;
  if (typeof v === 'number' && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * 主函数：扫描并通知
 */
export function runWorkflowMonitor(): MonitorResult {
  const db = getDb();
  const result: MonitorResult = { scanned: 0, overdue: [], notified: 0, errors: [] };

  // 1. 找出所有 active 节点
  const activeNodes = db.prepare(`
    SELECT n.id, n.instance_id, n.node_key, n.label, n.assignee_id, n.config, n.entered_at,
           i.requirement_id, i.started_by
    FROM instance_nodes n
    JOIN workflow_instances i ON i.id = n.instance_id
    WHERE n.node_status = 'active'
      AND i.status = 'running'
      AND n.entered_at IS NOT NULL
  `).all() as any[];

  result.scanned = activeNodes.length;
  const now = Date.now();

  for (const node of activeNodes) {
    try {
      // 计算已耗时
      const enteredMs = new Date(node.entered_at + 'Z').getTime();
      const durationMin = Math.floor((now - enteredMs) / 60000);
      if (durationMin < 0) continue; // 时钟漂移保护

      // 找需求优先级
      let priority = 'medium';
      if (node.requirement_id) {
        const req = db.prepare('SELECT priority FROM requirements WHERE id = ?').get(node.requirement_id) as any;
        if (req?.priority) priority = req.priority;
      }

      // 阈值
      const nodeTimeout = parseNodeTimeoutMin(node);
      const thresholdMin = nodeTimeout ?? PRIORITY_DEFAULT[priority] ?? DEFAULT_TIMEOUT_MIN;

      if (durationMin < thresholdMin) continue;

      // 标记 overdue（如果还是 active）
      const upd = db.prepare(`
        UPDATE instance_nodes
        SET node_status = 'overdue'
        WHERE id = ? AND node_status = 'active'
      `).run(node.id);

      if (upd.changes === 0) continue; // 并发时已被处理

      // 写 instance_log
      db.prepare(`
        INSERT INTO instance_logs (instance_id, from_node, to_node, action, detail, actor_id)
        VALUES (?, ?, ?, 'overdue', ?, 0)
      `).run(
        node.instance_id,
        node.node_key,
        node.node_key,
        `节点超时：已耗时 ${durationMin} 分钟，超过阈值 ${thresholdMin} 分钟（优先级 ${priority}）`
      );

      // 收件人：节点 assignee → 启动人 → 系统通知
      const recipients = new Set<number>();
      if (node.assignee_id) recipients.add(node.assignee_id);
      if (node.started_by) recipients.add(node.started_by);

      for (const uid of recipients) {
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, content, link, created_at)
          VALUES (?, 'workflow_overdue', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          uid,
          `⏰ 节点超时：${node.label || node.node_key}`,
          `实例 #${node.instance_id} 的节点「${node.label || node.node_key}」已耗时 ${durationMin} 分钟（阈值 ${thresholdMin}），请尽快处理。`,
          `/workflows/monitor?instance=${node.instance_id}`
        );
        result.notified++;
      }

      result.overdue.push({
        instanceId: node.instance_id,
        requirementId: node.requirement_id,
        nodeKey: node.node_key,
        nodeLabel: node.label || node.node_key,
        assigneeId: node.assignee_id,
        enteredAt: node.entered_at,
        durationMin,
        thresholdMin,
        priority,
      });
    } catch (e: any) {
      result.errors.push(`node ${node.id}: ${e.message}`);
    }
  }

  return result;
}

/**
 * API 端点使用：列出 overdue 节点（监控页展示用）
 */
export function listOverdueNodes(limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT n.id, n.instance_id, n.node_key, n.label, n.assignee_id, n.entered_at, n.exited_at,
           i.requirement_id, i.workflow_name, r.title as requirement_title, r.priority
    FROM instance_nodes n
    JOIN workflow_instances i ON i.id = n.instance_id
    LEFT JOIN requirements r ON r.id = i.requirement_id
    WHERE n.node_status = 'overdue'
    ORDER BY n.entered_at DESC
    LIMIT ?
  `).all(limit) as any[];
}

/**
 * 恢复 overdue → active（管理员手动重置时用）
 */
export function resetOverdueNode(nodeId: number, actorId: number, comment?: string): { success: boolean; error?: string } {
  const db = getDb();
  const node = db.prepare('SELECT * FROM instance_nodes WHERE id = ? AND node_status = ?').get(nodeId, 'overdue') as any;
  if (!node) return { success: false, error: '节点不存在或不是 overdue 状态' };

  db.prepare(`
    UPDATE instance_nodes
    SET node_status = 'active', entered_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nodeId);

  db.prepare(`
    INSERT INTO instance_logs (instance_id, from_node, to_node, action, detail, actor_id)
    VALUES (?, ?, ?, 'reset_overdue', ?, ?)
  `).run(
    node.instance_id,
    node.node_key,
    node.node_key,
    comment || '管理员重置 overdue 节点，重新开始计时',
    actorId
  );

  return { success: true };
}
