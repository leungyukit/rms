/**
 * 工作流引擎 - 模板与实例分离，自动执行流转
 *
 * 数据模型：
 *   workflows / workflow_nodes / workflow_edges = 模板（可复用）
 *   workflow_instances / instance_nodes / instance_logs = 实例（独立数据）
 *
 * 核心能力：
 *   1. 从模板启动实例：snapshot 模板节点/边到实例
 *   2. 自动推进：状态变更时找到当前节点的下一节点
 *   3. 条件分支：按 status/priority/time 走不同路径
 *   4. 自动通知：流转后通知下一节点处理人
 *   5. 实例独立：实例修改不影响模板
 */

import { getDb, isMysqlEnabled } from './db';

// ==================== 表结构（自动迁移）====================

let tablesEnsured = false;
export function ensureWorkflowEngineTables() {
  if (tablesEnsured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();
  const idType = isMysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const dt = isMysql ? 'DATETIME DEFAULT CURRENT_TIMESTAMP' : "DATETIME DEFAULT CURRENT_TIMESTAMP";
  const idx = (cols: string) =>
    isMysql ? `, INDEX ${cols.split(',')[0].trim().split(' ')[0]}_idx (${cols.split(',')[0].trim().split(' ')[0]})` : '';

  // 流程实例
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_instances (
    id ${idType},
    workflow_id INT NOT NULL,
    workflow_name VARCHAR(200) NOT NULL,
    requirement_id INT NOT NULL,
    current_node_key VARCHAR(100) DEFAULT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'running',
    started_by INT NOT NULL,
    started_at ${dt},
    ended_at DATETIME DEFAULT NULL,
    updated_at ${dt} ${isMysql ? 'ON UPDATE CURRENT_TIMESTAMP' : ''}
  )`);

  // 实例节点（snapshot）
  db.exec(`CREATE TABLE IF NOT EXISTS instance_nodes (
    id ${idType},
    instance_id INT NOT NULL,
    node_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    type VARCHAR(30) NOT NULL,
    assignee_id INT DEFAULT NULL,
    auto_status VARCHAR(50) DEFAULT NULL,
    pos_x INT DEFAULT 0,
    pos_y INT DEFAULT 0,
    config TEXT DEFAULT NULL,
    node_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    entered_at DATETIME DEFAULT NULL,
    exited_at DATETIME DEFAULT NULL,
    comment TEXT DEFAULT NULL
  )`);

  // 实例边（snapshot）
  db.exec(`CREATE TABLE IF NOT EXISTS instance_edges (
    id ${idType},
    instance_id INT NOT NULL,
    from_node VARCHAR(100) NOT NULL,
    to_node VARCHAR(100) NOT NULL,
    condition_type VARCHAR(30) NOT NULL DEFAULT 'always',
    condition_value TEXT DEFAULT NULL,
    label VARCHAR(200) DEFAULT NULL
  )`);

  // 实例日志
  db.exec(`CREATE TABLE IF NOT EXISTS instance_logs (
    id ${idType},
    instance_id INT NOT NULL,
    from_node VARCHAR(100) DEFAULT NULL,
    to_node VARCHAR(100) NOT NULL,
    actor_id INT DEFAULT NULL,
    action VARCHAR(50) NOT NULL,
    detail TEXT DEFAULT NULL,
    created_at ${dt}
  )`);

  tablesEnsured = true;
}

// ==================== 类型定义 ====================

export interface WfInstance {
  id: number;
  workflow_id: number;
  workflow_name: string;
  requirement_id: number;
  current_node_key: string | null;
  status: 'running' | 'completed' | 'cancelled' | 'paused';
  started_by: number;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
}

export interface TransitionContext {
  /** 需求当前状态 */
  requirementStatus?: string;
  /** 需求当前优先级 */
  requirementPriority?: string;
  /** 当前节点已耗时（秒） */
  nodeDurationSec?: number;
  /** 触发者（用户ID） */
  actorId?: number;
  /** 备注 */
  comment?: string;
}

// ==================== 核心 API ====================

/**
 * 启动流程实例：从模板 snapshot 创建实例
 */
export function startInstance(opts: {
  workflowId: number;
  requirementId: number;
  startedBy: number;
}): { success: boolean; instanceId?: number; error?: string } {
  ensureWorkflowEngineTables();
  const db = getDb();

  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(opts.workflowId) as any;
  if (!wf) return { success: false, error: '工作流模板不存在' };

  // 检查是否已有运行中的实例
  const existing = db.prepare(
    "SELECT id FROM workflow_instances WHERE workflow_id = ? AND requirement_id = ? AND status = 'running'"
  ).get(opts.workflowId, opts.requirementId) as any;
  if (existing) return { success: false, error: '该需求已有运行中的流程实例', instanceId: existing.id };

  // 检查需求是否存在
  const req = db.prepare('SELECT id FROM requirements WHERE id = ?').get(opts.requirementId);
  if (!req) return { success: false, error: '需求不存在' };

  // 创建实例
  db.prepare(
    "INSERT INTO workflow_instances (workflow_id, workflow_name, requirement_id, status, started_by) VALUES (?, ?, ?, 'running', ?)"
  ).run(opts.workflowId, wf.name, opts.requirementId, opts.startedBy);
  // 兑底取最新 ID：使用 MAX(id) 免受 lastInsertRowid 解析问题影响
  const idRow = db.prepare('SELECT MAX(id) as id FROM workflow_instances').get() as any;
  const instanceId = (idRow?.id ?? 0) as number;
  if (!instanceId) return { success: false, error: '创建实例失败（未获取到 ID）' };

  // Snapshot 节点
  const nodes = db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ?').all(opts.workflowId) as any[];
  const nStmt = db.prepare(
    'INSERT INTO instance_nodes (instance_id, node_key, label, type, assignee_id, auto_status, pos_x, pos_y, config, node_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const n of nodes) {
    nStmt.run(
      instanceId, n.node_key, n.label, n.type, n.assignee_id, n.auto_status,
      n.pos_x, n.pos_y, n.config || '{}', 'pending'
    );
  }

  // Snapshot 边
  const edges = db.prepare('SELECT * FROM workflow_edges WHERE workflow_id = ?').all(opts.workflowId) as any[];
  const eStmt = db.prepare(
    'INSERT INTO instance_edges (instance_id, from_node, to_node, condition_type, condition_value, label) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const e of edges) {
    eStmt.run(instanceId, e.from_node, e.to_node, e.condition_type, e.condition_value || '', e.label || '');
  }

  // 找到开始节点
  const startNode = nodes.find(n => n.type === 'start');
  if (startNode) {
    db.prepare("UPDATE instance_nodes SET node_status = 'active', entered_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND node_key = ?")
      .run(instanceId, startNode.node_key);
    db.prepare("UPDATE workflow_instances SET current_node_key = ? WHERE id = ?").run(startNode.node_key, instanceId);
  }

  // 记录日志
  db.prepare(
    "INSERT INTO instance_logs (instance_id, to_node, actor_id, action, detail) VALUES (?, ?, ?, 'start', ?)"
  ).run(instanceId, startNode?.node_key || 'start', opts.startedBy, `从模板「${wf.name}」启动实例`);

  // 立即推进一次（从 start 节点走到第一个 task）
  if (startNode) {
    advanceInstance(instanceId, { actorId: opts.startedBy, comment: '自动从开始节点推进' });
  }

  return { success: true, instanceId };
}

/**
 * 推进实例：当前节点完成后，找到下一节点
 */
export function advanceInstance(
  instanceId: number,
  ctx: TransitionContext
): { success: boolean; nextNode?: string; ended?: boolean; waiting?: boolean; error?: string } {
  ensureWorkflowEngineTables();
  const db = getDb();

  const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId) as any;
  if (!inst) return { success: false, error: '实例不存在' };
  if (inst.status !== 'running') return { success: false, error: '实例不在运行中' };

  const currentKey = inst.current_node_key;
  if (!currentKey) return { success: false, error: '实例无当前节点' };

  // 获取当前节点信息
  const currentNode = db.prepare('SELECT * FROM instance_nodes WHERE instance_id = ? AND node_key = ?').get(instanceId, currentKey) as any;
  if (!currentNode) return { success: false, error: '当前节点不存在' };

  // 找到从当前节点出发的所有边
  const outEdges = db.prepare(
    'SELECT * FROM instance_edges WHERE instance_id = ? AND from_node = ?'
  ).all(instanceId, currentKey) as any[];

  // 如果是条件节点，使用节点配置的条件
  let matchedEdge = null;
  if (currentNode.type === 'condition' && currentNode.config) {
    try {
      const config = typeof currentNode.config === 'string' ? JSON.parse(currentNode.config) : currentNode.config;
      if (config.condition_type && config.condition_value) {
        // 使用节点配置的条件来选择边
        matchedEdge = pickMatchingEdgeByNodeConfig(outEdges, config, ctx, inst.requirement_id);
      }
    } catch (e) {
      console.error('解析条件节点配置失败:', e);
    }
  }

  // 如果没有匹配的边，使用原来的逻辑
  if (!matchedEdge) {
    matchedEdge = pickMatchingEdge(outEdges, ctx, inst.requirement_id);
  }

  if (!matchedEdge) {
    // 没有出边，可能就是结束
    if (currentNode?.type === 'end') {
      return finishInstance(instanceId, currentKey, ctx);
    }
    // 对于条件节点，如果没有匹配的边，则等待条件满足
    if (currentNode?.type === 'condition') {
      return { 
        success: false, 
        error: '条件节点：没有匹配的边，等待条件满足',
        waiting: true 
      };
    }
    return { success: false, error: '没有匹配的下一节点' };
  }

  const nextKey = matchedEdge.to_node;
  const nextNode = db.prepare('SELECT * FROM instance_nodes WHERE instance_id = ? AND node_key = ?').get(instanceId, nextKey) as any;
  if (!nextNode) return { success: false, error: '下一节点不存在' };

  // 标记当前节点完成
  db.prepare(
    "UPDATE instance_nodes SET node_status = 'completed', exited_at = CURRENT_TIMESTAMP, comment = ? WHERE instance_id = ? AND node_key = ?"
  ).run(ctx.comment || null, instanceId, currentKey);

  // 标记下一节点激活
  db.prepare(
    "UPDATE instance_nodes SET node_status = 'active', entered_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND node_key = ?"
  ).run(instanceId, nextKey);

  // 更新实例当前节点
  db.prepare('UPDATE workflow_instances SET current_node_key = ? WHERE id = ?').run(nextKey, instanceId);

  // 记录日志
  db.prepare(
    "INSERT INTO instance_logs (instance_id, from_node, to_node, actor_id, action, detail) VALUES (?, ?, ?, ?, 'advance', ?)"
  ).run(
    instanceId, currentKey, nextKey, ctx.actorId || null,
    `从「${currentKey}」推进到「${nextKey}」${matchedEdge.label ? `（条件：${matchedEdge.label}）` : ''}`
  );

  // 触发自动动作
  triggerNodeActions(instanceId, nextNode, ctx);

  // 如果是结束节点，完成实例
  if (nextNode.type === 'end') {
    return finishInstance(instanceId, nextKey, ctx);
  }

  return { success: true, nextNode: nextKey };
}

/**
 * 匹配符合条件的边
 */
function pickMatchingEdge(edges: any[], ctx: TransitionContext, requirementId?: number): any | null {
  if (!edges.length) return null;
  // 优先匹配非 always 的边
  const conditional = edges.filter(e => e.condition_type !== 'always');
  if (conditional.length) {
    for (const e of conditional) {
      if (matchCondition(e, ctx, requirementId)) return e;
    }
    return null; // 有条件边但都不匹配，不推进
  }
  return edges[0]; // 全是 always，取第一条
}

/**
 * 评估节点配置的条件
 */
function evaluateNodeCondition(nodeConfig: any, ctx: TransitionContext, requirementId?: number): boolean {
  const conditionType = nodeConfig.condition_type;
  const conditionValue = nodeConfig.condition_value || '';
  const values = conditionValue.split('|').map((s: string) => s.trim()).filter(Boolean);

  switch (conditionType) {
    case 'status':
      return ctx.requirementStatus ? values.includes(ctx.requirementStatus) : false;
    case 'priority':
      return ctx.requirementPriority ? values.includes(ctx.requirementPriority) : false;
    case 'time_gt': {
      const sec = parseDuration(conditionValue);
      return (ctx.nodeDurationSec || 0) > sec;
    }
    case 'time_diff_gt': {
      // 计算需求创建时间与当前时间的时间差（天）
      if (!requirementId) return false;
      const db = getDb();
      const requirement = db.prepare('SELECT created_at FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || !requirement.created_at) return false;
      
      const createdTime = new Date(requirement.created_at).getTime();
      const now = Date.now();
      const diffDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
      const targetDays = parseInt(conditionValue) || 0;
      return diffDays > targetDays;
    }
    case 'time_diff_lt': {
      // 计算需求创建时间与当前时间的时间差（天）
      if (!requirementId) return false;
      const db = getDb();
      const requirement = db.prepare('SELECT created_at FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || !requirement.created_at) return false;
      
      const createdTime = new Date(requirement.created_at).getTime();
      const now = Date.now();
      const diffDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
      const targetDays = parseInt(conditionValue) || 0;
      return diffDays < targetDays;
    }
    case 'field_eq':
    case 'field_contains':
    case 'field_gt':
    case 'field_lt': {
      if (!requirementId) return false;
      const [field, ...valueParts] = conditionValue.split(':');
      const compareValue = valueParts.join(':').trim();
      if (!field || !compareValue) return false;
      
      // 查询需求字段值
      const db = getDb();
      const requirement = db.prepare('SELECT * FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || requirement[field] === undefined || requirement[field] === null) return false;
      
      const fieldValue = requirement[field];
      
      switch (conditionType) {
        case 'field_eq':
          return String(fieldValue) === compareValue;
        case 'field_contains':
          return String(fieldValue).toLowerCase().includes(compareValue.toLowerCase());
        case 'field_gt': {
          const numField = parseFloat(fieldValue);
          const numCompare = parseFloat(compareValue);
          return !isNaN(numField) && !isNaN(numCompare) && numField > numCompare;
        }
        case 'field_lt': {
          const numField = parseFloat(fieldValue);
          const numCompare = parseFloat(compareValue);
          return !isNaN(numField) && !isNaN(numCompare) && numField < numCompare;
        }
        default:
          return false;
      }
    }
    default:
      return true; // 未知条件类型，默认通过
  }
}

/**
 * 根据节点配置匹配边（用于条件节点）
 */
function pickMatchingEdgeByNodeConfig(edges: any[], nodeConfig: any, ctx: TransitionContext, requirementId?: number): any | null {
  if (!edges.length) return null;
  
  // 首先检查是否有边标签匹配条件描述
  if (nodeConfig.description) {
    const matchedByLabel = edges.find(e => e.label === nodeConfig.description);
    if (matchedByLabel) return matchedByLabel;
  }
  
  // 然后检查边的条件是否匹配节点配置的条件
  for (const edge of edges) {
    // 如果边有具体的条件类型，需要检查是否匹配节点配置
    if (edge.condition_type !== 'always') {
      // 解析节点配置的条件
      const nodeConditionType = nodeConfig.condition_type;
      const nodeConditionValue = nodeConfig.condition_value || '';
      
      // 如果节点配置的条件类型与边的条件类型相同，进一步检查值
      if (edge.condition_type === nodeConditionType) {
        // 对于状态和优先级条件，检查值是否匹配
        if (nodeConditionType === 'status' || nodeConditionType === 'priority') {
          const nodeValues = nodeConditionValue.split('|').map((s: string) => s.trim()).filter(Boolean);
          const edgeValues = (edge.condition_value || '').split('|').map((s: string) => s.trim()).filter(Boolean);
          
          // 如果节点配置的值包含边的值，则匹配
          if (edgeValues.some((ev: string) => nodeValues.includes(ev))) {
            return edge;
          }
        }
        // 对于字段条件，检查字段名是否匹配
        else if (nodeConditionType.startsWith('field_')) {
          const [nodeField] = nodeConditionValue.split(':');
          const [edgeField] = (edge.condition_value || '').split(':');
          if (nodeField === edgeField) {
            return edge;
          }
        }
        // 对于时间条件，检查时间值是否匹配
        else if (nodeConditionType === 'time_gt' || nodeConditionType === 'time_diff_gt' || nodeConditionType === 'time_diff_lt') {
          // 时间条件通常比较数值，如果边的值小于等于节点配置的值，则匹配
          const nodeDuration = parseDuration(nodeConditionValue);
          const edgeDuration = parseDuration(edge.condition_value || '');
          if (edgeDuration <= nodeDuration) {
            return edge;
          }
        }
      }
    }
    
    // 如果边没有条件（always），但节点有配置条件，评估节点条件
    if (edge.condition_type === 'always' && nodeConfig.condition_type && nodeConfig.condition_value) {
      // 评估节点配置的条件
      const conditionMet = evaluateNodeCondition(nodeConfig, ctx, requirementId);
      
      if (conditionMet) {
        return edge;
      }
    }
  }
  
  // 如果没有找到匹配的边，返回第一条边（作为默认路径）
  return edges[0];
}

function matchCondition(edge: any, ctx: TransitionContext, requirementId?: number): boolean {
  const { condition_type, condition_value } = edge;
  const values = (condition_value || '').split('|').map((s: string) => s.trim()).filter(Boolean);

  switch (condition_type) {
    case 'status':
      return ctx.requirementStatus ? values.includes(ctx.requirementStatus) : false;
    case 'priority':
      return ctx.requirementPriority ? values.includes(ctx.requirementPriority) : false;
    case 'time_gt': {
      const sec = parseDuration(condition_value);
      return (ctx.nodeDurationSec || 0) > sec;
    }
    case 'time_diff_gt': {
      // 计算需求创建时间与当前时间的时间差（天）
      if (!requirementId) return false;
      const db = getDb();
      const requirement = db.prepare('SELECT created_at FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || !requirement.created_at) return false;
      
      const createdTime = new Date(requirement.created_at).getTime();
      const now = Date.now();
      const diffDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
      const targetDays = parseInt(condition_value) || 0;
      return diffDays > targetDays;
    }
    case 'time_diff_lt': {
      // 计算需求创建时间与当前时间的时间差（天）
      if (!requirementId) return false;
      const db = getDb();
      const requirement = db.prepare('SELECT created_at FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || !requirement.created_at) return false;
      
      const createdTime = new Date(requirement.created_at).getTime();
      const now = Date.now();
      const diffDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
      const targetDays = parseInt(condition_value) || 0;
      return diffDays < targetDays;
    }
    case 'field_eq':
    case 'field_contains':
    case 'field_gt':
    case 'field_lt': {
      if (!requirementId) return false;
      const [field, ...valueParts] = condition_value.split(':');
      const compareValue = valueParts.join(':').trim();
      if (!field || !compareValue) return false;
      
      // 查询需求字段值
      const db = getDb();
      // 安全地查询字段值
      const requirement = db.prepare('SELECT * FROM requirements WHERE id = ?').get(requirementId) as any;
      if (!requirement || requirement[field] === undefined || requirement[field] === null) return false;
      
      const fieldValue = requirement[field];
      
      switch (condition_type) {
        case 'field_eq':
          return String(fieldValue) === compareValue;
        case 'field_contains':
          return String(fieldValue).toLowerCase().includes(compareValue.toLowerCase());
        case 'field_gt': {
          const numField = parseFloat(fieldValue);
          const numCompare = parseFloat(compareValue);
          return !isNaN(numField) && !isNaN(numCompare) && numField > numCompare;
        }
        case 'field_lt': {
          const numField = parseFloat(fieldValue);
          const numCompare = parseFloat(compareValue);
          return !isNaN(numField) && !isNaN(numCompare) && numField < numCompare;
        }
        default:
          return false;
      }
    }

    default:
      return true;
  }
}

function parseDuration(s: string): number {
  const m = (s || '').match(/^(\d+)([smhd])$/i);
  if (!m) return 0;
  const n = parseInt(m[1]);
  switch (m[2].toLowerCase()) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 0;
  }
}

/**
 * 完成实例
 */
function finishInstance(instanceId: number, endKey: string, ctx: TransitionContext) {
  const db = getDb();
  db.prepare(
    "UPDATE instance_nodes SET node_status = 'completed', exited_at = CURRENT_TIMESTAMP WHERE instance_id = ? AND node_key = ?"
  ).run(instanceId, endKey);
  db.prepare(
    "UPDATE workflow_instances SET status = 'completed', ended_at = CURRENT_TIMESTAMP, current_node_key = NULL WHERE id = ?"
  ).run(instanceId);
  db.prepare(
    "INSERT INTO instance_logs (instance_id, to_node, actor_id, action, detail) VALUES (?, ?, ?, 'complete', ?)"
  ).run(instanceId, endKey, ctx.actorId || null, '流程已完成');
  return { success: true, ended: true };
}

/**
 * 触发节点自动动作（通知/状态变更等）
 */
function triggerNodeActions(instanceId: number, node: any, ctx: TransitionContext) {
  const db = getDb();

  // 1. 自动设置需求状态
  if (node.auto_status) {
    const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId) as any;
    if (inst) {
      try {
        db.prepare("UPDATE requirements SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(node.auto_status, inst.requirement_id);
      } catch (e) {
        // 静默失败，不影响主流程
        console.error('Auto set requirement status failed:', e);
      }
    }
  }

  // 2. 自动通知处理人
  if (node.type === 'task' && node.assignee_id) {
    try {
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, content, payload, created_at) VALUES (?, 'workflow', ?, ?, ?, CURRENT_TIMESTAMP)"
      ).run(
        node.assignee_id,
        `工作流待办: ${node.label}`,
        `您有一个新的工作流待处理任务，请尽快处理`,
        JSON.stringify({ instance_id: instanceId, node_key: node.node_key })
      );
    } catch (e) {
      // notifications 表可能不存在，静默
    }
  }
}

/**
 * 取消实例
 */
export function cancelInstance(instanceId: number, actorId: number, reason?: string) {
  ensureWorkflowEngineTables();
  const db = getDb();
  const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId) as any;
  if (!inst) return { success: false, error: '实例不存在' };
  if (inst.status !== 'running') return { success: false, error: '实例不在运行中' };

  db.prepare("UPDATE workflow_instances SET status = 'cancelled', ended_at = CURRENT_TIMESTAMP WHERE id = ?").run(instanceId);
  db.prepare("INSERT INTO instance_logs (instance_id, to_node, actor_id, action, detail) VALUES (?, ?, ?, 'cancel', ?)")
    .run(instanceId, inst.current_node_key || '', actorId, reason || '实例被取消');
  return { success: true };
}

/**
 * 手动完成当前节点（处理人主动推进）
 */
export function completeCurrentNode(
  instanceId: number,
  actorId: number,
  comment?: string,
  extra?: { requirementStatus?: string; requirementPriority?: string }
) {
  const db = getDb();
  const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId) as any;
  if (!inst) return { success: false, error: '实例不存在' };
  if (inst.status !== 'running') return { success: false, error: '实例不在运行中' };

  const currentNode = db.prepare('SELECT * FROM instance_nodes WHERE instance_id = ? AND node_key = ?')
    .get(instanceId, inst.current_node_key) as any;
  if (!currentNode) return { success: false, error: '当前节点不存在' };

  // 计算节点已耗时
  let durationSec = 0;
  if (currentNode.entered_at) {
    durationSec = Math.floor((Date.now() - new Date(currentNode.entered_at + 'Z').getTime()) / 1000);
  }

  return advanceInstance(instanceId, {
    actorId,
    comment,
    nodeDurationSec: durationSec,
    requirementStatus: extra?.requirementStatus,
    requirementPriority: extra?.requirementPriority,
  });
}

/**
 * 触发器：需求状态变更时调用
 */
export function onRequirementStatusChange(
  requirementId: number,
  newStatus: string,
  priority: string,
  actorId?: number
) {
  ensureWorkflowEngineTables();
  const db = getDb();
  // 找该需求的所有运行中实例
  const instances = db.prepare(
    "SELECT id FROM workflow_instances WHERE requirement_id = ? AND status = 'running'"
  ).all(requirementId) as any[];

  for (const inst of instances) {
    // 推进实例，把新状态传进去用于条件判断
    completeCurrentNode(inst.id, actorId || 0, `需求状态变更为 ${newStatus}`, {
      requirementStatus: newStatus,
      requirementPriority: priority,
    });
  }
}

// ==================== 查询 API ====================

export function getInstanceDetail(instanceId: number) {
  ensureWorkflowEngineTables();
  const db = getDb();
  const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId);
  if (!inst) return null;
  const nodes = db.prepare('SELECT * FROM instance_nodes WHERE instance_id = ? ORDER BY pos_x').all(instanceId);
  const edges = db.prepare('SELECT * FROM instance_edges WHERE instance_id = ?').all(instanceId);
  const logs = db.prepare('SELECT * FROM instance_logs WHERE instance_id = ? ORDER BY created_at DESC').all(instanceId);
  return { ...(inst as any), nodes, edges, logs };
}

export function listInstances(opts: {
  status?: string;
  requirementId?: number;
  workflowId?: number;
  limit?: number;
} = {}) {
  ensureWorkflowEngineTables();
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];
  if (opts.status) { conditions.push('i.status = ?'); params.push(opts.status); }
  if (opts.requirementId) { conditions.push('i.requirement_id = ?'); params.push(opts.requirementId); }
  if (opts.workflowId) { conditions.push('i.workflow_id = ?'); params.push(opts.workflowId); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = opts.limit || 100;
  return db.prepare(
    `SELECT i.*, r.title as requirement_title, r.status as requirement_status,
            u.display_name as started_by_name
     FROM workflow_instances i
     LEFT JOIN requirements r ON r.id = i.requirement_id
     LEFT JOIN users u ON u.id = i.started_by
     ${where}
     ORDER BY i.id DESC LIMIT ?`
  ).all(...params, limit);
}
