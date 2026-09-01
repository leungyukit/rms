/**
 * 标签归一化
 *
 * 问题：知识标签原本是 knowledge_entries.tags 里的 JSON 字符串，
 * 与正经的 tags 表（服务需求）完全脱节 → 无法聚合、无法按标签检索，
 * 且「权限管理」/「权限管理 」/「权限管理」（全角空格）会各算一个标签。
 *
 * 归一化键的取舍：只做「安全的等价折叠」，不做语义合并。
 * - 折叠：首尾空白、内部连续空白、全角→半角、大小写（仅 ASCII）
 * - 不折叠：简繁体、同义词 —— 那属于语义判断，猜错了比不猜更糟
 *
 * 显示名保留用户原始输入，只有归一化键用于去重和匹配。
 */

/** 全角字符（FF01-FF5E）映射到对应半角（21-7E） */
function toHalfWidth(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // 全角空格单独处理（U+3000 不在上面区间）
    .replace(/\u3000/g, ' ');
}

/**
 * 生成标签归一化键。
 * 同一个键的标签视为同一个标签。
 */
export function normalizeTagKey(raw: string): string {
  if (!raw) return '';
  return toHalfWidth(String(raw))
    .trim()
    .replace(/\s+/g, ' ')   // 内部连续空白折叠为单个空格
    .toLowerCase();          // 只影响 ASCII，中文不受影响
}

/** 清理标签显示名（保留原始大小写与中文，仅去掉多余空白） */
export function cleanTagName(raw: string): string {
  if (!raw) return '';
  return toHalfWidth(String(raw)).trim().replace(/\s+/g, ' ');
}

/** 标签名是否合法 */
export function isValidTagName(raw: string): boolean {
  const cleaned = cleanTagName(raw);
  if (cleaned.length === 0) return false;
  if (cleaned.length > 50) return false;
  // 逗号会破坏前端的标签串展示，分号同理
  if (/[,;]/.test(cleaned)) return false;
  return true;
}

/**
 * 对一组标签去重（按归一化键），保留每个键首次出现的显示名。
 * 返回 [{ name, key }]，顺序与输入一致。
 */
export function dedupeTags(raws: unknown): Array<{ name: string; key: string }> {
  if (!Array.isArray(raws)) return [];
  const seen = new Set<string>();
  const out: Array<{ name: string; key: string }> = [];

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
