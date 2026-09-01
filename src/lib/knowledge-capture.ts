/**
 * 知识沉淀门禁 · DB 层（P6）
 *
 * 纯判定逻辑在 knowledge-capture-core.ts，这里只负责读配置、查关联、建待办。
 */
import { getAsyncDb } from './db';
import { ensureKnowledgeTables } from './knowledge-migrations';
import {
  decideCaptureGate,
  normalizeGate,
  captureCharCount,
  isClosingStatus,
  type CaptureDecision,
  type CaptureGate,
} from './knowledge-capture-core';

type AsyncDb = ReturnType<typeof getAsyncDb>;

/** 读门禁配置。读不到一律按 warn —— 提醒但不拦人，是最安全的默认值 */
export async function getCaptureConfig(db: AsyncDb): Promise<{ gate: CaptureGate; minChars: number }> {
  let gate: CaptureGate = 'warn';
  let minChars = 30;

  try {
    const rows = (await db.prepare(
      "SELECT `key` AS k, `value` AS v FROM system_config WHERE `key` IN ('knowledge_capture_gate','knowledge_capture_min_chars')"
    ).all()) as any[];
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r.k === 'knowledge_capture_gate') gate = normalizeGate(r.v);
      if (r.k === 'knowledge_capture_min_chars') {
        const n = parseInt(String(r.v), 10);
        if (Number.isFinite(n) && n >= 0) minChars = n;
      }
    }
  } catch {
    // 配置表缺失不该让需求改不了状态
  }

  return { gate, minChars };
}

/** 该需求是否已经沉淀出知识条目 */
async function hasKnowledgeEntry(db: AsyncDb, requirementId: number): Promise<boolean> {
  try {
    const row = (await db.prepare(
      'SELECT id FROM knowledge_entries WHERE source_requirement_id = ? LIMIT 1'
    ).get(requirementId)) as any;
    return !!row;
  } catch {
    return false;
  }
}

/**
 * 需求状态即将变更时的沉淀门禁检查。
 *
 * 在 requirements PUT 更新落库**之前**调用：block 模式要能挡住。
 */
export async function checkCaptureGate(params: {
  db: AsyncDb;
  requirementId: number;
  prevStatus: unknown;
  nextStatus: unknown;
  /** 合并后的沉淀字段值（body 优先，未传则用库里现值） */
  solution?: unknown;
  lessons_learned?: unknown;
  root_cause?: unknown;
  waiverReason?: unknown;
}): Promise<CaptureDecision> {
  const { db, requirementId, prevStatus, nextStatus } = params;

  // 不是转入关闭态就别做多余查询
  if (!isClosingStatus(nextStatus) || isClosingStatus(prevStatus)) {
    return { allow: true, needTask: false, message: null, satisfied: false };
  }

  ensureKnowledgeTables();
  const { gate, minChars } = await getCaptureConfig(db);
  if (gate === 'off') {
    return { allow: true, needTask: false, message: null, satisfied: false };
  }

  return decideCaptureGate({
    nextStatus,
    prevStatus,
    gate,
    minChars,
    charCount: captureCharCount(params),
    hasEntry: await hasKnowledgeEntry(db, requirementId),
    waiverReason: params.waiverReason,
  });
}

/**
 * 建/更新沉淀待办。
 *
 * requirement_id 上有 UNIQUE：反复切状态不会刷出重复待办。
 * 已存在且已完成的待办不回退成 pending —— 沉淀过就是沉淀过。
 */
export async function upsertCaptureTask(params: {
  db: AsyncDb;
  requirementId: number;
  triggerStatus: unknown;
  createdBy: number | null;
  waiverReason?: unknown;
}): Promise<void> {
  const { db, requirementId, triggerStatus, createdBy } = params;
  const waiver = typeof params.waiverReason === 'string' ? params.waiverReason.trim() : '';

  ensureKnowledgeTables();

  const existing = (await db.prepare(
    'SELECT id, status FROM knowledge_capture_tasks WHERE requirement_id = ?'
  ).get(requirementId)) as any;

  // 豁免也要留痕，否则「谁批准跳过的」查不到
  const status = waiver.length >= 5 ? 'waived' : 'pending';

  if (existing) {
    if (existing.status === 'done') return;
    (await db.prepare(`
      UPDATE knowledge_capture_tasks
      SET status = ?, trigger_status = ?, waiver_reason = ?,
          resolved_by = ?, resolved_at = ${status === 'waived' ? 'CURRENT_TIMESTAMP' : 'NULL'}
      WHERE id = ?
    `).run(
      status,
      typeof triggerStatus === 'string' ? triggerStatus : null,
      waiver || null,
      status === 'waived' ? createdBy : null,
      existing.id
    ));
    return;
  }

  (await db.prepare(`
    INSERT INTO knowledge_capture_tasks
      (requirement_id, status, trigger_status, waiver_reason, created_by, resolved_by, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ${status === 'waived' ? 'CURRENT_TIMESTAMP' : 'NULL'})
  `).run(
    requirementId,
    status,
    typeof triggerStatus === 'string' ? triggerStatus : null,
    waiver || null,
    createdBy,
    status === 'waived' ? createdBy : null
  ));
}

/** 沉淀完成时关掉待办（知识条目创建后调用） */
export async function resolveCaptureTask(params: {
  db: AsyncDb;
  requirementId: number;
  knowledgeEntryId: number;
  resolvedBy: number | null;
}): Promise<void> {
  const { db, requirementId, knowledgeEntryId, resolvedBy } = params;
  ensureKnowledgeTables();

  try {
    (await db.prepare(`
      UPDATE knowledge_capture_tasks
      SET status = 'done', knowledge_entry_id = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE requirement_id = ?
    `).run(knowledgeEntryId, resolvedBy, requirementId));
  } catch {
    // 沉淀待办关不掉不该让知识条目创建失败
  }
}
