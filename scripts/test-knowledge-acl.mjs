#!/usr/bin/env node
/**
 * 知识分类 ACL 继承逻辑测试
 *
 * 为什么要有阳性对照：本项目历史上多次「自己写的检测器骗了自己」
 * （扫描器报 0 命中，实际是检测器坏了）。所以这里先验证测试本身能抓到 bug，
 * 再验证真实实现通过。
 *
 * 用法：node scripts/test-knowledge-acl.mjs
 */

// ---- 被测逻辑（与 src/lib/knowledge-acl-core.ts 保持一致）----
function computeDeniedCategoryIds(cats, granted) {
  const byId = new Map();
  for (const c of cats) byId.set(Number(c.id), c);
  const denied = [];
  for (const c of cats) {
    let cursor = c;
    let blocked = false;
    const seen = new Set();
    while (cursor && !seen.has(Number(cursor.id))) {
      seen.add(Number(cursor.id));
      if (Number(cursor.is_restricted) === 1 && !granted.has(Number(cursor.id))) {
        blocked = true;
        break;
      }
      cursor = cursor.parent_id != null ? byId.get(Number(cursor.parent_id)) : undefined;
    }
    if (blocked) denied.push(Number(c.id));
  }
  return denied;
}

// ---- 故意写坏的版本，用作阳性对照 ----
// 只看自身 is_restricted，不查祖先 —— 这正是「挂到受限父节点下即可绕过」的经典越权
function buggyDenied(cats, granted) {
  return cats
    .filter(c => Number(c.is_restricted) === 1 && !granted.has(Number(c.id)))
    .map(c => Number(c.id));
}

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify([...actual].sort((x, y) => x - y));
  const e = JSON.stringify([...expected].sort((x, y) => x - y));
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`); }
}

// ---- 用例 ----

// 场景 1：受限父 → 非受限子。子分类必须一起被拒（否则挂子节点即可绕过）
const tree1 = [
  { id: 1, parent_id: null, is_restricted: 1 },  // 机密
  { id: 2, parent_id: 1, is_restricted: 0 },     // 机密/子
  { id: 3, parent_id: null, is_restricted: 0 },  // 公开
];

console.log('\n=== 场景 1：继承（受限父 → 非受限子）===');
check('无授权 → 父与子都被拒', computeDeniedCategoryIds(tree1, new Set()), [1, 2]);
check('授权父 → 全部放行', computeDeniedCategoryIds(tree1, new Set([1])), []);
check('只授权子（不该生效）→ 父子仍被拒', computeDeniedCategoryIds(tree1, new Set([2])), [1, 2]);

// 场景 2：三层嵌套，中间层受限
const tree2 = [
  { id: 10, parent_id: null, is_restricted: 0 },
  { id: 11, parent_id: 10, is_restricted: 1 },
  { id: 12, parent_id: 11, is_restricted: 0 },
  { id: 13, parent_id: 12, is_restricted: 0 },
];
console.log('\n=== 场景 2：中间层受限，深层继承 ===');
check('孙、曾孙全被拒', computeDeniedCategoryIds(tree2, new Set()), [11, 12, 13]);
check('授权中间层 → 子树放行，根不受影响', computeDeniedCategoryIds(tree2, new Set([11])), []);

// 场景 3：多个受限祖先，只授权其中一个
const tree3 = [
  { id: 20, parent_id: null, is_restricted: 1 },
  { id: 21, parent_id: 20, is_restricted: 1 },
  { id: 22, parent_id: 21, is_restricted: 0 },
];
console.log('\n=== 场景 3：多重受限祖先 ===');
check('只授权外层 → 内层仍拒', computeDeniedCategoryIds(tree3, new Set([20])), [21, 22]);
check('两层都授权 → 放行', computeDeniedCategoryIds(tree3, new Set([20, 21])), []);

// 场景 4：脏数据成环，必须不死循环
const tree4 = [
  { id: 30, parent_id: 31, is_restricted: 0 },
  { id: 31, parent_id: 30, is_restricted: 0 },
];
console.log('\n=== 场景 4：parent 链成环（脏数据）===');
const t0 = Date.now();
check('不死循环且不误拒', computeDeniedCategoryIds(tree4, new Set()), []);
console.log(`      （耗时 ${Date.now() - t0}ms，未挂起）`);

// 场景 5：空分类表
console.log('\n=== 场景 5：边界 ===');
check('空表 → 无拒绝', computeDeniedCategoryIds([], new Set()), []);

// ---- 阳性对照：确认测试真的能抓到 bug ----
console.log('\n=== 阳性对照（验证测试本身有效）===');
const buggy = buggyDenied(tree1, new Set());
if (JSON.stringify(buggy.sort()) === JSON.stringify([1])) {
  console.log('  ✓ 坏实现漏掉了子分类 [2] —— 测试用例确实能抓到越权');
  pass++;
} else {
  console.log('  ✗ 阳性对照失效！测试用例区分不出好坏实现');
  fail++;
}
const buggy2 = buggyDenied(tree2, new Set());
if (!buggy2.includes(12) || !buggy2.includes(13)) {
  console.log('  ✓ 坏实现漏掉深层子树 —— 继承用例有效');
  pass++;
} else {
  console.log('  ✗ 阳性对照失效');
  fail++;
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
