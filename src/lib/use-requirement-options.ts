'use client';

import { useEffect, useState } from 'react';

export type KVOption = { value: string; label: string };

type CacheShape = {
  priorities: KVOption[];
  categories: KVOption[];
  statuses: KVOption[];
  /** 原始字符串，方便原样回显 */
  raw: { priorities: string; categories: string; statuses: string };
};

let cached: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;
const listeners = new Set<(c: CacheShape) => void>();

// 与 system_config 默认值一致；API 失败时兜底用
export const DEFAULT_PRIORITIES = 'high|高,medium|中,low|低';
export const DEFAULT_CATEGORIES = 'project|项目需求,adhoc|零星需求';
export const DEFAULT_STATUSES =
  'received_not_evaluated|仅接收未评估,evaluated_not_scheduled|已评估未排期,scheduled|已排期,in_progress|处理中,completed|已完成,verified|已验证,closed|已关闭';

function parseOptions(value: string | undefined, fallback: string): KVOption[] {
  const src = value && value.trim() ? value : fallback;
  return src
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const idx = s.indexOf('|');
      const v = (idx >= 0 ? s.slice(0, idx) : s).trim();
      const l = (idx >= 0 ? s.slice(idx + 1) : s).trim();
      return { value: v, label: l || v };
    });
}

function buildCache(d: any): CacheShape {
  const cfgs: any[] = d?.configs || [];
  const find = (k: string) => cfgs.find(c => c.key === k)?.value as string | undefined;
  const rawPriorities = find('requirement_priorities') ?? DEFAULT_PRIORITIES;
  const rawCategories = find('requirement_categories') ?? DEFAULT_CATEGORIES;
  const rawStatuses = find('requirement_statuses') ?? DEFAULT_STATUSES;
  return {
    priorities: parseOptions(rawPriorities, DEFAULT_PRIORITIES),
    categories: parseOptions(rawCategories, DEFAULT_CATEGORIES),
    statuses: parseOptions(rawStatuses, DEFAULT_STATUSES),
    raw: { priorities: rawPriorities, categories: rawCategories, statuses: rawStatuses },
  };
}

export async function loadRequirementOptions(force = false): Promise<CacheShape> {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/config', { credentials: 'include' });
      const d = await r.json();
      cached = buildCache(d);
    } catch {
      cached = buildCache(null);
    } finally {
      inflight = null;
      listeners.forEach(fn => fn(cached!));
    }
    return cached!;
  })();
  return inflight;
}

/** 主动失效缓存（admin 保存配置后调用） */
export function invalidateRequirementOptions() {
  cached = null;
  void loadRequirementOptions(true);
}

function makeFallback(): CacheShape {
  return {
    priorities: parseOptions(undefined, DEFAULT_PRIORITIES),
    categories: parseOptions(undefined, DEFAULT_CATEGORIES),
    statuses: parseOptions(undefined, DEFAULT_STATUSES),
    raw: { priorities: DEFAULT_PRIORITIES, categories: DEFAULT_CATEGORIES, statuses: DEFAULT_STATUSES },
  };
}

export function useRequirementOptions() {
  const fallback = makeFallback();
  const [data, setData] = useState<CacheShape>(cached ?? fallback);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    let mounted = true;
    const update = (c: CacheShape) => {
      if (mounted) { setData(c); setLoading(false); }
    };
    listeners.add(update);
    void loadRequirementOptions();
    return () => { mounted = false; listeners.delete(update); };
  }, []);

  const labelOf = (list: KVOption[], value: string | null | undefined, withEmoji = false): string => {
    if (!value) return withEmoji ? '⚪ —' : '—';
    const opt = list.find(o => o.value === value);
    if (!opt) return value;
    return withEmoji ? emojiFor(value) + ' ' + opt.label : opt.label;
  };

  return {
    priorities: data.priorities,
    categories: data.categories,
    statuses: data.statuses,
    priorityLabel: (v: string | null | undefined, withEmoji = false) => labelOf(data.priorities, v, withEmoji),
    categoryLabel: (v: string | null | undefined) => labelOf(data.categories, v),
    statusLabel: (v: string | null | undefined) => labelOf(data.statuses, v),
    loading,
  };
}

/** 已知 key 的 emoji 兜底，未知 key 返回 ⚪ */
function emojiFor(value: string): string {
  const map: Record<string, string> = {
    high: '🔴', medium: '🟡', low: '🟢', urgent: '🔥',
    received_not_evaluated: '⚪', evaluated_not_scheduled: '🟡', scheduled: '🔵',
    in_progress: '🟣', completed: '🟢', verified: '🩵', closed: '⚫',
  };
  return map[value] ?? '⚪';
}
