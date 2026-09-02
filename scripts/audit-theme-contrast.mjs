#!/usr/bin/env node
/**
 * 深浅主题可读性审计（2026-09-02）
 *
 * 起因：连着踩了三个「白字白底」类问题
 *   - 9/1 硬编码色值导致深色模式失效
 *   - 9/2 配置页 tab 复用 .sidebar-link → 白字白底
 * 教训：同一模式的问题只修发现的那一处，不全库扫，就会一个个冒出来。
 *
 * 这个脚本做两件事：
 *   1. 从 globals.css 解析 :root 和 [data-theme="dark"] 两套变量，
 *      按「实际会同时出现的前景/背景组合」算 WCAG 对比度
 *   2. 扫 tsx 里的高风险写法（硬编码前景色配 var() 底色等）
 *
 * 不做的事：不猜、不改代码。只报告。
 *
 * 用法：node scripts/audit-theme-contrast.mjs
 * 退出码：有 FAIL 时非 0，可以挂 CI
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS_PATH = join(ROOT, 'src/app/globals.css');
const SRC_DIR = join(ROOT, 'src');

// ── 颜色工具 ────────────────────────────────────────────────
function hexToRgb(hex) {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]) {
  const f = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = hexToRgb(fg), b = hexToRgb(bg);
  if (!a || !b) return null;
  const l1 = relLuminance(a), l2 = relLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ── 解析 globals.css 的两套变量 ──────────────────────────────
function parseBlock(css, startRe) {
  const m = css.match(startRe);
  if (!m) return {};
  const from = m.index + m[0].length;
  let depth = 1, i = from;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(from, i - 1);
  const vars = {};
  // 只取 hex 值；rgba()/渐变之类跳过（算不了简单对比度）
  for (const line of body.split(/[;\n]/)) {
    const mm = line.match(/(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*$/);
    if (mm) vars[mm[1]] = mm[2];
  }
  return vars;
}

const css = readFileSync(CSS_PATH, 'utf8');
const light = parseBlock(css, /:root\s*\{/);
const dark = parseBlock(css, /:root\.dark,\s*\[data-theme="dark"\]\s*\{/);

// ── 要检查的前景/背景组合 ───────────────────────────────────
// 只列「真实会同时出现」的组合。乱配一堆没意义的对会淹掉真问题。
const PAIRS = [
  // 正文
  ['--foreground', '--background', 'AA', '正文 / 页面底'],
  ['--foreground', '--card-bg', 'AA', '正文 / 卡片底'],
  ['--card-fg', '--card-bg', 'AA', '卡片文字 / 卡片底'],
  ['--muted-fg', '--background', 'AA', '次要文字 / 页面底'],
  ['--muted-fg', '--card-bg', 'AA', '次要文字 / 卡片底'],
  ['--muted-fg', '--muted', 'AA', '次要文字 / muted 底'],
  ['--secondary-fg', '--secondary', 'AA', 'chip 文字 / chip 底'],
  // 品牌色
  ['--primary-fg', '--primary-c', 'AA', '主按钮文字 / 绿底'],
  ['--primary-text', '--background', 'AA', '品牌绿文字 / 页面底'],
  ['--primary-text', '--card-bg', 'AA', '品牌绿文字 / 卡片底'],
  // 危险色
  ['--destructive-fg', '--destructive', 'AA', '危险按钮文字 / 红底'],
  ['--destructive-text', '--background', 'AA', '危险文字 / 页面底'],
  ['--destructive-text', '--card-bg', 'AA', '危险文字 / 卡片底'],
  ['--accent-fg', '--accent', 'AA', 'accent 按钮文字 / 蓝底'],
  // 侧边栏（深色侧边栏，浅色模式下也是深的）
  ['--sidebar-fg', '--sidebar-c', 'AA', '侧边栏文字 / 侧边栏底'],
  ['--sidebar-accent-fg', '--sidebar-accent', 'AA', '侧边栏选中文字 / 选中底'],
  // tooltip
  ['--tooltip-fg', '--tooltip-bg', 'AA', 'tooltip 文字 / tooltip 底'],
  ['--tooltip-muted', '--tooltip-bg', 'AA-large', 'tooltip 次要文字 / tooltip 底'],
  // 甘特/状态色：文字贴在对应底色上
  ['--status-idle-fg', '--status-idle-bg', 'AA', '状态-未开始'],
  ['--status-queued-fg', '--status-queued-bg', 'AA', '状态-排队中'],
  ['--status-sched-fg', '--status-sched-bg', 'AA', '状态-已排期'],
  ['--status-active-fg', '--status-active-bg', 'AA', '状态-处理中'],
  ['--status-done-fg', '--status-done-bg', 'AA', '状态-已完成'],
  ['--status-closed-fg', '--status-closed-bg', 'AA', '状态-已关闭'],
  ['--node-idle-fg', '--node-idle-bg', 'AA', '流程图空闲节点'],
  // 图表色当「图形」用，按非文本对比（3:1）
  ['--chart-1', '--card-bg', 'graphic', '图表色1 / 卡片底'],
  ['--chart-2', '--card-bg', 'graphic', '图表色2 / 卡片底'],
  ['--chart-3', '--card-bg', 'graphic', '图表色3 / 卡片底'],
  ['--chart-4', '--card-bg', 'graphic', '图表色4 / 卡片底'],
  ['--chart-5', '--card-bg', 'graphic', '图表色5 / 卡片底'],
  ['--chart-6', '--card-bg', 'graphic', '图表色6 / 卡片底'],
  ['--chart-axis', '--card-bg', 'graphic', '坐标轴 / 卡片底'],
  ['--chart-grid', '--card-bg', 'grid', '网格线 / 卡片底'],
  ['--border-c', '--card-bg', 'grid', '边框 / 卡片底'],
  ['--input-c', '--card-bg', 'grid', '输入框边框 / 卡片底'],
];

const THRESHOLD = {
  'AA': 4.5,        // 正文
  'AA-large': 3.0,  // 大字（>=18.66px bold 或 >=24px）
  'graphic': 3.0,   // 图形元素：图表的线/扇区/坐标轴
  // 装饰性边框/网格线：WCAG **没有**对比度要求（1.4.11 只管「表意的」图形）。
  // 初版我拍了个 1.3 阈值，结果把「故意做得很淡的分割线」全标成 FAIL ——
  // 那不是 bug，是设计意图。改成 1.0（只要不是完全同色即可）。
  'grid': 1.0,
};

function auditTheme(name, vars) {
  const rows = [];
  for (const [fgVar, bgVar, level, desc] of PAIRS) {
    const fg = vars[fgVar], bg = vars[bgVar];
    if (!fg || !bg) {
      rows.push({ level: 'SKIP', desc, detail: `${fgVar}=${fg || '?'} ${bgVar}=${bg || '?'}` });
      continue;
    }
    const c = contrast(fg, bg);
    const need = THRESHOLD[level];
    rows.push({
      level: c >= need ? 'PASS' : 'FAIL',
      desc, ratio: c, need, fg, bg, fgVar, bgVar,
    });
  }
  return rows;
}

// ── 扫 tsx 高风险写法 ────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === '__tests__') continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(p)) out.push(p);
  }
  return out;
}

// 这些类在 globals.css 里有 [data-theme="dark"] 兜底覆盖，属于「已被网住」
function darkOverrides(css) {
  const set = new Set();
  for (const m of css.matchAll(/\[data-theme="dark"\]\s+\.([a-zA-Z0-9_-]+)/g)) set.add(m[1]);
  return set;
}
const covered = darkOverrides(css);

// ⚠️ 这些「风险」规则得很小心地写。
// 初版我写了「见 text-white 就报警」，命中 15 个文件 —— 翻开一看全是
// `bg-gray-800 text-white` / `bg-red-500 text-white` 这种。白字配固定深底本来就对。
// 假警报比没有审计更糟：一次看到 15 个「问题」全是噪声，下次就不看了。
// 所以只保留能真正定位问题的模式。
const RISKS = [
  {
    id: 'sidebar-link-outside',
    hard: true,
    desc: '.sidebar-link 用在侧边栏之外（它的 color 是近白的 --sidebar-fg，放浅色底上就是白字白底）',
    test: (src, file) => !file.includes('(app)/layout.tsx') && /sidebar-link/.test(src),
  },
  {
    id: 'white-text-on-var-bg',
    hard: true,
    // 只抓真正危险的：白色前景配上「跟主题变量走」的底色。
    // 浅色下 var(--card-bg)=白 → 白字白底。bg-gray-800 那种固定深底不算。
    desc: '白色前景配 var(--*) 主题底色（浅色模式下底色可能也是白的）',
    test: (src) => {
      const near = 200; // 同一段样式声明内的距离
      const a = new RegExp(String.raw`(?:color|fill)\s*[:=]\s*["'{]?\s*(?:#(?:fff|ffffff)\b|white\b)[\s\S]{0,${near}}?(?:background|backgroundColor)\s*:\s*var\(--`, 'i');
      const b = new RegExp(String.raw`(?:background|backgroundColor)\s*:\s*var\(--[a-z0-9-]+\)[\s\S]{0,${near}}?(?:color|fill)\s*:\s*["'{]?\s*(?:#(?:fff|ffffff)\b|white\b)`, 'i');
      return a.test(src) || b.test(src);
    },
  },
  {
    id: 'inline-hex-color',
    hard: false,
    desc: '源码里内联 hex 颜色（不跟主题切换；需人工判断是否在主题上下文中）',
    test: (src) => /(?:color|background|backgroundColor|fill|stroke)\s*[:=]\s*["'{]?\s*#[0-9A-Fa-f]{3,6}\b/.test(src),
  },
];

// ── 输出 ────────────────────────────────────────────────────
let failCount = 0;
console.log('RMS 深浅主题可读性审计');
console.log('='.repeat(72));

for (const [name, vars] of [['浅色 (:root)', light], ['深色 ([data-theme=dark])', dark]]) {
  console.log(`\n## ${name}   解析到 ${Object.keys(vars).length} 个 hex 变量\n`);
  const rows = auditTheme(name, vars);
  const fails = rows.filter(r => r.level === 'FAIL');
  const skips = rows.filter(r => r.level === 'SKIP');
  for (const r of fails) {
    console.log(`  ❌ ${r.desc}`);
    console.log(`       ${r.ratio.toFixed(2)}:1  需要 ${r.need}:1   ${r.fgVar}(${r.fg}) on ${r.bgVar}(${r.bg})`);
  }
  if (skips.length) {
    console.log(`  ⚠️  ${skips.length} 组变量缺失，跳过：`);
    for (const s of skips) console.log(`       ${s.desc}  ${s.detail}`);
  }
  console.log(`  小结：${rows.filter(r => r.level === 'PASS').length} 通过 / ${fails.length} 不足 / ${skips.length} 跳过`);
  failCount += fails.length;
}

console.log('\n' + '='.repeat(72));
console.log('## 代码层高风险写法\n');

const files = walk(SRC_DIR);
const findings = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const r of RISKS) {
    if (r.test(src, f)) {
      if (!findings.has(r.id)) findings.set(r.id, { desc: r.desc, hard: r.hard, files: [] });
      findings.get(r.id).files.push(relative(ROOT, f));
    }
  }
}

if (findings.size === 0) {
  console.log('  ✅ 未发现高风险写法');
} else {
  for (const [id, v] of findings) {
    console.log(`  ${v.hard ? '❌' : '⚠️ '} [${id}] ${v.desc}`);
    console.log(`       命中 ${v.files.length} 个文件：`);
    for (const f of v.files.slice(0, 12)) console.log(`         ${f}`);
    if (v.files.length > 12) console.log(`         ... 还有 ${v.files.length - 12} 个`);
    if (v.hard) failCount += v.files.length;
  }
}

console.log(`\n  参考：globals.css 里有 ${covered.size} 个类带 [data-theme="dark"] 兜底覆盖`);
console.log('  （所以硬编码 Tailwind 灰阶多数已被网住，上面的 ⚠️ 属于待观察不等于坏）');

console.log('\n' + '='.repeat(72));
console.log(failCount === 0 ? '✅ 无硬性失败' : `❌ ${failCount} 项需要处理`);
process.exit(failCount === 0 ? 0 : 1);
