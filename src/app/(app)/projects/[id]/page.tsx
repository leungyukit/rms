'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  received_not_evaluated: 'badge-gray',
  evaluated_not_scheduled: 'badge-warning',
  scheduled: 'badge-info',
  in_progress: 'badge-primary',
  completed: 'badge-success',
  verified: 'badge-info',
  closed: 'badge-gray',
};

interface Milestone {
  id: number;
  name: string;
  description: string;
  planned_date: string;
  actual_date: string | null;
  status: 'pending' | 'achieved' | 'missed' | 'cancelled';
  weight: number;
  creator_name: string | null;
}

interface HealthFactor {
  key: string;
  label: string;
  value: string | number;
  weight: number;
  contribution: number;
}

interface Health {
  score: number;
  level: 'green' | 'yellow' | 'red' | null;
  factors: HealthFactor[];
  updated_at: string;
}

const TABS = [
  { key: 'overview', label: '概览', icon: '📊' },
  { key: 'milestones', label: '里程碑', icon: '🎯' },
  { key: 'risks', label: '风险', icon: '⚠️' },
  { key: 'sprints', label: 'Sprint', icon: '🏃' },
  { key: 'requirements', label: '需求', icon: '📋' },
] as const;

const HEALTH_COLORS = {
  green: { bg: 'badge-success', text: 'text-green-700', ring: '#22c55e' },
  yellow: { bg: 'badge-warning', text: 'text-yellow-700', ring: '#eab308' },
  red: { bg: 'badge-danger', text: 'text-red-700', ring: '#ef4444' },
} as const;

