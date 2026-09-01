#!/usr/bin/env node
/**
 * 知识沉淀门禁测试（P6）
 *
 * 现状数据：33 条需求里只有 6 条填了 solution，
 * lessons_learned 与 root_cause 全是 0 —— 沉淀字段形同虚设。
 *
 * 门禁最容易写错的三处，全部在此覆盖：
 *   1. 触发时机（只在「转入」关闭态时触发，已关闭的改别的字段不该反复弹）
 *   2. 绕过路径（填空格蒙字数、填空豁免理由绕 block）
 *   3. off/warn/block 三档语义不能串
 *
 * 逻辑与 src/lib/knowledge-capture-core.ts 一致。
 * 用法：node scripts/test-capture-gate.mjs
 */

// ---- 被测逻辑 ----
const CLOSING_STATUSES = ['completed', 'verified', 'closed'];
const isClosingStatus = s => typeof s === 'string' && CLOSING_STATUSES.includes(s);
const normalizeGate = raw => (raw === 'off' || raw === 'block' ? raw : 'warn');

function captureCharCount(r) {
  let n = 0;
  for (const v of [r?.solution, r?.lessons_learned, r?.root_cause]) {
    if (typeof v === 'string') n += v.replace(/\s+/g, '').length;
  }
  return n;
}

function decideCaptureGate(params) {
  const { nextStatus, prevStatus, gate, minChars, charCount, hasEntry } = params;
  const pass = { allow: true, needTask: false, message: null, satisfied: false };
  if (gate === 'off') return pass;
  if (!isClosingStatus(nextStatus)) return pass;
  if (isClosingStatus(prevStatus)) return pass;
  if (hasEntry) return { allow: true, needTask: false, message: null, satisfied: true };
  const enough = charCount >= minChars;
  if (enough) return { allow: true, needTask: false, message: null, satisfied: true };
  const waiver = typeof params.waiverReason === 'string' ? params.waiverReason.trim() : '';
  if (gate === 'block') {
    if (waiver.length >= 5) return { allow: true, needTask: true, message: 'waived', satisfied: false };
    return { allow: false, needTask: false, message: 'blocked', satisfied: false };
  }
  return { allow: true, needTask: true, message: 'warned', satisfied: false };
}

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}
const D = o => decideCaptureGate({ minChars: 30, charCount: 0, hasEntry: false, ...o });

console.log('\n=== 触发时机（最容易写错的地方）===');
ok('非关闭态 → 不触发',
  D({ gate: 'block', prevStatus: 'in_progress', nextStatus: 'scheduled' }).allow === true);
ok('转入 completed → 触发',
  D({ gate: 'block', prevStatus: 'in_progress', nextStatus: 'completed' }).allow === false);
ok('转入 verified → 触发',
  D({ gate: 'block', prevStatus: 'in_progress', nextStatus: 'verified' }).allow === false);
ok('转入 closed → 触发',
  D({ gate: 'block', prevStatus: 'in_progress', nextStatus: 'closed' }).allow === false);
ok('已 completed 再改别的字段 → 不重复触发（关键：否则每次保存都弹）',
  D({ gate: 'block', prevStatus: 'completed', nextStatus: 'completed' }).allow === true);
ok('completed → closed 不重复触发（已经在关闭态内流转）',
  D({ gate: 'block', prevStatus: 'completed', nextStatus: 'closed' }).allow === true);
ok('未改状态（nextStatus undefined）→ 不触发',
  D({ gate: 'block', prevStatus: 'in_progress', nextStatus: undefined }).allow === true);

console.log('\n=== 三档门禁语义 ===');
const closing = { prevStatus: 'in_progress', nextStatus: 'completed' };
ok('off：放行且不建待办',
  (r => r.allow === true && r.needTask === false)(D({ ...closing, gate: 'off' })));
ok('warn：放行但建待办',
  (r => r.allow === true && r.needTask === true)(D({ ...closing, gate: 'warn' })));
