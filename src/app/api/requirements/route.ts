import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin, getUserRoleProjects, logAudit, hasFunctionalAccess } from '@/lib/auth';
import { applyFieldPolicies } from '@/lib/field-policy-migrations';
import { computeSlaStatus, getRulesForPriority } from '@/lib/sla-scanner';
import { ensureSlaTables, getSlaConfig } from '@/lib/sla-migrations';
import { ensureEstimationFields, getEstimationConfig, isValidStoryPoints } from '@/lib/estimation-migrations';
import { ensureDedupFields } from '@/lib/dedup-migrations';
import { ensurePerfIndexes, syncPriorityRank } from '@/lib/perf-indexes-migrations';
import { spToLabel } from '@/lib/sp-badge';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  // 性能优化（需求 600225）：确保索引和 priority_rank 列已建
  ensurePerfIndexes();

  const db = getAsyncDb();
  const url = req.nextUrl;
  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const handlerId = url.searchParams.get('handler_id');
  const receiverId = url.searchParams.get('receiver_id');
  const tag = url.searchParams.get('tag');
  const search = url.searchParams.get('search');
  const category = url.searchParams.get('category');
  const slaFilter = url.searchParams.get('sla_filter');
  const spMin = url.searchParams.get('sp_min');
  const spMax = url.searchParams.get('sp_max');
  const spNull = url.searchParams.get('sp_null'); // '1' 只看未估时
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50');

  let where = ['1=1'];
  let params: any[] = [];

  // 默认过滤已合并需求（include_merged=1 走审计可查）
  ensureDedupFields();
  if (url.searchParams.get('include_merged') !== '1') {
    where.push('r.merged_into IS NULL');
  }

  // 默认需求池：显示当前用户关联的需求（处理人/接收人/验证人/提出人）
  // 非管理员用户只看自己关联的需求，管理员看全部
  if (!isGlobalAdmin(user.roles)) {
    where.push('(r.handler_id = ? OR r.receiver_id = ? OR r.verifier_id = ? OR r.requester_name = ?)');
    params.push(user.id, user.id, user.id, user.display_name);
  }
  // DEBUG: 临时日志，确认过滤生效
  // eslint-disable-next-line no-console
  console.log('[requirements] currentUser:', user.id, user.username, 'handler_filter:', user.id);

  if (projectId) { where.push('r.project_id = ?'); params.push(projectId); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (priority) { where.push('r.priority = ?'); params.push(priority); }
  if (handlerId) { where.push('r.handler_id = ?'); params.push(handlerId); }
  if (receiverId) { where.push('r.receiver_id = ?'); params.push(receiverId); }
  if (category) { where.push('r.category = ?'); params.push(category); }
  if (search) {
    where.push('(r.title LIKE ? OR r.description LIKE ? OR r.business_unit LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (tag) {
    where.push('r.id IN (SELECT rt.requirement_id FROM requirement_tags rt JOIN tags t ON t.id = rt.tag_id WHERE t.name = ?)');
    params.push(tag);
  }
  // Story Point 过滤
  if (spNull === '1') {
    where.push('r.story_points IS NULL');
  } else {
    if (spMin) { where.push('r.story_points >= ?'); params.push(parseInt(spMin, 10)); }
    if (spMax) { where.push('r.story_points <= ?'); params.push(parseInt(spMax, 10)); }
  }

  // SLA 过滤：仅按"派生状态"过滤，状态值在应用层附加到每行
  // 注：避免在 SQL 里用 julianday() 以兼容 MySQL，改在应用层过滤
  const slaFilterMap: Record<string, string> = {
    approaching: 'approaching',
    overdue: 'overdue',
    escalated: 'escalated',
  };
  const wantSlaStatus = slaFilter && slaFilterMap[slaFilter];

  const countSql = `SELECT COUNT(*) as total FROM requirements r WHERE ${where.join(' AND ')}`;
  const total = ((await db.prepare(countSql).get(...params)) as any).total;

  const sql = `
    SELECT r.*,
      p.name as project_name,
      recv.display_name as receiver_name_display,
      hdl.display_name as handler_name_display,
      vrf.display_name as verifier_name_display,
      pr.title as parent_title
    FROM requirements r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN users recv ON recv.id = r.receiver_id
    LEFT JOIN users hdl ON hdl.id = r.handler_id
    LEFT JOIN users vrf ON vrf.id = r.verifier_id
    LEFT JOIN requirements pr ON pr.id = r.parent_id
    WHERE ${where.join(' AND ')}
    ORDER BY
      r.priority_rank,
      r.updated_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = (await db.prepare(sql).all(...params)) as any[];

  // Attach tags —— 批量查：一次 IN(...) 查所有行（避免 N+1）
  const stmtTags = db.prepare(`
    SELECT t.name, t.color FROM tags t
    JOIN requirement_tags rt ON rt.tag_id = t.id
    WHERE rt.requirement_id = ?
  `);

  // SLA 派生字段（应用层计算，避免 MySQL/SQLite 差异）
  ensureSlaTables();
  const slaCfg = getSlaConfig();

  // 批量查 helper：把 N+1 压成 2 次查询
  const buildLookups = async (rowSet: any[]): Promise<{ tags: Record<number, any[]>; warnings: Record<number, number> }> => {
    const tags: Record<number, any[]> = {};
    const warnings: Record<number, number> = {};
    if (rowSet.length === 0) return { tags, warnings };
    const ids = rowSet.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const tagRows = (await db.prepare(`
      SELECT rt.requirement_id as rid, t.name, t.color
      FROM requirement_tags rt JOIN tags t ON t.id = rt.tag_id
      WHERE rt.requirement_id IN (${placeholders})
    `).all(...ids)) as any[];
    for (const tr of tagRows) {
      (tags[tr.rid] ||= []).push({ name: tr.name, color: tr.color });
    }
    const warnRows = (await db.prepare(`
      SELECT requirement_id, COUNT(*) as c
      FROM sla_warnings WHERE requirement_id IN (${placeholders})
      GROUP BY requirement_id
    `).all(...ids)) as any[];
    for (const wr of warnRows) warnings[wr.requirement_id] = wr.c;
    return { tags, warnings };
  };

  let tagsByReq: Record<number, any[]> = {};
  let warningsByReq: Record<number, number> = {};
  ({ tags: tagsByReq, warnings: warningsByReq } = await buildLookups(rows));

  const enrichRow = (row: any) => {
    row.tags = tagsByReq[row.id] || [];
    const rules = getRulesForPriority(row.priority, slaCfg);
    const sla = computeSlaStatus(row.planned_start, row.planned_end, row.status, rules);
    row.sla_status = sla.status;
    row.sla_days_diff = sla.daysDiff;
    row.sla_warning_count = warningsByReq[row.id] || 0;
    // 估时派生字段
    row.sp_label = spToLabel(row.story_points);
    if (row.actual_hours != null && row.estimate_hours && row.estimate_hours > 0) {
      row.estimation_accuracy = Math.round((row.actual_hours / row.estimate_hours) * 100) / 100; // 1.0=准时，>1=超时
    } else {
      row.estimation_accuracy = null;
    }
  };

  for (const row of rows) {
    enrichRow(row);
  }

  // 应用层按 SLA 状态过滤（避免 MySQL/SQLite SQL 语法差异）
  // 策略：slaFilter 模式下拉全量(不带 LIMIT/OFFSET)、应用层过滤、然后重算分页
  let finalRows = rows;
  let finalTotal = total;
  if (wantSlaStatus) {
    // 重查全量：使用同一个 where 谓词但去掉 LIMIT/OFFSET（因为 where 是字符串拼接，sql 里没有 ?）
    const allSql = `
      SELECT r.*,
        p.name as project_name,
        recv.display_name as receiver_name_display,
        hdl.display_name as handler_name_display,
        vrf.display_name as verifier_name_display,
        pr.title as parent_title
      FROM requirements r
      LEFT JOIN projects p ON p.id = r.project_id
      LEFT JOIN users recv ON recv.id = r.receiver_id
      LEFT JOIN users hdl ON hdl.id = r.handler_id
      LEFT JOIN users vrf ON vrf.id = r.verifier_id
      LEFT JOIN requirements pr ON pr.id = r.parent_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        r.priority_rank,
        r.updated_at DESC
    `;
    const allRows = (await db.prepare(allSql).all()) as any[];
    // wantSlaStatus 分支也走批量查
    ({ tags: tagsByReq, warnings: warningsByReq } = await buildLookups(allRows));
    for (const r of allRows) {
      enrichRow(r);
    }
    const filtered = allRows.filter((r) => r.sla_status === wantSlaStatus);
    finalTotal = filtered.length;
    finalRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  }

  // 字段脱敏
  for (const r of finalRows) applyFieldPolicies('requirement', r, { id: user.id, roles: user.roles || [] });
  return NextResponse.json({ data: finalRows, total: finalTotal, page, pageSize });
}

/**
 * Story Point 转 T-shirt 标签（1=S, 2=S, 3=M, 5=L, 8=XL, 13=XXL, 21=XXXL）
 * 实现已抽到 @/lib/sp-badge
 */

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  // 首次调用时确保 estimation 字段已建（幂等，重复调无副作用）
  ensureEstimationFields();

  try {
    const body = await req.json();
    const {
      title, description, business_unit, priority, status,
      category, project_id, parent_id, requester_name,
      handler_id, verifier_id, benefit, planned_start, planned_end,
      story_points, estimate_hours, actual_hours,
      tags
    } = body;

    if (!title) return NextResponse.json({ error: '需求标题不能为空' }, { status: 400 });

    // Story Point 校验
    if (!isValidStoryPoints(story_points)) {
      const cfg = getEstimationConfig();
      return NextResponse.json({
        error: `Story Point 必须在允许值中：${cfg.spAllowValues.join(', ')}（可为空）`,
      }, { status: 400 });
    }
    if (estimate_hours != null && (isNaN(Number(estimate_hours)) || Number(estimate_hours) < 0)) {
      return NextResponse.json({ error: '估算工时必须为 ≥ 0 的数字' }, { status: 400 });
    }
    if (actual_hours != null && (isNaN(Number(actual_hours)) || Number(actual_hours) < 0)) {
      return NextResponse.json({ error: '实际工时必须为 ≥ 0 的数字' }, { status: 400 });
    }

    const db = getAsyncDb();
    const prio = priority || 'medium';
    const result = (await db.prepare(`
      INSERT INTO requirements (title, description, business_unit, priority, priority_rank, status, category,
        project_id, parent_id, requester_name, receiver_id, handler_id, verifier_id,
        benefit, planned_start, planned_end, story_points, estimate_hours, actual_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || '',
      business_unit || '',
      prio,
      syncPriorityRank(prio),
      status || 'received_not_evaluated',
      category || 'project',
      project_id || null,
      parent_id || null,
      requester_name || '',
      user.id,
      handler_id || null,
      verifier_id || null,
      benefit || '',
      planned_start || null,
      planned_end || null,
      story_points != null ? Number(story_points) : null,
      estimate_hours != null ? Number(estimate_hours) : null,
      actual_hours != null ? Number(actual_hours) : null
    ));

    const reqId = result.lastInsertRowid as number;

    // Log initial status
    (await db.prepare('INSERT INTO status_log (requirement_id, old_status, new_status, changed_by) VALUES (?, NULL, ?, ?)')
      .run(reqId, status || 'received_not_evaluated', user.id));

    // Tags
    if (tags && Array.isArray(tags)) {
      for (const tagName of tags) {
        (await db.prepare('INSERT IGNORE INTO tags (name) VALUES (?)').run(tagName));
        const t = (await db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)) as any;
        if (t) {
          (await db.prepare('INSERT IGNORE INTO requirement_tags (requirement_id, tag_id) VALUES (?, ?)').run(reqId, t.id));
        }
      }
    }

    logAudit(user.id, user.username, 'create_requirement', `创建需求: ${title} (ID: ${reqId})`);

    return NextResponse.json({ success: true, id: reqId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '创建失败' }, { status: 500 });
  }
}
