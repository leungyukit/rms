/**
 * 需求去重算法工具
 * 依据：rms-docs/RMS-优化方案-阶段1-P0.md § 2.3
 *
 * 2-gram 中文切词 + Jaccard + LCS（最长公共子串）
 */

const STOP_CHARS = /[\s\u3000\u00A0，。！？、；：「」『』（）【】《》"'`~!@#$%^&*()\-_+=<>?/\\|.,;:'"`~]/g;

/**
 * 提取关键词：去标点 + 转小写
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(STOP_CHARS, ' ').trim().toLowerCase();
  return cleaned.split(/\s+/).filter(t => t.length > 0);
}

/**
 * 2-gram 切词：把字符串切成两字一组
 * 例："订单模块性能优化" → ["订单","单模","模块","块性","性能","能优","优化"]
 */
export function bigram(text: string): string[] {
  const t = tokenize(text).join('');
  if (t.length < 2) return t.length === 1 ? [t] : [];
  const result: string[] = [];
  for (let i = 0; i < t.length - 1; i++) {
    result.push(t.substring(i, i + 2));
  }
  return result;
}

/**
 * Jaccard 相似度：|A∩B| / |A∪B|
 */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * 最长公共子串（Longest Common Substring）
 * 用 DP 算法，O(n*m)
 */
export function lcs(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  if (m > 200 || n > 200) {
    // 长文本截断，避免 O(n²) 爆
    return lcs(a.slice(0, 200), b.slice(0, 200));
  }
  const dp: number[] = new Array(n + 1).fill(0);
  let max = 0;
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > max) max = dp[j];
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return max;
}

/**
 * LCS 占比
 */
export function lcsRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return lcs(a, b) / max;
}

/**
 * 综合相似度：取 bigram-Jaccard 和 LCS 占比的较大值
 */
export function similarity(a: string, b: string): { score: number; lcsSubstring: string } {
  const aBi = bigram(a);
  const bBi = bigram(b);
  const j = jaccard(aBi, bBi);
  const r = lcsRatio(a, b);
  const score = Math.max(j, r);

  // 提取最长公共子串（截前 30 字符用作 snippet）
  const cleanedA = tokenize(a).join('');
  const cleanedB = tokenize(b).join('');
  const sub = lcs(cleanedA, cleanedB);
  const snippet = sub > 0 ? commonSubstring(cleanedA, cleanedB).slice(0, 30) : '';

  return { score, lcsSubstring: snippet };
}

function commonSubstring(a: string, b: string): string {
  if (!a || !b) return '';
  const m = a.length;
  const n = b.length;
  const cap = 200;
  const sa = a.slice(0, cap);
  const sb = b.slice(0, cap);
  const dp: number[] = new Array(n + 1).fill(0);
  let max = 0;
  let endIdx = 0;
  for (let i = 1; i <= sa.length; i++) {
    let prev = 0;
    for (let j = 1; j <= sb.length; j++) {
      const tmp = dp[j];
      if (sa[i - 1] === sb[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > max) { max = dp[j]; endIdx = i; }
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return max > 0 ? sa.slice(endIdx - max, endIdx) : '';
}
