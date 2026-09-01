#!/usr/bin/env node
/**
 * FTS5 查询转义测试（P5）
 *
 * 原实现是「字符白名单」：只保留 \w 与 CJK 基本区 U+4E00-U+9FA5。
 * 实测破坏：韩语整句变空串、日语片假名被吞、CJK 扩展区汉字被删、C++ → C。
 * 那不是「召回率损失」，是整类语言搜不了。
 *
 * 新实现是「分词 + 引号包裹」：FTS5 双引号内为字面短语，内部双引号双写转义。
 * 既隔绝 FTS5 语法，又一个字符不丢。
 *
 * 用法：node scripts/test-escape-fts.mjs
 */

// ---- 被测逻辑（与 src/lib/fts-migrations.ts 一致）----
function escapeFts(s) {
  if (!s) return '';
  const tokens = String(s).trim().split(/\s+/).filter(Boolean);
  const quoted = [];
  for (const token of tokens) {
    if (!/[\p{L}\p{N}\p{M}]/u.test(token)) continue;
    quoted.push(`"${token.replace(/"/g, '""')}"`);
  }
  return quoted.join(' ');
}

// ---- 旧实现，用作对照 ----
function oldEscapeFts(s) {
  if (!s) return '';
  return s.replace(/[^\w\u4e00-\u9fa5\s]/g, ' ').trim();
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

console.log('\n=== 中文（原本就能用，不能退化）===');
eq('单词', escapeFts('审批流'), '"审批流"');
eq('多词隐式 AND', escapeFts('权限 管理'), '"权限" "管理"');
eq('连续空白折叠', escapeFts('  权限   管理  '), '"权限" "管理"');

console.log('\n=== 旧实现搞坏的情形（本次修复目标）===');
ok('韩语不再变空串', escapeFts('한국어').includes('한국어'),
   `旧实现输出 ${JSON.stringify(oldEscapeFts('한국어'))}`);
ok('日语片假名保留', escapeFts('日本語テスト').includes('テスト'),
   `旧实现输出 ${JSON.stringify(oldEscapeFts('日本語テスト'))}`);
ok('CJK 扩展区汉字保留', escapeFts('鿯').includes('鿯'),
   `旧实现输出 ${JSON.stringify(oldEscapeFts('鿯'))}`);
ok('C++ 不被截断成 C', escapeFts('C++').includes('C++'),
   `旧实现输出 ${JSON.stringify(oldEscapeFts('C++'))}`);
ok('.NET 保留点号', escapeFts('.NET').includes('.NET'),
   `旧实现输出 ${JSON.stringify(oldEscapeFts('.NET'))}`);
ok('emoji 不影响相邻词', escapeFts('emoji 🚀 测试').includes('测试'));

console.log('\n=== FTS5 语法隔绝（防注入 / 防语法错误）===');
// 引号包裹后这些操作符全部失去语法含义，变成字面内容
for (const [name, input] of [
  ['AND', 'a AND b'],
  ['OR', 'a OR b'],
  ['NOT', 'a NOT b'],
  ['NEAR', 'NEAR(a b)'],
  ['前缀星号', 'abc*'],
  ['括号', '(a)'],
  ['列过滤冒号', 'title:secret'],
  ['插入符', '^abc'],
]) {
  const out = escapeFts(input);
  // 每个 token 都必须被引号包住，且不存在裸操作符
  const tokens = out.split(' ').filter(Boolean);
  const allQuoted = tokens.every(t => t.startsWith('"') && t.endsWith('"'));
  ok(`${name} 被包成字面短语`, allQuoted && tokens.length > 0, `输出 ${JSON.stringify(out)}`);
}

console.log('\n=== 双引号转义（最容易造成语法错误的字符）===');
eq('内部双引号双写', escapeFts('a"b'), '"a""b"');
eq('多个双引号', escapeFts('a""b'), '"a""""b"');
ok('引号数量为偶数（语法合法）',
   (escapeFts('say "hi" now').match(/"/g) || []).length % 2 === 0,
   `输出 ${JSON.stringify(escapeFts('say "hi" now'))}`);

console.log('\n=== 边界 ===');
eq('空串', escapeFts(''), '');
eq('纯空白', escapeFts('   '), '');
eq('纯标点（包引号会成空短语，须丢弃）', escapeFts('!!!'), '');
eq('纯标点混正常词', escapeFts('??? 测试'), '"测试"');
eq('undefined 安全', escapeFts(undefined), '');
eq('null 安全', escapeFts(null), '');
eq('数字保留', escapeFts('K8s 3.14'), '"K8s" "3.14"');

console.log('\n=== 阳性对照（确认测试能抓到旧实现的 bug）===');
ok('旧实现确实把韩语变空串', oldEscapeFts('한국어') === '');
ok('旧实现确实吞掉片假名', oldEscapeFts('日本語テスト') === '日本語');
ok('旧实现确实把 C++ 截成 C', oldEscapeFts('C++') === 'C');
ok('旧实现确实删掉 CJK 扩展字', !oldEscapeFts('鿯').includes('鿯'));

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
