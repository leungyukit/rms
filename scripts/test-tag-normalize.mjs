#!/usr/bin/env node
/**
 * 标签归一化测试（P3）
 *
 * 归一化键决定「哪两个标签算同一个」，判错了会造成
 * 重复标签（该合的没合）或错误合并（不该合的合了）。后者更糟 —— 会串数据。
 *
 * 逻辑与 src/lib/tag-normalize.ts 保持一致。
 * 用法：node scripts/test-tag-normalize.mjs
 */

// ---- 被测逻辑 ----
function toHalfWidth(s) {
  return String(s)
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}
function normalizeTagKey(raw) {
  if (!raw) return '';
  return toHalfWidth(raw).trim().replace(/\s+/g, ' ').toLowerCase();
}
function cleanTagName(raw) {
  if (!raw) return '';
  return toHalfWidth(raw).trim().replace(/\s+/g, ' ');
}
function isValidTagName(raw) {
  const c = cleanTagName(raw);
  if (c.length === 0) return false;
  if (c.length > 50) return false;
  if (/[,;]/.test(c)) return false;
  return true;
}
function dedupeTags(raws) {
  if (!Array.isArray(raws)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of raws) {
    if (typeof raw !== 'string') continue;
    if (!isValidTagName(raw)) continue;
    const key = normalizeTagKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: cleanTagName(raw), key });
  }
  return out;
}

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`); }
}

console.log('\n=== 该折叠的（同一标签的等价变体）===');
eq('首尾空白', normalizeTagKey('权限管理 '), normalizeTagKey('权限管理'));
eq('全角空格', normalizeTagKey('权限管理\u3000'), normalizeTagKey('权限管理'));
eq('内部连续空白', normalizeTagKey('性能  优化'), normalizeTagKey('性能 优化'));
eq('ASCII 大小写', normalizeTagKey('MySQL'), normalizeTagKey('mysql'));
eq('全角字母 → 半角', normalizeTagKey('ＳＬＡ'), normalizeTagKey('SLA'));
eq('制表符视同空白', normalizeTagKey('前端\t优化'), normalizeTagKey('前端 优化'));

console.log('\n=== 不该折叠的（语义不同，合并会串数据）===');
function ne(name, a, b) {
  if (normalizeTagKey(a) !== normalizeTagKey(b)) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} —— 误合并了 "${a}" 与 "${b}"`); }
}
ne('简繁体不合并', '性能优化', '性能優化');
ne('同义词不合并', '前端', 'frontend');
ne('中文不受 lowercase 影响', '性能', '性能优化');
ne('空格位置有意义', '前端 优化', '前端优化');

console.log('\n=== 显示名保留原样 ===');
eq('保留大小写', cleanTagName('MySQL'), 'MySQL');
eq('保留中文', cleanTagName('  权限管理  '), '权限管理');
eq('全角字母转半角但不改大小写', cleanTagName('ＳＬＡ'), 'SLA');

console.log('\n=== 合法性校验 ===');
eq('空串非法', isValidTagName(''), false);
eq('纯空白非法', isValidTagName('   '), false);
eq('含逗号非法（会破坏标签串展示）', isValidTagName('a,b'), false);
eq('含分号非法', isValidTagName('a;b'), false);
eq('超长非法', isValidTagName('x'.repeat(51)), false);
eq('50 字合法', isValidTagName('x'.repeat(50)), true);
eq('正常中文合法', isValidTagName('权限管理'), true);

console.log('\n=== 去重（保留首次出现的显示名）===');
eq('变体去重', dedupeTags(['MySQL', 'mysql', 'MYSQL']), [{ name: 'MySQL', key: 'mysql' }]);
eq('空白变体去重', dedupeTags(['权限管理', '权限管理 ', '\u3000权限管理']), [{ name: '权限管理', key: '权限管理' }]);
eq('过滤非法项', dedupeTags(['正常', '', '  ', 'a,b', null, 123, '另一个']),
  [{ name: '正常', key: '正常' }, { name: '另一个', key: '另一个' }]);
eq('非数组返回空', dedupeTags('not-an-array'), []);
eq('保序', dedupeTags(['B', 'A', 'C']).map(t => t.name), ['B', 'A', 'C']);

console.log('\n=== 阳性对照（确认测试能抓到坏实现）===');
// 坏实现：只 trim + lowercase，不折叠内部空白与全角字符
//
// ⚠️ 这里踩过一次坑：最初用「末尾全角空格」做对照，结果对照失效 ——
// 因为 JS 的 trim() 本身就剥离 U+3000（它属于 Unicode 空白），坏实现恰好也能过。
// 那是测试写错不是实现写错。改用真正能区分好坏的情形：
// 全角字母（trim 管不着）、内部连续空白（trim 只管首尾）。
const buggy = raw => String(raw).trim().toLowerCase();

if (buggy('ＳＬＡ') !== buggy('SLA')) {
  console.log('  ✓ 坏实现漏掉全角字母折叠 —— 用例有效'); pass++;
} else { console.log('  ✗ 阳性对照失效'); fail++; }

if (buggy('性能  优化') !== buggy('性能 优化')) {
  console.log('  ✓ 坏实现漏掉内部连续空白折叠 —— 用例有效'); pass++;
} else { console.log('  ✗ 阳性对照失效'); fail++; }

if (buggy('前端\u3000优化') !== buggy('前端 优化')) {
  console.log('  ✓ 坏实现漏掉「内部」全角空格（trim 只管首尾）—— 用例有效'); pass++;
} else { console.log('  ✗ 阳性对照失效'); fail++; }

// 坏实现2：连中文也想「折叠」，把空格全删 —— 会误合并
const buggy2 = raw => String(raw).replace(/\s/g, '').toLowerCase();
if (buggy2('前端 优化') === buggy2('前端优化')) {
  console.log('  ✓ 「空格全删」式实现会误合并 —— 已被本测试排除'); pass++;
} else { console.log('  ✗ 阳性对照失效'); fail++; }

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
