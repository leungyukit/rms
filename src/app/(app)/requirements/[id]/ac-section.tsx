'use client';

import { useEffect, useState } from 'react';

const AC_STATUS_LABEL: Record<string, string> = {
  pending: '待验证',
  passed: '已通过',
  failed: '未通过',
  skipped: '已跳过',
};
const AC_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 border-gray-300',
  passed: 'bg-green-50 text-green-700 border-green-300',
  failed: 'bg-red-50 text-red-700 border-red-300',
  skipped: 'bg-yellow-50 text-yellow-700 border-yellow-300',
};
const AC_TYPE_LABEL: Record<string, string> = {
  manual: '人工',
  auto: '自动',
  metric: '指标',
};
const AC_TYPE_COLOR: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-600',
  auto: 'bg-gray-200 text-gray-900',
  metric: 'bg-gray-200 text-gray-800',
};

interface AC {
  id: number;
  requirement_id: number;
  sequence: number;
  criterion_text: string;
  acceptance_type: string;
  target_value: string | null;
  is_required: number;
  status: string;
  evidence: string | null;
  verified_by: number | null;
  verified_at: string | null;
  created_by: number;
  created_by_name?: string;
  verified_by_name?: string | null;
  updated_at?: string;
}

interface AcAggregate {
  ac_total: number;
  ac_passed: number;
  ac_required_total: number;
  ac_required_passed: number;
  ac_required_blocking: number;
  ac_progress_pct: number;
  ac_required_pct: number;
  ac_can_complete: boolean;
}

