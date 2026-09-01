#!/usr/bin/env node
/**
 * MySQL BOOLEAN MODE 转义测试（P5）
 *
 * 修的两个真实缺陷（均 SQL 实测复现，见 memory/2026-09-01.md）：
 *   1. 单字 0 召回：搜「流」MATCH 命中 0 条，LIKE 有 5 条（ngram_token_size=2 不索引单字）
 *   2. 多字精度崩：搜「需求池」NATURAL LANGUAGE MODE 返 17 条，真正包含的只有 1 条
 *      （bigram 切成「需求」+「求池」再 OR，把所有含「需求」的都捞进来）
 *
 * 用法：node scripts/test-escape-fts-mysql.mjs
 */

// ---- 被测逻辑（与 src/lib/fts-migrations.ts 的 escapeFtsMySQL 一致）----
function escapeFtsMySQL(s) {
  if (!s) return '';
  const tokens = String(s).trim().split(/\s+/).filter(Boolean);
  const parts = [];
  for (const token of tokens) {
    if (!/[\p{L}\p{N}\p{M}]/u.test(token)) continue;
    if (token.length <= 1) continue;
    parts.push(`+"${token.replace(/"/g, '""')}"`);
  }
  return parts.join(' ');
}

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`); }
}
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

console.log('\n=== 短语包裹（修多字精度崩）===');
eq('单个多字词', escapeFtsMySQL('需求池'), '+"需求池"');
eq('两个词是 AND 语义', escapeFtsMySQL('需求 性能'), '+"需求" +"性能"');
eq('连续空白折叠', escapeFtsMySQL('  需求   性能  '), '+"需求" +"性能"');
eq('英文词', escapeFtsMySQL('SLA'), '+"SLA"');

console.log('\n=== 单字符 token 丢弃（ngram_token_size=2 不索引，留着也搜不到）===');
eq('纯单字 → 空串（上层走 LIKE）', escapeFtsMySQL('流'), '');
eq('单字母 → 空串', escapeFtsMySQL('K'), '');
eq('多字词 + 单字 → 只留多字词', escapeFtsMySQL('需求 流'), '+"需求"');
ok('空串意味着上层必须走 LIKE 兜底', escapeFtsMySQL('流') === '');

console.log('\n=== 双引号转义（防语法错误 / 防注入）===');
eq('内部双引号双写', escapeFtsMySQL('a"b'), '+"a""b"');
ok('引号总数为偶数（语法合法）',
   (escapeFtsMySQL('say "hi" now').match(/"/g) || []).length % 2 === 0,
   `输出 ${JSON.stringify(escapeFtsMySQL('say "hi" now'))}`);

console.log('\n=== BOOLEAN MODE 操作符被当字面量（引号内无语法含义）===');
for (const [name, input] of [
  ['减号排除', '需求 -性能'],
  ['星号通配', '需求池*'],
  ['波浪号', '需求 ~性能'],
  ['@距离符', '需求 @5'],
  ['括号分组', '(需求池)'],
  ['大于小于号', '需求 >性能 <bug'],
]) {
  const out = escapeFtsMySQL(input);
  const parts = out.split(' ').filter(Boolean);
  // 每个片段必须是 +"..." 形式，不能有裸操作符
  const allWrapped = parts.every(p => /^\+"[\s\S]*"$/.test(p));
  ok(`${name} 被包成字面短语`, allWrapped, `输出 ${JSON.stringify(out)}`);
}

console.log('\n=== 多语种不丢字符（对比旧字符白名单实现）===');
const oldWhitelist = s => !s ? '' : s.replace(/[^\w\u4e00-\u9fa5\s]/g, ' ').trim();
ok('韩语保留', escapeFtsMySQL('한국어').includes('한국어'),
   `旧实现输出 ${JSON.stringify(oldWhitelist('한국어'))}`);
ok('日语片假名保留', escapeFtsMySQL('テスト').includes('テスト'),
   `旧实现输出 ${JSON.stringify(oldWhitelist('テスト'))}`);
ok('C++ 保留', escapeFtsMySQL('C++').includes('C++'),
   `旧实现输出 ${JSON.stringify(oldWhitelist('C++'))}`);

console.log('\n=== 边界 ===');
eq('空串', escapeFtsMySQL(''), '');
eq('纯空白', escapeFtsMySQL('   '), '');
eq('纯标点', escapeFtsMySQL('!!!'), '');
eq('undefined', escapeFtsMySQL(undefined), '');
eq('null', escapeFtsMySQL(null), '');

console.log('\n=== 阳性对照（确认测试能抓到坏实现）===');
// 坏实现1：不加引号 → bigram 被 OR 拆开，精度崩（这就是修复前的行为）
const buggyNoQuote = s => String(s).trim().split(/\s+/).join(' ');
ok('不加引号的实现无法产生短语匹配', !buggyNoQuote('需求池').includes('"'));
// 坏实现2：不丢单字 → 生成 +"流"，MySQL 实测命中 0（假装能搜其实搜不到）
const buggyKeepSingle = s => String(s).trim().split(/\s+/).map(t => `+"${t}"`).join(' ');
ok('保留单字的实现会生成永远 0 命中的条件', buggyKeepSingle('流') === '+"流"');
// 坏实现3：不转义双引号 → 引号数为奇数，MySQL 语法错误
const buggyNoEscape = s => String(s).trim().split(/\s+/).map(t => `+"${t}"`).join(' ');
ok('不转义双引号会产生奇数引号（语法错误）',
   (buggyNoEscape('a"b').match(/"/g) || []).length % 2 === 1);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
