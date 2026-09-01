import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, logAudit, hasFunctionalAccess } from '@/lib/auth';
import { onRequirementStatusChange } from '@/lib/workflow-engine';
import { ensureEstimationFields, getEstimationConfig, isValidStoryPoints } from '@/lib/estimation-migrations';
import { ensureAcceptanceCriteriaTables, getAcAggregate } from '@/lib/ac-migrations';
import { ensureChecklistTables, getChecklistAggregate } from '@/lib/checklist-migrations';
import { ensurePerfIndexes, syncPriorityRank } from '@/lib/perf-indexes-migrations';
import { ensurePriorityFrameworkFields } from '@/lib/requirement-priority-migrations';
import { spToLabel } from '@/lib/sp-badge';
import { checkCaptureGate, upsertCaptureTask } from '@/lib/knowledge-capture';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { id } = await params;
  // 性能优化（需求 600225）：确保索引和 priority_rank 列已建
  ensurePerfIndexes();
  ensurePriorityFrameworkFields();
  const db = getAsyncDb();

  const row = (await db.prepare(`
    SELECT r.*,
      p.name as project_name,
      recv.display_name as receiver_name_display,
      hdl.display_name as handler_name_display,
      vrf.display_name as verifier_name_display,
      pr.title as parent_title,
      s.name as sprint_name,
      s.status as sprint_status
    FROM requirements r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN users recv ON recv.id = r.receiver_id
    LEFT JOIN users hdl ON hdl.id = r.handler_id
    LEFT JOIN users vrf ON vrf.id = r.verifier_id
    LEFT JOIN requirements pr ON pr.id = r.parent_id
    LEFT JOIN sprints s ON s.id = r.sprint_id
    WHERE r.id = ?
  `).get(id)) as any;

  if (!row) return NextResponse.json({ error: '需求不存在' }, { status: 404 });

  // Tags
  row.tags = (await db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN requirement_tags rt ON rt.tag_id = t.id WHERE rt.requirement_id = ?
  `).all(row.id));

  // Children
  row.children = (await db.prepare(`
    SELECT id, title, status, priority FROM requirements WHERE parent_id = ?
  `).all(row.id));

  // Related requirements
  row.relations = (await db.prepare(`
    SELECT rr.id as relation_id, rr.relation_type,
      r2.id, r2.title, r2.status, r2.priority
    FROM requirement_relations rr
    JOIN requirements r2 ON r2.id = CASE WHEN rr.source_id = ? THEN rr.target_id ELSE rr.source_id END
    WHERE rr.source_id = ? OR rr.target_id = ?
  `).all(row.id, row.id, row.id));

  // Status log
  row.statusLog = (await db.prepare(`
    SELECT sl.*, u.display_name as changed_by_name
    FROM status_log sl LEFT JOIN users u ON u.id = sl.changed_by
    WHERE sl.requirement_id = ? ORDER BY sl.changed_at DESC
  `).all(row.id));

  // 估时派生字段
  ensureEstimationFields();
  ensurePriorityFrameworkFields();
  row.sp_label = spToLabel(row.story_points);
  if (row.actual_hours != null && row.estimate_hours && row.estimate_hours > 0) {
    row.estimation_accuracy = Math.round((row.actual_hours / row.estimate_hours) * 100) / 100;
  } else {
    row.estimation_accuracy = null;
  }
  // 估时偏差颜色提示（前端用）
  if (row.estimation_accuracy != null) {
    if (row.estimation_accuracy <= 1.1) row.estimation_color = 'green';
    else if (row.estimation_accuracy <= 1.5) row.estimation_color = 'orange';
    else row.estimation_color = 'red';
  } else {
    row.estimation_color = null;
  }

  // AC 聚合字段
  ensureAcceptanceCriteriaTables();
  const ac = getAcAggregate(row.id);
  Object.assign(row, ac);

  // Checklist 聚合字段
  ensureChecklistTables();
  const cl = getChecklistAggregate(row.id);
  Object.assign(row, cl);

  return NextResponse.json(row);
}

// spToLabel 已抽到 @/lib/sp-badge
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  const existing = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(id)) as any;
  if (!existing) return NextResponse.json({ error: '需求不存在' }, { status: 404 });

  const fields = ['title', 'description', 'business_unit', 'priority', 'status',
    'category', 'project_id', 'parent_id', 'requester_name', 'handler_id',
    'verifier_id', 'benefit', 'planned_start', 'planned_end', 'actual_end',
    'solution', 'lessons_learned', 'root_cause', 'sprint_id', 'priority_framework'];

  const workflowFields = ['workflow_id', 'current_node'];

  // 估时字段
  const estimationFields = ['story_points', 'estimate_hours', 'actual_hours'];

  // AC 状态机门禁：进 completed 时校验必选 AC 全通过
  ensureAcceptanceCriteriaTables();
  if (body.status === 'completed' &&
      existing.status !== 'completed' && existing.status !== 'verified' && existing.status !== 'closed') {
    const acAgg = getAcAggregate(existing.id);
    if (acAgg.ac_total > 0 && acAgg.ac_required_blocking > 0) {
      return NextResponse.json({
        error: `无法进入 completed：还有 ${acAgg.ac_required_blocking} 条必选验收点未通过（${acAgg.ac_required_passed}/${acAgg.ac_required_total}）`,
        ac: acAgg,
      }, { status: 400 });
    }
  }

  // 知识沉淀门禁（P6）—— 排在 AC 门禁之后：AC 是硬指标，先过 AC 再谈沉淀。
  // 必须在 UPDATE 落库**之前**判定，否则 block 模式拦不住。
  //
  // 沉淀字段取「body 优先，未传则用库里现值」：
  // 用户常常是「这次同时填 solution + 改 status」，只看库里旧值会误拦。
  const captureDecision = await checkCaptureGate({
    db,
    requirementId: existing.id,
    prevStatus: existing.status,
    nextStatus: body.status,
    solution: body.solution !== undefined ? body.solution : existing.solution,
    lessons_learned: body.lessons_learned !== undefined ? body.lessons_learned : existing.lessons_learned,
    root_cause: body.root_cause !== undefined ? body.root_cause : existing.root_cause,
    waiverReason: body.capture_waiver_reason,
  });

  if (!captureDecision.allow) {
    return NextResponse.json({
      error: captureDecision.message,
      capture_gate: 'block',
    }, { status: 400 });
  }

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  // 估时校验
  if (body.story_points !== undefined && !isValidStoryPoints(body.story_points)) {
    const cfg = getEstimationConfig();
    return NextResponse.json({
      error: `Story Point 必须在允许值中：${cfg.spAllowValues.join(', ')}（可为空）`,
    }, { status: 400 });
  }
  for (const f of ['estimate_hours', 'actual_hours']) {
    if (body[f] !== undefined && body[f] !== null) {
      const n = Number(body[f]);
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: `${f} 必须为 ≥ 0 的数字` }, { status: 400 });
      }
    }
  }
  // 已完成的需求改 actual_hours 需 admin（防误改）
  // 但如果是"本次主动切到 completed"同时填 actual_hours，允许
  if (body.actual_hours !== undefined) {
    const isBecomingCompletedNow = body.status === 'completed' &&
      existing.status !== 'completed' && existing.status !== 'verified' && existing.status !== 'closed';
    const isAlreadyCompleted = existing.status === 'completed' || existing.status === 'verified' || existing.status === 'closed';
    if (isAlreadyCompleted && !isBecomingCompletedNow) {
      const userIsAdmin = (user.roles || []).some((r: any) => r.name === 'global_admin' || r === 'global_admin');
      if (!userIsAdmin) {
        return NextResponse.json({ error: '已完成的需求修改实际工时需要管理员权限' }, { status: 403 });
      }
    }
  }

  for (const f of fields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(body[f] === '' ? null : body[f]);
    }
  }
  for (const f of estimationFields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(body[f] === null ? null : Number(body[f]));
    }
  }
  for (const f of workflowFields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(body[f] === null ? null : body[f]);
    }
  }
  if (body.priority_score !== undefined) {
    updates.push('priority_score = ?');
    values.push(body.priority_score === null ? null : Number(body.priority_score));
  }

  if (updates.length > 1) {
    values.push(id);
    (await db.prepare(`UPDATE requirements SET ${updates.join(', ')} WHERE id = ?`).run(...values));
  }

  // 性能优化（需求 600225）：priority 变化时同步 priority_rank，保证 ORDER BY 走索引
  if (body.priority !== undefined && body.priority !== existing.priority) {
    (await db.prepare('UPDATE requirements SET priority_rank = ? WHERE id = ?')
      .run(syncPriorityRank(body.priority), id));
  }

  // Status change log
  if (body.status && body.status !== existing.status) {
    (await db.prepare('INSERT INTO status_log (requirement_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)')
      .run(id, existing.status, body.status, user.id));
    logAudit(user.id, user.username, 'update_requirement_status', `需求 ${id}: ${existing.status} → ${body.status}`);

    // 自动填 actual_hours：进入 completed 且没有手动填过
    if (body.status === 'completed' && existing.status !== 'completed' && existing.actual_hours == null && body.actual_hours == null) {
      let hours: number | null = null;
      if (existing.planned_start) {
        const startMs = new Date(existing.planned_start).getTime();
        if (Number.isFinite(startMs)) {
          const raw = (Date.now() - startMs) / 3600000;
          hours = raw > 0 && raw <= 720 ? raw : null;
        }
      }
      if (hours != null && hours > 0) {
        (await db.prepare('UPDATE requirements SET actual_hours = ? WHERE id = ? AND actual_hours IS NULL')
          .run(Math.round(hours * 100) / 100, id));
        logAudit(user.id, user.username, 'auto_actual_hours', `需求 ${id} 完成时自动写入实际工时 ${hours.toFixed(2)}h`);
      }
    }

    // 自动填 actual_end：进入 completed 且没有手动填过
    if (body.status === 'completed' && existing.status !== 'completed' && !existing.actual_end) {
      const today = new Date().toISOString().split('T')[0];
      (await db.prepare('UPDATE requirements SET actual_end = ? WHERE id = ? AND actual_end IS NULL').run(today, id));
      logAudit(user.id, user.username, 'auto_actual_end', `需求 ${id} 完成时自动写入实际完成日期 ${today}`);
    }

    // 知识沉淀待办（P6）：门禁判定在 UPDATE 之前做，建待办放在之后 ——
    // 待办建失败不该让需求状态改不了，主次要分清。
    if (captureDecision.needTask) {
      try {
        await upsertCaptureTask({
          db,
          requirementId: existing.id,
          triggerStatus: body.status,
          createdBy: user.id,
          waiverReason: body.capture_waiver_reason,
        });
        logAudit(user.id, user.username, 'knowledge_capture_task',
          `需求 ${id} 关闭时知识沉淀不足，已建沉淀待办${body.capture_waiver_reason ? '（附豁免理由）' : ''}`);
      } catch (e) {
        console.error('Create knowledge capture task failed:', e);
      }
    }
  }

  // 工作流触发：status / priority / 人员 / 计划日期 等变化都推进实例
  const workflowRelevantFields = ['status', 'priority', 'handler_id', 'receiver_id', 'verifier_id', 'planned_start', 'planned_end'];
  const hasWorkflowChange = workflowRelevantFields.some(f => {
    if (body[f] === undefined) return false;
    const newVal = body[f] === '' ? null : body[f];
    const oldVal = existing[f] == null ? null : existing[f];
    return newVal !== oldVal;
  });
  if (hasWorkflowChange) {
    const currentStatus = body.status || existing.status;
    const currentPriority = body.priority || existing.priority;
    try {
      onRequirementStatusChange(parseInt(id), currentStatus, currentPriority, user.id);
    } catch (e) {
      console.error('Workflow engine trigger failed:', e);
    }
  }

  logAudit(user.id, user.username, 'update_requirement', `更新需求 ID: ${id}`);

  // Update tags
  if (body.tags && Array.isArray(body.tags)) {
    try {
      (await db.prepare('DELETE FROM requirement_tags WHERE requirement_id = ?').run(id));
      for (const tagName of body.tags) {
        if (tagName && typeof tagName === 'string') {
          (await db.prepare('INSERT IGNORE INTO tags (name) VALUES (?)').run(tagName));
          const t = (await db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)) as any;
          if (t) {
            (await db.prepare('INSERT IGNORE INTO requirement_tags (requirement_id, tag_id) VALUES (?, ?)').run(id, t.id));
          }
        }
      }
    } catch (e: any) {
      console.error('Update tags error:', e.message);
    }
  }

  // Update relations
  if (body.related_ids && Array.isArray(body.related_ids)) {
    try {
      (await db.prepare('DELETE FROM requirement_relations WHERE source_id = ?').run(id));
      for (const targetId of body.related_ids) {
        if (targetId) {
          (await db.prepare('INSERT IGNORE INTO requirement_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)')
            .run(id, targetId, 'related'));
        }
      }
    } catch (e: any) {
      console.error('Update relations error:', e.message);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { id } = await params;
  const db = getAsyncDb();
  (await db.prepare('DELETE FROM requirements WHERE id = ?').run(id));
  logAudit(user.id, user.username, 'delete_requirement', `删除需求 ID: ${id}`);
  return NextResponse.json({ success: true });
}
