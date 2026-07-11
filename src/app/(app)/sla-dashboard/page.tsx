'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_MAP: Record<string, string> = {
  received_not_evaluated: '仅接收，未评估',
  evaluated_not_scheduled: '已评估，未排期',
  scheduled: '已排期',
  in_progress: '处理中',
  completed: '已完成',
  verified: '已验证',
  closed: '已关闭',
};

const STATUS_COLORS: Record<string, string> = {
  received_not_evaluated: 'badge-gray',
  evaluated_not_scheduled: 'badge-warning',
  scheduled: 'badge-info',
  in_progress: 'badge-primary',
  completed: 'badge-success',
  verified: 'badge-info',
  closed: 'badge-gray',
};

interface SlaItem {
  requirement_id: number;
  requirement_title?: string;
  title?: string;
  status: string;
  planned_end?: string | null;
  days_diff?: number;
  warning_count?: number;
  created_at?: string;
  water_level?: 'approaching' | 'overdue' | 'escalated';
}

interface SlaDashboard {
  summary: { approaching: number; overdue: number; escalated: number; today_new?: number };
  config?: any;
  items: SlaItem[];
  unacknowledged: SlaItem[];
}

export default function SlaDashboardPage() {
  const [data, setData] = useState<SlaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [todayNew, setTodayNew] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sla/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || '加载失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch('/api/auth/me', { credentials: 'include' }).then(async r => { try { const d = await r.json(); const u = d?.user || d; setIsAdmin(!!u?.roles?.includes('global_admin')); } catch { /* ignore */ } }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data) return;
    const today = new Date().toDateString();
    setTodayNew(
      (data.unacknowledged || []).filter((it: any) => {
        const t = it.created_at ? new Date(it.created_at).toDateString() : '';
        return t === today;
      }).length
    );
  }, [data]);

  const handleScan = async () => {
    if (!confirm('确认立即执行 SLA 扫描？这将生成新预警并通知相关处理人。')) return;
    setScanning(true);
    try {
      const res = await fetch('/api/sla/scan', { method: 'POST' });
      const raw = await res.text().catch(() => '');
      const json = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      alert(`扫描完成：发现 ${json.created ?? json.total ?? 0} 条新预警`);
      await load();
    } catch (e: any) {
      console.error(e);
      alert(`扫描失败：${e?.message || '未知错误'}`);
    }
    setScanning(false);
  };

  const ackWarning = async (reqId: number) => {
    setAckingId(reqId);
    try {
      const listRes = await fetch(`/api/sla/warnings?requirement_id=${reqId}`);
      const raw = await listRes.text().catch(() => '');
      const listData = raw ? JSON.parse(raw) : {};
      if (!listRes.ok) throw new Error(listData?.error || `HTTP ${listRes.status}`);
      const list = listData?.data || [];
      const unack = list.filter((w: any) => !w.acknowledged_at);
      for (const w of unack) {
        const r = await fetch(`/api/sla/warnings/${w.id}/ack`, { method: 'POST' });
        if (!r.ok) console.error('ack failed', w.id, await r.text().catch(() => ''));
      }
      await load();
    } catch (e) {
      console.error(e);
      alert('确认失败');
    }
    setAckingId(null);
  };

  if (loading && !data) return <div className="p-6 text-gray-400">加载中...</div>;
  if (error) return <div className="p-6 text-red-500">加载失败：{error}</div>;
  if (!data) return null;

  const summary = data.summary || { approaching: 0, overdue: 0, escalated: 0 };
  const unackList = data.unacknowledged || [];

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>🚨 SLA 预警看板</h1>
        <p>需求超时预警概览，未确认预警需关注</p>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={load} className="btn btn-secondary">🔄 刷新</button>
        {isAdmin && (
          <button onClick={handleScan} disabled={scanning} className="btn btn-danger">
            {scanning ? '扫描中...' : '⚡ 立即扫描'}
          </button>
        )}
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-value text-yellow-600">{summary.approaching}</div>
          <div className="stat-label">🟡 即将超期</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-orange-600">{summary.overdue}</div>
          <div className="stat-label">🟠 已超期</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-red-600">{summary.escalated}</div>
          <div className="stat-label">🔴 严重超期</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-gray-900">{todayNew}</div>
          <div className="stat-label">📅 今日新增预警</div>
        </div>
      </div>

      {/* 未确认预警表 */}
      <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">需求 ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">标题</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">水位线</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">剩余/超期</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">预警时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
            ) : unackList.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">🎉 暂无未确认预警</td></tr>
            ) : unackList.map(item => {
              const wl = (item as any).water_level || (item as any).warning_type;
              const wlColor = wl === 'escalated' || item.days_diff && item.days_diff < -3 ? 'text-red-600' : wl === 'overdue' ? 'text-orange-600' : 'text-yellow-700';
              const wlLabel = wl === 'escalated' ? '🔴 严重' : wl === 'overdue' ? '🟠 已超期' : '🟡 即将';
              const days = typeof item.days_diff === 'number' ? item.days_diff : null;
              const daysText = days === null ? '—' : days < 0 ? `超期 ${Math.abs(days).toFixed(1)} 天` : `剩 ${days.toFixed(1)} 天`;
              return (
                <tr key={item.requirement_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">#{item.requirement_id}</td>
                  <td className="px-4 py-3">
                    <Link href={`/requirements/${item.requirement_id}`} className="text-gray-900 hover:underline font-medium">
                      {item.requirement_title || `需求 #${item.requirement_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_COLORS[item.status] || 'badge-gray'}`}>
                      {STATUS_MAP[item.status] || item.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-medium ${wlColor}`}>{wlLabel}</td>
                  <td className={`px-4 py-3 ${wlColor}`}>{daysText}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.created_at?.replace('T', ' ').slice(0, 16) || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => ackWarning(item.requirement_id)}
                      disabled={ackingId === item.requirement_id}
                      className="btn btn-sm btn-secondary">
                      {ackingId === item.requirement_id ? '确认中…' : '我知道了'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div></div>
    </div>
  );
}
