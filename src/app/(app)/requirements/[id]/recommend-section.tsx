'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Rec {
  knowledge_id: number;
  title: string;
  category: string;
  tags: string;
  snippet: string;
  score: number;
  matched_tags: string[];
}

export function RecommendSection({ requirementId }: { requirementId: number }) {
  const [items, setItems] = useState<Rec[]>([]);
  const [took, setTook] = useState(0);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/requirements/${requirementId}/recommendations?limit=5`)
      .then(r => r.json())
      .then(d => { setItems(d.results || []); setTook(d.took_ms || 0); setCached(d.cached || false); setLoading(false); })
      .catch(() => setLoading(false));
  }, [requirementId]);

  if (loading) return <div className="text-xs text-gray-400 py-2">⏳ 推荐计算中...</div>;
  if (items.length === 0) return <div className="text-xs text-gray-400 py-2">📭 暂无相关知识</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">⚡ {took}ms · {cached ? '📦 缓存' : '🔄 新算'}</span>
      </div>
      {items.map(r => (
        <Link key={r.knowledge_id} href={`/knowledge/${r.knowledge_id}`}
          className="block p-2.5 border rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-sm font-medium text-gray-800 truncate">{r.title}</div>
            <span className="text-xs font-mono text-gray-900">{r.score.toFixed(3)}</span>
          </div>
          {r.snippet && <div className="text-xs text-gray-500 line-clamp-2">{r.snippet}</div>}
          {r.matched_tags.length > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {r.matched_tags.map(t => <span key={t} className="text-[10px] bg-gray-200 text-gray-900 rounded px-1">{t}</span>)}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