export function AcceptanceCriteriaSection({
  requirementId,
  aggregate,
  onChanged,
}: {
  requirementId: number;
  aggregate: AcAggregate;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<AC[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<AC[]>([]);
  const [templates, setTemplates] = useState<Array<{ key: string; label: string; items: any[] }>>([]);
  const [showTplDrawer, setShowTplDrawer] = useState(false);
  const [evidenceEditing, setEvidenceEditing] = useState<number | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/requirements/${requirementId}/acceptance-criteria`);
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (templates.length > 0) return;
    const r = await fetch('/api/acceptance-criteria?templates=1', { credentials: 'include' });
    const j = await r.json();
    setTemplates(Array.isArray(j.data) ? j.data : []);
  };

  useEffect(() => { load(); }, [requirementId]);

  const startEdit = () => {
    setDrafts(items.length > 0
      ? items.map(i => ({ ...i }))
      : [{ id: 0, requirement_id: requirementId, sequence: 1, criterion_text: '', acceptance_type: 'manual', target_value: null, is_required: 1, status: 'pending', evidence: null, verified_by: null, verified_at: null, created_by: 0 } as AC]);
    setEditing(true);
  };

  const addDraft = () => {
    setDrafts(prev => [...prev, {
      id: 0, requirement_id: requirementId, sequence: prev.length + 1,
      criterion_text: '', acceptance_type: 'manual', target_value: null, is_required: 1,
      status: 'pending', evidence: null, verified_by: null, verified_at: null, created_by: 0,
    } as AC]);
  };

  const removeDraft = (idx: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, sequence: i + 1 })));
  };

  const applyTemplate = (tpl: { items: any[] }) => {
    const newDrafts = tpl.items.map((it: any, i: number) => ({
      id: 0, requirement_id: requirementId, sequence: drafts.length + i + 1,
      criterion_text: it.text || '',
      acceptance_type: it.type || 'manual',
      target_value: it.target || null,
      is_required: it.required === false ? 0 : 1,
      status: 'pending', evidence: null, verified_by: null, verified_at: null, created_by: 0,
    } as AC));
    setDrafts(prev => [...prev, ...newDrafts]);
    setShowTplDrawer(false);
  };

  const saveDrafts = async () => {
    const valid = drafts.filter(d => d.criterion_text.trim());
    if (valid.length === 0 && drafts.length > 0) {
      alert('请至少填写一条验收点');
      return;
    }
    const res = await fetch(`/api/requirements/${requirementId}/acceptance-criteria`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: valid.map((d, i) => ({
        sequence: i + 1,
        criterion_text: d.criterion_text.trim(),
        acceptance_type: d.acceptance_type,
        target_value: d.target_value,
        is_required: d.is_required,
      }))}),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error || '保存失败');
      return;
    }
    setEditing(false);
    await load();
    onChanged();
  };

  const updateStatus = async (acId: number, newStatus: string) => {
    await fetch(`/api/acceptance-criteria/${acId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
    onChanged();
  };

  const startEvidence = (ac: AC) => {
    setEvidenceEditing(ac.id);
    setEvidenceDraft(ac.evidence || '');
  };

  const saveEvidence = async () => {
    if (evidenceEditing == null) return;
    await fetch(`/api/acceptance-criteria/${evidenceEditing}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: evidenceDraft }),
    });
    setEvidenceEditing(null);
    setEvidenceDraft('');
    await load();
  };

  const removeAc = async (acId: number) => {
    if (!confirm('确认删除此验收点？')) return;
    await fetch(`/api/acceptance-criteria/${acId}`, { method: 'DELETE' });
    await load();
    onChanged();
  };

  if (loading) {
    return <div className="text-sm text-gray-400 py-4">加载中...</div>;
  }

  return (
    <div>
      {/* 顶部进度条 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">总进度</span>
            <span className="font-mono font-medium">{aggregate.ac_passed}/{aggregate.ac_total}</span>
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${aggregate.ac_progress_pct}%` }} />
            </div>
            <span className="text-xs text-gray-500">{aggregate.ac_progress_pct}%</span>
          </div>
          {aggregate.ac_required_total > 0 && (
            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-gray-600">必选</span>
              <span className="font-mono font-medium">{aggregate.ac_required_passed}/{aggregate.ac_required_total}</span>
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${aggregate.ac_required_blocking > 0 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${aggregate.ac_required_pct}%` }} />
              </div>
              {aggregate.ac_required_blocking > 0 && (
                <span className="text-xs text-orange-600">⛔ {aggregate.ac_required_blocking} 条阻塞 completed</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && items.length > 0 && (
            <button onClick={startEdit} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">编辑列表</button>
          )}
          {!editing && items.length === 0 && (
            <button onClick={startEdit} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900">+ 初始化 AC</button>
          )}
        </div>
      </div>

      {/* 编辑模式：可改可加可引用模板 */}
      {editing && (
        <div className="space-y-2 mb-4">
          <div className="flex gap-2 mb-2">
            <button onClick={() => { loadTemplates(); setShowTplDrawer(true); }}
              className="text-xs px-3 py-1.5 border border-dashed border-gray-400 text-gray-900 rounded-lg hover:bg-gray-100">
              📋 从模板填充
            </button>
            <span className="text-xs text-gray-400 self-center">（性能/功能/安全/兼容/数据 5 套）</span>
          </div>
          {drafts.map((d, idx) => (
            <div key={idx} className="border rounded-lg p-2 bg-gray-50">
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 font-mono mt-2 w-6 text-right">{d.sequence}.</span>
                <input
                  value={d.criterion_text}
                  onChange={e => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, criterion_text: e.target.value } : x))}
                  placeholder="验收点描述（必填）"
                  className="flex-1 text-sm px-2 py-1.5 border rounded bg-white"
                />
                <select
                  value={d.acceptance_type}
                  onChange={e => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, acceptance_type: e.target.value } : x))}
                  className="text-xs px-2 py-1.5 border rounded bg-white"
                >
                  <option value="manual">人工</option>
                  <option value="auto">自动</option>
                  <option value="metric">指标</option>
                </select>
                {d.acceptance_type === 'metric' && (
                  <input
                    value={d.target_value || ''}
                    onChange={e => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, target_value: e.target.value } : x))}
                    placeholder="目标值 (200ms)"
                    className="w-24 text-xs px-2 py-1.5 border rounded bg-white"
                  />
                )}
                <label className="flex items-center gap-1 text-xs px-2 py-1.5 border rounded bg-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.is_required === 1}
                    onChange={e => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, is_required: e.target.checked ? 1 : 0 } : x))}
                  />
                  必选
                </label>
                <button onClick={() => removeDraft(idx)} className="text-xs text-red-500 hover:text-red-700 px-2">✕</button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={addDraft} className="text-xs px-3 py-1.5 border border-dashed rounded-lg text-gray-600 hover:bg-gray-50">+ 添加一行</button>
            <div className="flex-1" />
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 border rounded-lg">取消</button>
            <button onClick={saveDrafts} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg">保存</button>
          </div>
        </div>
      )}

      {/* 模板抽屉 */}
      {showTplDrawer && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setShowTplDrawer(false)}>
          <div className="bg-white w-96 h-full p-4 overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">选择 AC 模板</h3>
              <button onClick={() => setShowTplDrawer(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{t.label}</span>
                    <span className="text-xs text-gray-400">{t.items.length} 条</span>
                  </div>
                  <ul className="text-xs text-gray-600 space-y-1 mb-2 max-h-32 overflow-auto">
                    {t.items.map((it, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <span>• {it.text}</span>
                        {it.target && <span className="text-gray-800 font-mono">[{it.target}]</span>}
                        {it.required === false && <span className="text-gray-400 text-[10px]">(可选)</span>}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => applyTemplate(t)} className="w-full text-xs py-1.5 bg-gray-800 text-white rounded hover:bg-gray-900">
                    + 追加到当前列表
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 只读/操作模式：列出现有 AC */}
      {!editing && items.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-6 border border-dashed rounded-lg">
          📋 本需求尚未配置验收标准
          <div className="text-xs mt-1">点击右上"初始化 AC"按钮开始配置</div>
        </div>
      )}

      {!editing && items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(ac => (
            <div key={ac.id} className={`border rounded-lg p-3 ${ac.status === 'passed' ? 'bg-green-50/50' : ac.status === 'failed' ? 'bg-red-50/50' : 'bg-white'}`}>
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-500 font-mono mt-0.5">AC-{ac.sequence}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${ac.status === 'passed' ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                    {ac.criterion_text}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded ${AC_TYPE_COLOR[ac.acceptance_type] || 'bg-gray-100'}`}>
                      {AC_TYPE_LABEL[ac.acceptance_type] || ac.acceptance_type}
                    </span>
                    {ac.target_value && <span className="font-mono text-gray-800">[{ac.target_value}]</span>}
                    {ac.is_required === 1 && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">必选</span>}
                    {ac.evidence && (
                      <span className="text-gray-400" title={ac.evidence}>
                        📎 证据: {ac.evidence.length > 30 ? ac.evidence.slice(0, 30) + '...' : ac.evidence}
                      </span>
                    )}
                    {ac.verified_by_name && <span className="text-gray-400">· 验证人: {ac.verified_by_name}</span>}
                  </div>
                  {evidenceEditing === ac.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={evidenceDraft}
                        onChange={e => setEvidenceDraft(e.target.value)}
                        placeholder="证据链接/说明"
                        className="flex-1 text-xs px-2 py-1.5 border rounded"
                      />
                      <button onClick={saveEvidence} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded">保存</button>
                      <button onClick={() => setEvidenceEditing(null)} className="text-xs px-3 py-1.5 border rounded">取消</button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded border ${AC_STATUS_COLOR[ac.status] || ''}`}>
                    {AC_STATUS_LABEL[ac.status] || ac.status}
                  </span>
                  <div className="flex gap-1">
                    {ac.status !== 'passed' && (
                      <button onClick={() => updateStatus(ac.id, 'passed')} title="通过"
                        className="text-xs w-6 h-6 rounded bg-green-100 hover:bg-green-200 text-green-700">✓</button>
                    )}
                    {ac.status !== 'failed' && (
                      <button onClick={() => updateStatus(ac.id, 'failed')} title="不通过"
                        className="text-xs w-6 h-6 rounded bg-red-100 hover:bg-red-200 text-red-700">✗</button>
                    )}
                    {ac.status !== 'skipped' && ac.status !== 'passed' && (
                      <button onClick={() => updateStatus(ac.id, 'skipped')} title="跳过"
                        className="text-xs w-6 h-6 rounded bg-yellow-100 hover:bg-yellow-200 text-yellow-700">⊘</button>
                    )}
                    {ac.status === 'passed' && (
                      <button onClick={() => updateStatus(ac.id, 'pending')} title="回退到待验证"
                        className="text-xs w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">↺</button>
                    )}
                    <button onClick={() => startEvidence(ac)} title="证据"
                      className="text-xs w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">📎</button>
                    <button onClick={() => removeAc(ac.id)} title="删除"
                      className="text-xs w-6 h-6 rounded bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600">🗑</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
