/**
 * 知识沉淀门禁 · 纯逻辑（P6）
 *
 * 与 knowledge-capture.ts 分开：这里零依赖（不碰 db、不碰 auth），
 * 才能在 scripts/*.mjs 里直接复刻测试。knowledge-acl-core.ts 同样套路。
 */

export type CaptureGate = 'off' | 'warn' | 'block';

/** 触发沉淀检查的需求状态 —— 与 PUT 里 AC 门禁用的那组保持一致 */
export const CLOSING_STATUSES = ['completed', 'verified', 'closed'] as const;

export function isClosingStatus(status: unknown): boolean {
  return typeof status === 'string' && (CLOSING_STATUSES as readonly string[]).includes(status);
}

export function normalizeGate(raw: unknown): CaptureGate {
  return raw === 'off' || raw === 'block' ? raw : 'warn';
}

/**
 * 沉淀线索的有效字数。
 *
 * 三个字段合计而非逐个判断：有人写详细 solution、有人只写 lessons_learned，
 * 强制每个都填只会逼出「无」「见上」这类垃圾内容。
 *
 * 去掉空白再计数 —— 否则填一堆空格/换行就能蒙过去。
 */
export function captureCharCount(r: {
  solution?: unknown;
  lessons_learned?: unknown;
  root_cause?: unknown;
}): number {
  let n = 0;
  for (const v of [r?.solution, r?.lessons_learned, r?.root_cause]) {
    if (typeof v === 'string') n += v.replace(/\s+/g, '').length;
  }
  return n;
}

export interface CaptureDecision {
  /** 是否放行本次状态变更 */
  allow: boolean;
  /** 是否需要建沉淀待办 */
  needTask: boolean;
  /** 给用户看的提示；allow=false 时是拒绝原因 */
  message: string | null;
  /** 已满足沉淀要求 */
  satisfied: boolean;
}

/**
 * 判定一次「需求转入关闭态」是否放行。
 *
 * @param nextStatus     本次要改成的状态（未改状态则传 undefined）
 * @param prevStatus     改之前的状态
 * @param gate           off|warn|block
 * @param minChars       有效沉淀最小字数
 * @param charCount      实际沉淀字数
 * @param hasEntry       是否已有关联知识条目
 * @param waiverReason   豁免理由（block 模式下的出口）
 */
export function decideCaptureGate(params: {
  nextStatus?: unknown;
  prevStatus?: unknown;
  gate: CaptureGate;
  minChars: number;
  charCount: number;
  hasEntry: boolean;
  waiverReason?: unknown;
}): CaptureDecision {
  const { nextStatus, prevStatus, gate, minChars, charCount, hasEntry } = params;

  const pass: CaptureDecision = { allow: true, needTask: false, message: null, satisfied: false };

  if (gate === 'off') return pass;

  // 只在「本次真的从非关闭态转入关闭态」时触发。
  // 已经是 completed 的需求再改别的字段不该反复弹提示。
  if (!isClosingStatus(nextStatus)) return pass;
  if (isClosingStatus(prevStatus)) return pass;

  // 已有关联知识条目 = 已经沉淀过，直接过
  if (hasEntry) return { allow: true, needTask: false, message: null, satisfied: true };

  const enough = charCount >= minChars;
  if (enough) return { allow: true, needTask: false, message: null, satisfied: true };

  const waiver = typeof params.waiverReason === 'string' ? params.waiverReason.trim() : '';
  const shortfall = `当前有效沉淀 ${charCount} 字，要求至少 ${minChars} 字`;

  if (gate === 'block') {
    // 豁免理由本身也要有内容，否则填个空格就绕过了，门禁等于没有
    if (waiver.length >= 5) {
      return {
        allow: true,
        needTask: true,
        message: `已记录豁免理由，需求关闭放行（${shortfall}）`,
        satisfied: false,
      };
    }
    return {
      allow: false,
      needTask: false,
      message: `需求关闭前请补充解决方案/经验总结/根因分析（${shortfall}）；确实无需沉淀请填写豁免理由（capture_waiver_reason，至少 5 字）`,
      satisfied: false,
    };
  }

  // warn：放行但留待办，不拦人
  return {
    allow: true,
    needTask: true,
    message: `需求已关闭，但知识沉淀不足（${shortfall}），已加入沉淀待办`,
    satisfied: false,
  };
}