ok('block：拦截且不建待办（没放行就没必要留待办）',
  (r => r.allow === false && r.needTask === false)(D({ ...closing, gate: 'block' })));
ok('未知门禁值按 warn 兜底', normalizeGate('bogus') === 'warn');
ok('空值按 warn 兜底', normalizeGate(undefined) === 'warn');
ok('off/block 正常识别', normalizeGate('off') === 'off' && normalizeGate('block') === 'block');

console.log('\n=== 满足条件时放行 ===');
ok('字数够 → 放行且标记 satisfied',
  (r => r.allow === true && r.needTask === false && r.satisfied === true)(
    D({ ...closing, gate: 'block', charCount: 30 })));
ok('刚好等于阈值算够（边界）',
  D({ ...closing, gate: 'block', minChars: 30, charCount: 30 }).satisfied === true);
ok('差一个字不算够（边界）',
  D({ ...closing, gate: 'block', minChars: 30, charCount: 29 }).allow === false);
ok('已有关联知识条目 → 直接放行（已经沉淀过）',
  (r => r.allow === true && r.satisfied === true)(
    D({ ...closing, gate: 'block', charCount: 0, hasEntry: true })));

console.log('\n=== 绕过路径必须堵住 ===');
ok('纯空格填不满字数（去空白后为 0）',
  captureCharCount({ solution: '                                     ' }) === 0);
ok('换行/制表符同样不算字数',
  captureCharCount({ solution: '\n\n\t\t   \n' }) === 0);
ok('空豁免理由不能绕过 block',
  D({ ...closing, gate: 'block', waiverReason: '' }).allow === false);
ok('纯空格豁免理由不能绕过 block',
  D({ ...closing, gate: 'block', waiverReason: '     ' }).allow === false);
ok('过短豁免理由（4 字）不能绕过 block',
  D({ ...closing, gate: 'block', waiverReason: '没必要' }).allow === false);
ok('有效豁免理由（≥5 字）放行但留痕建待办',
  (r => r.allow === true && r.needTask === true)(
    D({ ...closing, gate: 'block', waiverReason: '纯配置变更无需沉淀' })));
ok('非字符串豁免理由不能绕过',
  D({ ...closing, gate: 'block', waiverReason: 12345 }).allow === false);

console.log('\n=== 字数统计 ===');
ok('三字段合计（不强制每个都填）',
  captureCharCount({ solution: '一二三', lessons_learned: '四五', root_cause: '六' }) === 6);
ok('只填一个字段也算',
  captureCharCount({ lessons_learned: '一二三四五' }) === 5);
ok('内部空白不计入',
  captureCharCount({ solution: '一 二 三' }) === 3);
ok('null/undefined 安全',
  captureCharCount({ solution: null, lessons_learned: undefined }) === 0);
ok('非字符串忽略',
  captureCharCount({ solution: 123, lessons_learned: {} }) === 0);
ok('空对象安全', captureCharCount({}) === 0);

console.log('\n=== 阳性对照（确认测试能抓到坏实现）===');
// 坏实现1：不判 prevStatus → 已关闭的需求每次保存都触发
const buggyNoPrev = p => isClosingStatus(p.nextStatus) && !p.hasEntry;
ok('不判 prevStatus 的实现会重复触发',
  buggyNoPrev({ nextStatus: 'completed', prevStatus: 'completed', hasEntry: false }) === true);
// 坏实现2：不去空白 → 一串空格就能蒙过字数
const buggyRawLen = r => (typeof r.solution === 'string' ? r.solution.length : 0);
ok('不去空白的实现会被空格蒙过',
  buggyRawLen({ solution: ' '.repeat(40) }) >= 30 && captureCharCount({ solution: ' '.repeat(40) }) === 0);
// 坏实现3：豁免理由只判非空 → 填一个空格就绕过
const buggyWaiver = w => typeof w === 'string' && w.length > 0;
ok('豁免理由只判非空会被单个空格绕过',
  buggyWaiver(' ') === true && D({ ...closing, gate: 'block', waiverReason: ' ' }).allow === false);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