const MS_STATUS = {
  pending: { c: 'badge-info', l: '计划中' },
  achieved: { c: 'badge-success', l: '已达成' },
  missed: { c: 'badge-danger', l: '已延期' },
  cancelled: { c: 'badge-gray', l: '已取消' },
} as const;

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>('');
  const [tab, setTab] = useState<typeof TABS[number]['key']>('overview');
  const [project, setProject] = useState<any>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [sprints, setSprints] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', planned_date: '', weight: 1 });
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskForm, setRiskForm] = useState({ title: '', description: '', type: 'technical', level: 'medium', strategy: 'mitigate', impact: '', mitigation_plan: '' });
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  useEffect(() => {
    if (!id) return;
    loadAll();
  }, [id]);

  const loadAll = async () => {
    const r1 = await fetch(`/api/projects`);
    const all = await r1.json();
    const p = Array.isArray(all) ? all.find((x: any) => x.id === parseInt(id)) : null;
    setProject(p);

    const [m, h, s, req, rk] = await Promise.all([
      fetch(`/api/projects/${id}/milestones`).then(r => r.json()),
      fetch(`/api/projects/${id}/health`).then(r => r.json()).catch(() => null),
      fetch(`/api/sprints?project_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/requirements?project_id=${id}&pageSize=50`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/projects/${id}/risks`).then(r => r.json()).catch(() => []),
    ]);
    setMilestones(m || []);
    setHealth(h);
    setSprints(s || []);
    setRequirements(req?.data || []);
    setRisks(rk || []);
  };

  const createMilestone = async () => {
    if (!form.name || !form.planned_date) { alert('名称和计划日期必填'); return; }
    const r = await fetch(`/api/projects/${id}/milestones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setShowCreate(false);
    setForm({ name: '', description: '', planned_date: '', weight: 1 });
    loadAll();
  };

  const achieveMilestone = async (mid: number) => {
    if (!confirm('确认达成此里程碑？')) return;
    await fetch(`/api/projects/${id}/milestones/${mid}/achieve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    loadAll();
  };

  const deleteMilestone = async (mid: number) => {
    if (!confirm('确认删除此里程碑？')) return;
    await fetch(`/api/projects/${id}/milestones/${mid}`, { method: 'DELETE' });
    loadAll();
  };

  const recompute = async () => {
    setRecomputing(true);
    try {
      const r = await fetch(`/api/projects/${id}/health`, { method: 'POST' });
      const j = await r.json();
      setHealth(j);
      const pr = await fetch('/api/projects', { credentials: 'include' }).then(r => r.json());
      setProject(Array.isArray(pr) ? pr.find((x: any) => x.id === parseInt(id)) : null);
    } finally { setRecomputing(false); }
  };

  if (!project) return <div className="p-6 text-gray-400">加载中...</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <Link href="/projects" className="hover:underline">项目</Link> / {project.name}
      </div>

      <div className="page-header">
        <h1>{project.name}</h1>
        <p>{project.description || '项目详情与管理'}</p>
      </div>
      {health?.level && (
        <div className="mb-4">
          <span className={`badge ${HEALTH_COLORS[health.level].bg} ${HEALTH_COLORS[health.level].text}`}>
            健康度 {health.score} · {health.level === 'green' ? '健康' : health.level === 'yellow' ? '需关注' : '危险'}
          </span>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 概览 Tab */}
      {tab === 'overview' && health && (
        <div className="space-y-4">
          {/* 健康度大卡 */}
          <div className={`card ${health.level ? HEALTH_COLORS[health.level].bg : ''}`}>
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <HealthRing score={health.score} level={health.level || 'yellow'} />
                  <div>
                    <div className="text-sm text-gray-600">项目健康度</div>
                    <div className="text-xs text-gray-500 mt-1">最近更新: {new Date(health.updated_at).toLocaleString('zh-CN')}</div>
                  </div>
                </div>
                <button onClick={recompute} disabled={recomputing} className="btn btn-sm btn-secondary">
                  {recomputing ? '重算中...' : '🔄 立即重算'}
                </button>
              </div>
              {/* 4 个因子进度条 */}
              <div className="grid grid-cols-2 gap-3">
                {health.factors.map(f => {
                  const pct = f.weight > 0 ? (f.contribution / f.weight) * 100 : 0;
                  return (
                    <div key={f.key} className="bg-white rounded-lg p-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">{f.label}</span>
                        <span className="font-mono text-gray-800">{f.contribution}/{f.weight}</span>
                      </div>
                      <div className="text-xs text-gray-700 mb-1">值: {f.value}</div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 统计卡 */}
          <div className="grid grid-cols-3 gap-4">
            <Link href={`/requirements?project_id=${id}`} className="card hover:border-gray-400 transition">
              <div className="card-body text-center">
                <div className="stat-value">{project.req_count || 0}</div>
                <div className="stat-label">需求总数</div>
              </div>
            </Link>
            <Link href="#milestones" onClick={() => setTab('milestones')} className="card hover:border-gray-400 transition">
              <div className="card-body text-center">
                <div className="stat-value">{milestones.length}</div>
                <div className="stat-label">里程碑数</div>
              </div>
            </Link>
            <Link href="#sprints" onClick={() => setTab('sprints')} className="card hover:border-gray-400 transition">
              <div className="card-body text-center">
                <div className="stat-value">{sprints.length}</div>
                <div className="stat-label">Sprint 数</div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* 里程碑 Tab */}
      {tab === 'milestones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="card-title">🎯 里程碑（{milestones.length}）</h2>
            <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
              {showCreate ? '取消' : '➕ 新建里程碑'}
            </button>
          </div>

          {showCreate && (
            <div className="card"><div className="card-body">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label">名称</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="form-input" placeholder="V2.0 上线" />
                </div>
                <div>
                  <label className="form-label">计划日期</label>
                  <input type="date" value={form.planned_date} onChange={e => setForm({ ...form, planned_date: e.target.value })}
                    className="form-input" />
                </div>
                <div>
                  <label className="form-label">权重 (1-10)</label>
                  <input type="number" min="1" max="10" value={form.weight} onChange={e => setForm({ ...form, weight: parseInt(e.target.value) })}
                    className="form-input" />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">里程碑描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="里程碑描述" className="form-input" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={createMilestone} className="btn btn-primary">创建</button>
              </div>
            </div></div>
          )}

          {milestones.length === 0 ? (
            <div className="card"><div className="card-body text-center text-gray-400">暂无里程碑</div></div>
          ) : (
            <>
              <MilestoneTimeline milestones={milestones} />
              <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="divide-y">
                {milestones.map(m => {
                  const badge = MS_STATUS[m.status] || MS_STATUS.pending;
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                      <span className={`badge ${badge.c}`}>{badge.l}</span>
                      <span className="text-xs text-gray-400 font-mono w-6">#{m.id}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m.name}</div>
                        {m.description && <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>}
                      </div>
                      <div className="text-xs text-gray-500">
                        计划: {m.planned_date} {m.actual_date && `· 实际: ${m.actual_date}`}
                      </div>
                      <span className="text-xs text-gray-400">权重 {m.weight}</span>
                      {m.status === 'pending' && (
                        <button onClick={() => achieveMilestone(m.id)} className="btn btn-sm btn-primary">✓ 达成</button>
                      )}
                      <button onClick={() => deleteMilestone(m.id)} className="btn btn-sm btn-danger">删除</button>
                    </div>
                  );
                })}
              </div></div></div>
            </>
          )}
        </div>
      )}

      {/* 风险 Tab */}
      {tab === 'risks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="card-title">⚠️ 风险登记（{risks.length}）</h2>
            <button onClick={() => { setShowRiskForm(!showRiskForm); setEditingRisk(null); setRiskForm({ title: '', description: '', type: 'technical', level: 'medium', strategy: 'mitigate', impact: '', mitigation_plan: '' }); }} className="btn btn-primary">
              {showRiskForm ? '取消' : '➕ 新建风险'}
            </button>
          </div>

          {showRiskForm && (
            <div className="card"><div className="card-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">标题</label>
                  <input value={riskForm.title} onChange={e => setRiskForm({ ...riskForm, title: e.target.value })}
                    className="form-input" placeholder="风险简述" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="form-label">类型</label>
                    <select value={riskForm.type} onChange={e => setRiskForm({ ...riskForm, type: e.target.value })} className="form-input">
                      <option value="technical">技术</option><option value="resource">资源</option>
                      <option value="requirement">需求</option><option value="external">外部</option>
                      <option value="compliance">合规</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">等级</label>
                    <select value={riskForm.level} onChange={e => setRiskForm({ ...riskForm, level: e.target.value })} className="form-input">
                      <option value="critical">严重</option><option value="high">高</option>
                      <option value="medium">中</option><option value="low">低</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">策略</label>
                    <select value={riskForm.strategy} onChange={e => setRiskForm({ ...riskForm, strategy: e.target.value })} className="form-input">
                      <option value="mitigate">缓解</option><option value="avoid">规避</option>
                      <option value="transfer">转移</option><option value="accept">接受</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">详细描述</label>
                <textarea value={riskForm.description} onChange={e => setRiskForm({ ...riskForm, description: e.target.value })}
                  rows={2} placeholder="详细描述" className="form-input" />
              </div>
              <div className="mb-3">
                <label className="form-label">业务影响</label>
                <textarea value={riskForm.impact} onChange={e => setRiskForm({ ...riskForm, impact: e.target.value })}
                  rows={2} placeholder="业务影响" className="form-input" />
              </div>
              <div className="mb-3">
                <label className="form-label">应对措施</label>
                <textarea value={riskForm.mitigation_plan} onChange={e => setRiskForm({ ...riskForm, mitigation_plan: e.target.value })}
                  rows={2} placeholder="应对措施" className="form-input" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={async () => {
                  if (!riskForm.title) { alert('标题必填'); return; }
                  const r = await fetch(`/api/projects/${id}/risks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(riskForm) });
                  if (r.ok) { setShowRiskForm(false); loadAll(); } else { alert('创建失败'); }
                }} className="btn btn-primary">创建</button>
              </div>
            </div></div>
          )}

          {risks.length === 0 ? (
            <div className="card"><div className="card-body text-center text-gray-400">暂无风险登记</div></div>
          ) : (
            <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="divide-y">
              {risks.map((r: any) => (
                <div key={r.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${r.level === 'critical' ? 'badge-danger' : r.level === 'high' ? 'badge-danger' : r.level === 'medium' ? 'badge-warning' : 'badge-success'}`}>{r.level}</span>
                    <span className="badge badge-gray">{r.type}</span>
                    <span className={`badge ${r.status === 'open' ? 'badge-warning' : r.status === 'mitigating' ? 'badge-info' : r.status === 'closed' ? 'badge-gray' : 'badge-primary'}`}>{r.status}</span>
                    <span className="text-xs text-gray-400">策略: {r.strategy}</span>
                    {r.owner_name && <span className="text-xs text-gray-500">· 责任人: {r.owner_name}</span>}
                    <div className="flex-1" />
                    {r.status !== 'closed' && (
                      <button onClick={async () => {
                        const note = prompt('关闭原因：');
                        if (note == null) return;
                        await fetch(`/api/projects/${id}/risks/${r.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed', resolved_note: note }) });
                        loadAll();
                      }} className="btn btn-sm btn-primary">✓ 关闭</button>
                    )}
                    <button onClick={async () => {
                      if (!confirm('确认删除？')) return;
                      await fetch(`/api/projects/${id}/risks/${r.id}`, { method: 'DELETE' });
                      loadAll();
                    }} className="btn btn-sm btn-danger">删除</button>
                  </div>
                  <div className="text-sm font-medium">{r.title}</div>
                  {r.description && <div className="text-xs text-gray-600 mt-1">{r.description}</div>}
                  {r.impact && <div className="text-xs text-red-600 mt-1">影响: {r.impact}</div>}
                  {r.mitigation_plan && <div className="text-xs text-gray-900 mt-1">措施: {r.mitigation_plan}</div>}
                  {r.resolved_note && <div className="text-xs text-green-600 mt-1">关闭原因: {r.resolved_note}</div>}
                </div>
              ))}
            </div></div></div>
          )}
        </div>
      )}

      {/* Sprint Tab */}
      {tab === 'sprints' && (
        <div className="space-y-3">
          {sprints.length === 0 ? (
            <div className="card"><div className="card-body text-center text-gray-400">
              暂无 Sprint
              <div className="mt-2"><Link href="/sprints" className="text-gray-800 hover:underline">去创建 →</Link></div>
            </div></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sprints.map(s => (
                <Link key={s.id} href={`/sprints/${s.id}`} className="card hover:border-gray-400 transition">
                  <div className="card-body">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">🏃 {s.name}</h3>
                      <span className={`badge ${s.status === 'active' ? 'badge-success' : s.status === 'planned' ? 'badge-info' : s.status === 'completed' ? 'badge-gray' : 'badge-danger'}`}>{s.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">{s.project_name} · {s.start_date} ~ {s.end_date}</div>
                    {s.goal && <div className="text-sm text-gray-700 line-clamp-2 mb-3">{s.goal}</div>}
                    {s.stats && (
                      <>
                        <div className="text-xs text-gray-500 mb-1">完成度 {s.stats.completion_rate}%</div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-gray-800" style={{ width: `${s.stats.completion_rate}%` }} />
                        </div>
                        <div className="text-xs text-gray-500">容量 {s.stats.estimated_hours}h / {s.capacity_hours}h</div>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 需求 Tab */}
      {tab === 'requirements' && (
        <div className="space-y-3">
          {requirements.length === 0 ? (
            <div className="card"><div className="card-body text-center text-gray-400">暂无需求</div></div>
          ) : (
            <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="divide-y">
              {requirements.map((r: any) => (
                <Link key={r.id} href={`/requirements/${r.id}`} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 font-mono w-8">#{r.id}</span>
                  <span className={`badge ${STATUS_COLORS[r.status] || 'badge-gray'}`}>{r.status}</span>
                  <span className="text-sm flex-1 truncate">{r.title}</span>
                </Link>
              ))}
            </div></div></div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthRing({ score, level }: { score: number; level: 'green' | 'yellow' | 'red' }) {
  const color = HEALTH_COLORS[level].ring;
  const r = 36;
  const C = 2 * Math.PI * r;
  const offset = C - (score / 100) * C;
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={C} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" fontSize="22" fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  const dates = milestones.map(m => new Date(m.planned_date).getTime());
  const min = Math.min(...dates);
  const max = Math.max(...dates, Date.now());
  const range = Math.max(1, max - min);
  return (
    <div className="card"><div className="card-body">
      <div className="text-xs text-gray-500 mb-2">时间线</div>
      <div className="relative h-16">
        <div className="absolute inset-x-2 top-1/2 h-0.5 bg-gray-200" />
        {milestones.map(m => {
          const pct = ((new Date(m.planned_date).getTime() - min) / range) * 100;
          const s = MS_STATUS[m.status as keyof typeof MS_STATUS] || MS_STATUS.pending;
          return (
            <div key={m.id} className="absolute" style={{ left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}>
              <div className={`w-3 h-3 rotate-45 border-2 ${s.c}`} title={`${m.name} (${m.planned_date})`} />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-gray-600">{m.name}</div>
            </div>
          );
        })}
      </div>
    </div></div>
  );
}
