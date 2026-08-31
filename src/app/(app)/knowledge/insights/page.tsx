'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function KnowledgeInsightsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 修复（2026-08-31）：补 r.ok 检查 + catch，避免 401 时永久「加载中...」
    fetch('/api/knowledge/stats', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-20 text-center text-gray-400">加载中...</div>;
  if (!stats) return <div className="p-20 text-center text-gray-500">加载失败</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="page-header">
        <h1>💡 知识洞察</h1>
        <p>知识库健康度与分析</p>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/knowledge" className="btn btn-secondary">← 返回知识中心</Link>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">知识总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-gray-900">{stats.coverage?.coverageRate || 0}%</div>
          <div className="stat-label">知识覆盖率</div>
          <div className="text-xs text-gray-400 mt-1">{stats.coverage?.coveredReqs}/{stats.coverage?.completedReqs} 已完成需求</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-amber-600">{stats.feedback?.qualityRate || 0}%</div>
          <div className="stat-label">FAQ 质量分</div>
          <div className="text-xs text-gray-400 mt-1">{stats.feedback?.useful}/{stats.feedback?.total} 有用投票</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.drafts}</div>
          <div className="stat-label">待审核草稿</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* By Type */}
        <div className="card"><div className="card-body">
          <h3 className="card-title">📊 按类型分布</h3>
          <div className="space-y-2">
            {(stats.byType || []).map((t: any) => {
              const label = t.type === 'faq' ? 'FAQ' : t.type === 'solution' ? '解决方案' : t.type === 'lesson' ? '经验教训' : '模式';
              const pct = Math.min(100, (t.count / Math.max(1, stats.total)) * 100);
              return (
                <div key={t.type} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-20">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4">
                    <div className="bg-gray-800 rounded-full h-4" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{t.count}</span>
                </div>
              );
            })}
          </div>
        </div></div>

        {/* By Category */}
        <div className="card"><div className="card-body">
          <h3 className="card-title">📂 按分类分布</h3>
          <div className="space-y-2">
            {(stats.byCategory || []).map((c: any) => {
              const pct = Math.min(100, (c.count / Math.max(1, stats.total)) * 100);
              return (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-24 truncate">{c.category || '未分类'}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4">
                    <div className="bg-gray-800 rounded-full h-4" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{c.count}</span>
                </div>
              );
            })}
          </div>
        </div></div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Top Viewed */}
        <div className="card"><div className="card-body">
          <h3 className="card-title">🔥 高浏览量 TOP</h3>
          <div className="space-y-2">
            {(stats.topViewed || []).slice(0, 5).map((item: any, i: number) => (
              <Link key={item.id} href={`/knowledge/${item.id}`} className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded transition">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{item.title}</span>
                <span className="text-xs text-gray-400">👁 {item.view_count}</span>
              </Link>
            ))}
            {(!stats.topViewed || stats.topViewed.length === 0) && <div className="text-sm text-gray-400">暂无数据</div>}
          </div>
        </div></div>

        {/* Top Useful */}
        <div className="card"><div className="card-body">
          <h3 className="card-title">👍 最有用 TOP</h3>
          <div className="space-y-2">
            {(stats.topUseful || []).slice(0, 5).map((item: any, i: number) => (
              <Link key={item.id} href={`/knowledge/${item.id}`} className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded transition">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{item.title}</span>
                <span className="text-xs text-gray-400">👍 {item.useful_count}</span>
              </Link>
            ))}
            {(!stats.topUseful || stats.topUseful.length === 0) && <div className="text-sm text-gray-400">暂无数据</div>}
          </div>
        </div></div>
      </div>

      {/* Uncovered */}
      {stats.uncovered?.length > 0 && (
        <div className="card mb-4"><div className="card-body">
          <h3 className="card-title">⚠️ 知识空白 — 已完成但无知识条目的需求</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {stats.uncovered.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 text-sm p-2 bg-amber-50 rounded-lg">
                <span className="text-amber-600 font-medium">#{r.id}</span>
                <span className="text-gray-800 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-gray-400">{r.project_name}</span>
              </div>
            ))}
          </div>
        </div></div>
      )}
    </div>
  );
}
