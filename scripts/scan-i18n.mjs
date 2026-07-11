#!/usr/bin/env node
/**
 * i18n 覆盖率扫描脚本
 * 扫 src/ 下的 .ts/.tsx 文件，统计硬编码中文字符串，
 * 与 i18n catalog 对比，输出缺漏报告。
 *
 * 用法：
 *   node scripts/scan-i18n.mjs
 *   node scripts/scan-i18n.mjs --json   # 输出 JSON
 *   node scripts/scan-i18n.mjs --exit   # 缺漏时退出码非 0（CI 友好）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ZH_PATH = join(SRC, 'i18n/messages/zh-CN.json');
const EN_PATH = join(SRC, 'i18n/messages/en-US.json');

const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes('--json');
const AS_EXIT = ARGS.includes('--exit');

// 必须含中文字符
const ZH_RE = new RegExp('[\\u4e00-\\u9fff]');

function walk(dir, files = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) files.push(p);
  }
  return files;
}

function flatKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKeys(v, kp));
    else out.push(kp);
  }
  return out;
}

function extractStrings(content) {
  // 提取 "..." / '...' 字面量
  const out = new Set();
  const re = /(['"])((?:\\.|(?!\1).)*?)\1/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const s = m[2];
    if (s.length < 2 || s.length > 200) continue;
    if (!ZH_RE.test(s)) continue; // 必须含中文
    if (/^https?:\/\//.test(s)) continue;
    if (/^[\/]/.test(s)) continue;
    if (/^[a-zA-Z0-9_./\-:]+$/.test(s)) continue;
    if (['zh-CN', 'en-US', 'undefined', 'null', 'true', 'false'].includes(s)) continue;
    out.add(s);
  }
  return out;
}

function main() {
  const zh = JSON.parse(readFileSync(ZH_PATH, 'utf-8'));
  const en = JSON.parse(readFileSync(EN_PATH, 'utf-8'));
  const zhKeys = new Set(flatKeys(zh));
  const enKeys = new Set(flatKeys(en));

  const files = walk(SRC);

  const byFile = {};
  let totalHard = 0;
  const totalUnique = new Set();
  for (const f of files) {
    if (f.includes('i18n/messages') || f.includes('i18n/config.tsx')) continue;
    let content;
    try { content = readFileSync(f, 'utf-8'); } catch { continue; }
    const strs = extractStrings(content);
    if (!strs.size) continue;
    byFile[relative(ROOT, f)] = [...strs].sort();
    totalHard += strs.size;
    for (const s of strs) totalUnique.add(s);
  }

  // 检查 sync
  const missingInEn = [...zhKeys].filter(k => !enKeys.has(k));
  const missingInZh = [...enKeys].filter(k => !zhKeys.has(k));

  const summary = {
    files: files.length,
    filesWithHardcoded: Object.keys(byFile).length,
    totalHardcodedStrings: totalHard,
    uniqueHardcoded: totalUnique.size,
    catalogKeys: zhKeys.size,
    catalogNamespaces: Object.keys(zh).length,
    missingInEn: missingInEn.length,
    missingInZh: missingInZh.length,
    byFile: Object.fromEntries(
      Object.entries(byFile)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 30)
    ),
  };

  if (AS_JSON) {
    console.log(JSON.stringify(summary, null, 2));
    if (AS_EXIT && (missingInEn.length || missingInZh.length)) process.exit(1);
    return;
  }

  console.log('========== i18n Coverage Report ==========');
  console.log('源文件总数:           ' + summary.files);
  console.log('含硬编码文件数:       ' + summary.filesWithHardcoded);
  console.log('硬编码中文（重复）:   ' + summary.totalHardcodedStrings);
  console.log('硬编码中文（去重）:   ' + summary.uniqueHardcoded);
  console.log('catalog keys:         ' + summary.catalogKeys);
  console.log('catalog namespaces:   ' + summary.catalogNamespaces);
  console.log('zh/en 同步:           ' + (summary.missingInEn === 0 && summary.missingInZh === 0 ? '✅' : '❌'));
  if (missingInEn.length) console.log('  zh 有 en 缺: ' + missingInEn.length);
  if (missingInZh.length) console.log('  en 有 zh 缺: ' + missingInZh.length);
  console.log('');
  console.log('--- Top 30 硬编码中文文件 ---');
  for (const [f, ss] of Object.entries(summary.byFile)) {
    console.log(String(ss.length).padStart(4) + '  ' + f);
  }
  console.log('');
  console.log('完整文件清单: ' + Object.keys(byFile).length + ' 个文件');

  if (AS_EXIT && (missingInEn.length || missingInZh.length)) process.exit(1);
}

main();
