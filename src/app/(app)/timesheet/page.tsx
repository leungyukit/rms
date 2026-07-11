'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface WorkLog {
  id: number;
  work_date: string;
  hours: number;
  description: string;
  user_name: string;
  req_title: string;
  requirement_id: number;
  project_name: string;
}

function getWeekStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d: Date): string { return d.toISOString().substring(0, 10); }

const TODAY = new Date();

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(TODAY));
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterReq, setFilterReq] = useState<number | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d; }, [weekStart]);

  const load = async () => {
    setLoading(true);
    const r = await fetch(`/api/work-logs?from=${fmt(weekStart)}&to=${fmt(weekEnd)}`);
    const j = await r.json();
    setLogs(j.logs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [weekStart]);

  const byReq = useMemo(() => {
    const m = new Map<number, { title: string; days: Record<string, WorkLog[]>; total: number }>();
    for (const l of logs) {
      if (!m.has(l.requirement_id)) m.set(l.requirement_id, { title: l.req_title, days: {}, total: 0 });
      const e = m.get(l.requirement_id)!;
      e.days[l.work_date] = e.days[l.work_date] || [];
      e.days[l.work_date].push(l);
      e.total += l.hours;
    }
    return m;
  }, [logs]);

  const dailyTotal = useMemo(() => {
    const t: Record<string, number> = {};
    for (const d of days) t[fmt(d)] = 0;
    for (const l of logs) t[l.work_date] = (t[l.work_date] || 0) + l.hours;
    return t;
  }, [logs, days]);

  const weekTotal = logs.reduce((s, l) => s + l.hours, 0);
  const dayLabels = ['一','二','三','四','五','六','日'];

  return (
    <div className="p-6 max-w-7xl">
      <div className="page-header">
        <h1>📅 工时周报</h1>
        <p>查看团队或个人的工时投入情况</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="btn btn-sm btn-secondary">← 上周</button>
        <span className="text-sm text-gray-600 font-mono">{fmt(weekStart)} ~ {fmt(weekEnd)}</span>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="btn btn-sm btn-secondary">本周 →</button>
        <button onClick={() => setWeekStart(getWeekStart(TODAY))} className="btn btn-sm btn-primary">今天</button>
        <Link href="/workload" className="btn btn-sm btn-secondary ml-auto">📊 团队视图</Link>
      </div>

      {/* 总览 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="stat-card">
          <div className="stat-value">{weekTotal.toFixed(1)}</div>
          <div className="stat-label">本周合计 (h)</div>
        </div>
        {days.map(d => {
          const dk = fmt(d);
          const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
          const total = dailyTotal[dk] || 0;
          return (
            <div key={dk} className="stat-card">
              <div className="stat-label">周{dayLabels[dayIdx]} {dk.substring(5)}</div>
              <div className={`stat-value ${dk === fmt(TODAY) ? 'text-gray-900' : dayIdx >= 5 ? 'text-orange-500' : ''}`}>{total.toFixed(1)}h</div>
            </div>
          );
        })}
      </div>

      {/* 周视图 */}
      {byReq.size === 0 ? (
        <div className="card"><div className="card-body text-center text-gray-400 py-16">
          {loading ? '加载中...' : '本周暂无工时记录'}
        </div></div>
      ) : (
        <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 z-10 min-w-[200px]">需求</th>
                  {days.map(d => (
                    <th key={fmt(d)} className="px-2 py-2 text-center min-w-[80px]">
                      <div className="text-xs font-medium">周{dayLabels[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                      <div className="text-gray-500 font-mono">{fmt(d).substring(5)}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center text-gray-900 min-w-[60px]">合计</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byReq.entries()).map(([rid, e]) => (
                  <tr key={rid} className={`border-b hover:bg-gray-50 cursor-pointer ${filterReq === rid ? 'bg-gray-100' : ''}`}
                      onClick={() => setFilterReq(filterReq === rid ? null : rid)}>
                    <td className="px-3 py-2 sticky left-0 bg-white z-10">
                      <Link href={`/requirements/${rid}`} className="hover:text-gray-800 truncate block" onClick={ev => ev.stopPropagation()}>
                        <span className="text-xs text-gray-400 font-mono">#{rid}</span> {e.title}
                      </Link>
                    </td>
                    {days.map(d => {
                      const day = fmt(d);
                      const cell = e.days[day] || [];
                      const total = cell.reduce((s, l) => s + l.hours, 0);
                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          {total > 0 ? (
                            <div className="group relative">
                              <div className={`font-mono font-medium ${day === fmt(TODAY) ? 'text-gray-900' : ''}`}>{total.toFixed(1)}h</div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded p-2 whitespace-nowrap shadow-lg">
                                {cell.map(l => <div key={l.id}>{l.hours}h · {l.description?.substring(0, 20) || '—'}</div>)}
                              </div>
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center font-mono font-medium text-gray-900">{e.total.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-medium">
                  <td className="px-3 py-2 sticky left-0 bg-gray-50 z-10">日合计</td>
                  {days.map(d => (
                    <td key={fmt(d)} className="px-2 py-2 text-center font-mono">{(dailyTotal[fmt(d)] || 0).toFixed(1)}h</td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono text-gray-900">{weekTotal.toFixed(1)}h</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div></div></div>
      )}

      <p className="text-xs text-gray-400 mt-2">💡 悬停格子查看明细 · 点击需求行筛选 · 跳转到 /workload 看团队维度</p>
    </div>
  );
}
