import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureWorkflowEngineTables } from '@/lib/workflow-engine';
import {
  runWorkflowMonitor,
  listOverdueNodes,
  resetOverdueNode,
} from '@/lib/workflow-monitor';

/**
 * GET /api/workflow-monitor
 * 列出 overdue 节点
 */
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorkflowEngineTables();  // P3 fix: 首次访问时确保 instance_nodes 表存在
  const overdue = listOverdueNodes(200);
  return NextResponse.json({ overdue, count: overdue.length });
}

/**
 * POST /api/workflow-monitor
 * 手动触发扫描（管理员/全局管理员）
 */
export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }
  ensureWorkflowEngineTables();
  const result = runWorkflowMonitor();
  return NextResponse.json({ success: true, ...result });
}

/**
 * PUT /api/workflow-monitor
 * 重置 overdue 节点
 * body: { node_id, comment? }
 */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }
  const { node_id, comment } = await req.json();
  if (!node_id) return NextResponse.json({ error: 'node_id 必填' }, { status: 400 });
  ensureWorkflowEngineTables();
  const result = resetOverdueNode(parseInt(node_id), user.id, comment);
  return NextResponse.json(result);
}
