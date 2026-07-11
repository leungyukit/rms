import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';
import {
  ensureWorkflowEngineTables,
  startInstance,
  listInstances,
  getInstanceDetail,
  cancelInstance,
  completeCurrentNode,
} from '@/lib/workflow-engine';

// GET: 列出实例 / 获取单个实例详情
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorkflowEngineTables();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const requirementId = searchParams.get('requirement_id');

  if (id) {
    const detail = getInstanceDetail(parseInt(id));
    if (!detail) return NextResponse.json({ error: '实例不存在' }, { status: 404 });
    return NextResponse.json(detail);
  }

  const instances = listInstances({
    status: status || undefined,
    requirementId: requirementId ? parseInt(requirementId) : undefined,
    limit: 200,
  });
  return NextResponse.json(instances);
}

// POST: 启动新实例
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要全局管理员权限' }, { status: 403 });

  ensureWorkflowEngineTables();
  const { workflow_id, requirement_id } = await req.json();
  if (!workflow_id || !requirement_id) {
    return NextResponse.json({ error: '缺少 workflow_id 或 requirement_id' }, { status: 400 });
  }

  const result = startInstance({
    workflowId: parseInt(workflow_id),
    requirementId: parseInt(requirement_id),
    startedBy: user.id,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, instanceId: result.instanceId });
}

// PUT: 手动推进（处理人完成当前节点）
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  ensureWorkflowEngineTables();

  const body = await req.json();
  const { instance_id, action, comment } = body;
  if (!instance_id) return NextResponse.json({ error: '缺少 instance_id' }, { status: 400 });

  if (action === 'cancel') {
    if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    const result = cancelInstance(parseInt(instance_id), user.id, comment);
    return NextResponse.json(result);
  }

  if (action === 'complete' || action === 'advance') {
    // 携带需求当前状态/优先级，供条件判断使用
    const db = getAsyncDb();
    const inst = (await db.prepare('SELECT requirement_id FROM workflow_instances WHERE id = ?').get(parseInt(instance_id))) as any;
    let extra: any = undefined;
    if (inst) {
      const req = (await db.prepare('SELECT status, priority FROM requirements WHERE id = ?').get(inst.requirement_id)) as any;
      if (req) extra = { requirementStatus: req.status, requirementPriority: req.priority };
    }
    const result = completeCurrentNode(parseInt(instance_id), user.id, comment, extra);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: '未知 action' }, { status: 400 });
}
