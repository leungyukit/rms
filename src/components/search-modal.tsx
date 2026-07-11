'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Result {
  type: string;
  id: number;
  title: string;
  snippet: string;
  score: number;
  status?: string;
  priority?: string;
  project_name?: string;
  category?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  requirement: { label: '需求', color: 'bg-blue-100 text-blue-700' },
  knowledge: { label: '知识', color: 'bg-green-100 text-green-700' },
  project: { label: '项目', color: 'bg-purple-100 text-purple-700' },
};

export default function SearchModal() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'requirement' | 'knowledge' | 'project'>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 历史搜索（localStorage）
  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('rms_search_history') || '[]');
      setHistory(h);
    } catch (e) {}
  }, []);

  // ⌘K 唤起
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 打开时自动 focus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIdx(0);
    } else {
      setQ('');
      setResults([]);
      setSuggestions([]);
    }
  }, [open]);

  // 输入时 debounce 拉建议
  useEffect(() => {
    if (!q.trim()) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      setSuggestions(j.results || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // 完整搜索
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); setTotalCount(0); return; }
    setLoading(true);
    const type = activeTab === 'all' ? 'all' :
      activeTab === 'requirement' ? 'requirements' :
      activeTab === 'knowledge' ? 'knowledge' : 'projects';
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`);
    const j = await r.json();
    setResults(j.results || []);
    setTotalCount(j.total || 0);
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (q.trim().length >= 1) doSearch(q);
  }, [q, doSearch]);

  const filtered = activeTab === 'all' ? results : results.filter(r => r.type === activeTab);

  const go = (r: Result) => {
    // 保存到历史
    const h = [q, ...history.filter(x => x !== q)].slice(0, 10);
    setHistory(h);
    try { localStorage.setItem('rms_search_history', JSON.stringify(h)); } catch (e) {}
    const url = r.type === 'requirement' ? `/requirements/${r.id}` :
      r.type === 'knowledge' ? `/knowledge/${r.id}` : `/projects/${r.id}`;
    setOpen(false);
    router.push(url);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && filtered[selectedIdx]) { go(filtered[selectedIdx]); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2" title="搜索 (⌘K)">
        <span>🔍</span><span className="hidden md:inline">搜索</span><span className="text-xs text-gray-400 hidden md:inline">⌘K</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black bg-opacity-40" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-[80vw] max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setSelectedIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="搜索需求/知识/项目..."
            className="w-full text-lg outline-none"
          />
        </div>

        {/* 分类 Tab */}
        <div className="flex items-center gap-1 px-4 py-2 border-b text-xs">
          {(['all', 'requirement', 'knowledge', 'project'] as const).map(t => {
            const count = t === 'all' ? results.length : results.filter(r => r.type === t).length;
            return (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded ${activeTab === t ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t === 'all' ? '全部' : TYPE_LABELS[t]?.label || t} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            );
          })}
          {loading && <span className="ml-auto text-gray-400">搜索中...</span>}
          {!loading && totalCount > 0 && <span className="ml-auto text-gray-400">共 {totalCount} 条</span>}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim() === '' ? (
            <div className="p-6">
              {history.length > 0 ? (
                <div>
                  <div className="text-xs text-gray-500 mb-2">🕘 最近搜索：</div>
                  {history.map((h, i) => (
                    <button key={i} onClick={() => setQ(h)} className="block px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 w-full text-left">
                      {h}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 text-sm">输入关键词开始搜索 · ⌘K 唤起</div>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {loading ? '搜索中...' : '无结果'}
            </div>
          ) : (
            filtered.map((r, i) => {
              const tl = TYPE_LABELS[r.type] || { label: r.type, color: 'bg-gray-100' };
              return (
                <div key={`${r.type}-${r.id}`}
                  onClick={() => go(r)}
                  className={`px-4 py-3 border-b cursor-pointer ${i === selectedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${tl.color}`}>{tl.label}</span>
                    {r.priority && <span className="text-xs text-gray-400">{r.priority}</span>}
                    {r.status && <span className="text-xs text-gray-400">{r.status}</span>}
                    {r.category && <span className="text-xs text-gray-400">{r.category}</span>}
                    <span className="text-xs text-gray-300 ml-auto">score: {r.score.toFixed(2)}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 truncate" dangerouslySetInnerHTML={{ __html: r.title }} />
                  {r.snippet && <div className="text-xs text-gray-500 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: r.snippet }} />}
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t text-xs text-gray-400 flex items-center gap-3">
          <span>↑↓ 选择</span>
          <span>Enter 跳转</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">⌘K 唤起</span>
        </div>
      </div>
    </div>
  );
}
