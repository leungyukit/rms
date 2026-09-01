'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Sprint {
  id: number;
  project_id: number;
  project_name: string;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  capacity_hours: number;
  stats: {
    total: number; done: number; in_progress: number;
    completion_rate: number; estimated_hours: number; logged_hours: number;
    overdue_count: number; capacity_pct: number;
  };
  requirements: Array<{
    id: number; title: string; status: string; priority: string;
    handler_id: number | null; estimate_hours: number | null;
    actual_hours: number | null; handler_name: string | null;
  }>;
}

interface BurndownDay { date: string; ideal: number; actual: number; }

const STATUS_BADGE: Record<string, { c: string; l: string }> = {
  planned: { c: 'badge-info', l: '计划中' },
  active: { c: 'badge-success', l: '进行中' },
  completed: { c: 'badge-gray', l: '已完成' },
  cancelled: { c: 'badge-danger', l: '已取消' },
};

const REQ_STATUS_BADGE: Record<string, string> = {
  received_not_evaluated: 'badge-gray',
  evaluated_not_scheduled: 'badge-warning',
  scheduled: 'badge-info',
  in_progress: 'badge-primary',
  completed: 'badge-success',
  verified: 'badge-info',
  closed: 'badge-gray',
};

const PRI_BADGE: Record<string, string> = {
  high: 'badge-danger',
  medium: 'badge-warning',
  low: 'badge-success',
};

