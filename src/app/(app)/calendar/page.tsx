'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  received_not_evaluated: '#9CA3AF', evaluated_not_scheduled: '#F59E0B',
  scheduled: '#3B82F6', in_progress: '#8B5CF6', completed: '#10B981',
  verified: '#06B6D4', closed: '#6B7280',
};
const PRIORITY_DOT: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };

type ViewMode = 'week' | 'month' | 'day';

function fmt(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [handlers, setHandlers] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [filterHandler, setFilterHandler] = useState('');

  const { startDate, endDate, days } = useMemo(() => {
    let s: Date, e: Date;
    if (viewMode === 'week') { s = startOfWeek(baseDate); e = addDays(s, 6); }
    else if (viewMode === 'month') { s = startOfMonth(baseDate); e = endOfMonth(baseDate); }
    else { s = new Date(baseDate); e = new Date(baseDate); }
    const days: Date[] = [];
    let cur = new Date(s);
    while (cur <= e) { days.push(new Date(cur)); cur = addDays(cur, 1); }
    return { startDate: s, endDate: e, days };
  }, [viewMode, baseDate]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ start: fmt(startDate), end: fmt(endDate) });
    if (filterHandler) params.set('handler_id', filterHandler);
    fetch(`/api/calendar?${params}`)
      .then(r => r.json())
      .then(d => { setHandlers(d.handlers || []); setRequirements(d.requirements || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [startDate, endDate, filterHandler]);

  const reqOnDate = (req: any, date: string) => req.planned_start <= date && req.planned_end >= date;
  const getReqs = (handlerId: number, date: string) =>
    requirements.filter(r => r.handler_id === handlerId && reqOnDate(r, date));

  const nav = (dir: number) => {
    if (viewMode === 'week') setBaseDate(prev => addDays(prev, dir * 7));
    else if (viewMode === 'month') setBaseDate(prev => { const n = new Date(prev); n.setMonth(n.getMonth() + dir); return n; });
    else setBaseDate(prev => addDays(prev, dir));
  };

  const today = fmt(new Date());
  const displayHandlers = filterHandler ? handlers.filter(h => String(h.id) === filterHandler) : handlers;

  const dateLabel = viewMode === 'week'
    ? `${fmt(startDate)} ~ ${fmt(endDate)}`
    : viewMode === 'month' ? `${baseDate.getFullYear()}年${baseDate.getMonth() + 1}月` : fmt(baseDate);

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col">
      <div className="page-header">
        <h1>📆 工作日历</h1>
        <p>按人员查看需求处理计划安排</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <select value={filterHandler} onChange={e => setFilterHandler(e.target.value)} className="form-input">
            <option value="">全部人员</option>
            {handlers.map(h => <option key={h.id} value={h.id}>{h.display_name}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['day', 'week', 'month'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {{ day: '日', week: '周', month: '月' }[m]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => nav(-1)} className="btn btn-sm btn-secondary">←</button>
            <button onClick={() => setBaseDate(new Date())} className="btn btn-sm btn-secondary">今天</button>
            <button onClick={() => nav(1)} className="btn btn-sm btn-secondary">→</button>
          </div>
          <span className="text-sm font-medium text-gray-700 min-w-[160px]">{dateLabel}</span>
        </div>
      </div>

      {loading ? <div className="text-gray-400 py-12 text-center">加载中...</div> : (
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 overflow-auto">
            <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 sticky top-0 z-10">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-r border-b sticky left-0 bg-gray-50 min-w-[100px] z-20">人员</th>
                    {days.map(d => {
                      const ds = fmt(d);
                      const isToday = ds === today;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th key={ds} className={`px-1 py-2 text-center text-xs font-medium border-r border-b min-w-[120px] ${isToday ? 'bg-gray-100 text-gray-900' : isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-500'}`}>
                          <div>{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                          <div className={`text-sm font-bold ${isToday ? 'text-gray-900' : ''}`}>{d.getMonth() + 1}/{d.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayHandlers.length === 0 ? (
                    <tr><td colSpan={days.length + 1} className="text-center py-12 text-gray-400">暂无有计划安排的人员</td></tr>
                  ) : displayHandlers.map(handler => (
                    <tr key={handler.id} className="border-b">
                      <td className="px-3 py-2 border-r sticky left-0 bg-white z-10">
                        <div className="font-medium text-gray-800 text-xs">{handler.display_name}</div>
                      </td>
                      {days.map(d => {
                        const ds = fmt(d);
                        const cellReqs = getReqs(handler.id, ds);
                        const isToday = ds === today;
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <td key={ds} className={`px-1 py-1 border-r align-top ${isToday ? 'bg-gray-100/30' : isWeekend ? 'bg-gray-50/50' : ''}`}>
                            {cellReqs.length > 0 ? (
                              <div className="space-y-1">
                                {cellReqs.map(r => (
                                  <button key={r.id}
                                    onClick={() => setSelectedReq(selectedReq?.id === r.id ? null : r)}
                                    className={`w-full text-left text-[11px] leading-tight rounded-md px-2 py-1.5 transition-all cursor-pointer border ${
                                      selectedReq?.id === r.id
                                        ? 'ring-2 ring-gray-500 shadow-sm'
                                        : 'hover:shadow-sm hover:scale-[1.02]'
                                    }`}
                                    style={{
                                      background: (STATUS_COLORS[r.status] || '#9CA3AF') + '15',
                                      borderColor: (STATUS_COLORS[r.status] || '#9CA3AF') + '40',
                                      color: STATUS_COLORS[r.status] || '#6B7280',
                                    }}>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px]">{PRIORITY_DOT[r.priority]}</span>
                                      <span className="truncate font-medium">{r.title}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div></div>
          </div>

          {/* Requirement Detail Panel */}
          {selectedReq && (
            <div className="w-80 shrink-0 card" style={{ maxHeight: 'calc(100vh - 64px - 160px)' }}>
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <h3 className="card-title">需求详情</h3>
                  <button onClick={() => setSelectedReq(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                </div>
              </div>
              <div className="card-body">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">#{selectedReq.id}</span>
                  <span className="badge badge-primary" style={{ background: (STATUS_COLORS[selectedReq.status] || '#9CA3AF') + '20', color: STATUS_COLORS[selectedReq.status] }}>
                    {selectedReq.status_label}
                  </span>
                  <span className="text-sm">{PRIORITY_DOT[selectedReq.priority]} {selectedReq.priority_label}</span>
                </div>
                <h4 className="text-base font-semibold text-gray-900 mb-3">{selectedReq.title}</h4>

                <div className="space-y-2.5 text-sm">
                  <InfoRow label="处理人" value={selectedReq.handler_name} />
                  <InfoRow label="项目" value={selectedReq.project_name || '—'} />
                  <InfoRow label="分类" value={selectedReq.category === 'project' ? '项目需求' : '零星需求'} />
                  <InfoRow label="计划开始" value={selectedReq.planned_start} />
                  <InfoRow label="计划完成" value={selectedReq.planned_end} />
                </div>

                <div className="mt-4 pt-4 border-t">
                  <Link href={`/requirements/${selectedReq.id}`}
                    className="block w-full text-center px-4 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition">
                    查看完整详情 & 关联需求 →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