export default function SprintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>('');
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [burndown, setBurndown] = useState<BurndownDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/sprints/${id}`).then(r => r.json()),
        fetch(`/api/sprints/${id}/burndown`).then(r => r.json()),
      ]);
      setSprint(r1);
      setBurndown(r2.days || []);
    } finally { setLoading(false); }
  };

  const startSprint = async () => {
    const r = await fetch(`/api/sprints/${id}/start`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) {
      if (j.conflict) {
        if (confirm(`项目下已有进行中的 Sprint #${j.conflict.id} ${j.conflict.name}。是否先结束它？`)) {
          await fetch(`/api/sprints/${j.conflict.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          return startSprint();
        }
        return;
      }
      alert(j.error); return;
    }
    load();
  };

  const completeSprint = async () => {
    if (!confirm('确认完成此 Sprint？未完成的需求会被记录。')) return;
    const r = await fetch(`/api/sprints/${id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    alert(`完成！${j.summary.done} 个完成，${j.summary.incomplete} 个未完成。`);
    load();
  };

  const cancelSprint = async () => {
    if (!confirm('确认取消此 Sprint？所有需求会被移出。')) return;
    await fetch(`/api/sprints/${id}`, { method: 'DELETE' });
    router.push('/sprints');
  };

  const removeReq = async (rid: number) => {
    if (!confirm(`确认将 #${rid} 移出 Sprint？`)) return;
    await fetch(`/api/sprints/${id}/requirements`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirement_id: rid }) });
    load();
  };

  if (loading || !sprint) return <div className="p-6 text-gray-400">加载中...</div>;
  if ((sprint as any).error) return <div className="p-6 text-red-500">{(sprint as any).error}</div>;

  const statusBadge = STATUS_BADGE[sprint.status];

  return (
    <div className="p-6 max-w-6xl">
      {/* 头部 */}
      <div className="page-header">
        <h1>🏃 {sprint.name}</h1>
        <p>
          <Link href={`/projects/${sprint.project_id}`} className="text-gray-800 hover:underline">{sprint.project_name}</Link>
          <span className="mx-2">·</span>
          <span>{sprint.start_date} ~ {sprint.end_date}</span>
          {sprint.goal && <><span className="mx-2">·</span><span>目标: {sprint.goal}</span></>}
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className={`badge ${statusBadge.c}`}>{statusBadge.l}</span>
        <div className="flex gap-2 ml-auto">
          {sprint.status === 'planned' && (
            <button onClick={startSprint} className="btn btn-primary">▶️ 开始</button>
          )}
          {(sprint.status === 'active' || sprint.status === 'planned') && (
            <button onClick={completeSprint} className="btn btn-primary">✅ 完成</button>
          )}
          {sprint.status !== 'cancelled' && sprint.status !== 'completed' && (
            <button onClick={cancelSprint} className="btn btn-danger">取消</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左：需求列表（8 列） */}
        <div className="col-span-8 space-y-2">
          <h2 className="card-title">需求列表（{sprint.requirements.length}）</h2>
          {sprint.requirements.length === 0 ? (
            <div className="card"><div className="card-body text-center text-gray-400">
              Sprint 还没有需求
              <div className="mt-2"><Link href="/requirements" className="text-gray-800 hover:underline">去需求列表 →</Link></div>
            </div></div>
          ) : (
            <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="divide-y">
              {sprint.requirements.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 font-mono w-8">#{r.id}</span>
                  <span className={`badge ${REQ_STATUS_BADGE[r.status] || 'badge-gray'}`}>{r.status}</span>
                  <span className={`badge ${PRI_BADGE[r.priority] || 'badge-gray'}`}>{r.priority}</span>
                  <Link href={`/requirements/${r.id}`} className="flex-1 text-sm hover:text-gray-800 truncate">{r.title}</Link>
                  <span className="text-xs text-gray-500">{r.handler_name || '—'}</span>
                  <span className="text-xs text-gray-500 w-16 text-right">{r.estimate_hours ? r.estimate_hours + 'h' : '—'}</span>
                  {(sprint.status === 'planned' || sprint.status === 'active') && (
                    <button onClick={() => removeReq(r.id)} className="btn btn-sm btn-danger">移出</button>
                  )}
                </div>
              ))}
            </div></div></div>
          )}
        </div>

        {/* 右：燃尽 + 统计（4 列） */}
        <div className="col-span-4 space-y-4">
          {/* 统计卡 */}
          <div className="card"><div className="card-body">
            <h3 className="card-title">📊 统计</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-gray-500">需求数</div><div className="text-lg font-medium">{sprint.stats.total}</div></div>
              <div><div className="text-xs text-gray-500">完成率</div><div className="text-lg font-medium text-gray-900">{sprint.stats.completion_rate}%</div></div>
              <div><div className="text-xs text-gray-500">预计工时</div><div className="text-base">{sprint.stats.estimated_hours}h</div></div>
              <div><div className="text-xs text-gray-500">实际工时</div><div className="text-base">{sprint.stats.logged_hours}h</div></div>
              <div><div className="text-xs text-gray-500">容量占比</div><div className={`text-base ${sprint.stats.capacity_pct > 120 ? 'text-red-600' : sprint.stats.capacity_pct > 100 ? 'text-orange-600' : 'text-green-600'}`}>{sprint.stats.capacity_pct}%</div></div>
              <div><div className="text-xs text-gray-500">超期</div><div className={`text-base ${sprint.stats.overdue_count > 0 ? 'text-red-600' : ''}`}>{sprint.stats.overdue_count}</div></div>
            </div>
            <div className="mt-3 text-xs text-gray-500">容量 {sprint.capacity_hours}h</div>
          </div></div>

          {/* 燃尽图 */}
          <div className="card"><div className="card-body">
            <h3 className="card-title">📉 燃尽图</h3>
            {burndown.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4">暂无数据</div>
            ) : (
              <BurndownChart days={burndown} />
            )}
          </div></div>
        </div>
      </div>
    </div>
  );
}

function BurndownChart({ days }: { days: BurndownDay[] }) {
  const W = 280, H = 120, P = 16;
  const xs = days.map((_, i) => P + (i * (W - 2 * P)) / Math.max(1, days.length - 1));
  const maxY = Math.max(1, ...days.map(d => Math.max(d.ideal, d.actual)));
  const yScale = (v: number) => H - P - ((v / maxY) * (H - 2 * P));
  const idealPath = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yScale(d.ideal)}`).join(' ');
  const actualPath = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yScale(d.actual)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((p, i) => (
          <line key={i} x1={P} y1={P + p * (H - 2 * P)} x2={W - P} y2={P + p * (H - 2 * P)} stroke="var(--chart-grid)" strokeWidth="1" />
        ))}
        <path d={idealPath} stroke="var(--chart-axis)" strokeWidth="1.5" strokeDasharray="4 2" fill="none" />
        <path d={actualPath} stroke="var(--chart-1)" strokeWidth="2" fill="none" />
        {days.map((d, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={yScale(d.actual)} r="2" fill="var(--chart-1)" />
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ borderTop: '1px dashed var(--chart-axis)' }} /> 理想</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: 'var(--chart-1)' }} /> 实际</span>
        <span className="ml-auto">{days[0]?.date} ~ {days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}
