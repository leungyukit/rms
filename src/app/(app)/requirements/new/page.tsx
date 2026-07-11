'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/config';
import { useRequirementOptions } from '@/lib/use-requirement-options';

const COLUMNS = [
  { key: 'title', label: '需求标题 *', width: 200, placeholder: '标题（必填）' },
  { key: 'description', label: '详细描述', width: 220, placeholder: '描述' },
  { key: 'business_unit', label: '业务方', width: 100, placeholder: '业务方' },
  { key: 'requester_name', label: '提出人', width: 90, placeholder: '提出人' },
  { key: 'priority', label: '优先级', width: 70, placeholder: '高/中/低' },
  { key: 'category', label: '分类', width: 80, placeholder: '项目/零星' },
  { key: 'project', label: '归属项目', width: 120, placeholder: '项目名称' },
  { key: 'handler', label: '负责人', width: 90, placeholder: '负责人姓名' },
  { key: 'story_points', label: 'SP', width: 70, placeholder: '1/2/3/5/8/13/21' },
  { key: 'estimate_hours', label: '估算(h)', width: 90, placeholder: '估算工时' },
  { key: 'tags', label: '标签', width: 120, placeholder: '逗号分隔' },
  { key: 'benefit', label: 'Benefit', width: 160, placeholder: '需求价值' },
  { key: 'planned_start', label: '计划开始', width: 110, placeholder: 'YYYY-MM-DD' },
  { key: 'planned_end', label: '计划完成', width: 110, placeholder: 'YYYY-MM-DD' },
];

const SP_ALLOW_VALUES = [1, 2, 3, 5, 8, 13, 21];

const emptyRow = () => Object.fromEntries(COLUMNS.map(c => [c.key, '']));

export default function NewRequirementPage() {
  const { t } = useT();
  const { priorities, categories, statuses } = useRequirementOptions();
  const router = useRouter();
  const [mode, setMode] = useState<'form' | 'table'>('form');
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    title: '', description: '', business_unit: '', priority: 'medium',
    status: 'received_not_evaluated', category: 'project', project_id: '',
    requester_name: '', handler_id: '', verifier_id: '', benefit: '',
    planned_start: '', planned_end: '', tags: '',
    story_points: '', estimate_hours: '', actual_hours: '0',
    priority_framework: '', priority_score: '',
  });

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const [rows, setRows] = useState<Record<string, string>[]>(() => Array.from({ length: 5 }, emptyRow));
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/projects', { credentials: 'include' }).then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/users', { credentials: 'include' }).then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/templates', { credentials: 'include' }).then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;
    const tmpl = templates.find(t => t.id === parseInt(templateId));
    if (!tmpl) return;
    setForm(prev => ({
      ...prev,
      title: tmpl.title_template || prev.title,
      description: tmpl.description_template || prev.description,
      business_unit: tmpl.business_unit || prev.business_unit,
      priority: tmpl.priority || prev.priority,
      category: tmpl.category || prev.category,
      benefit: tmpl.benefit_template || prev.benefit,
    }));
  };

  const [dedupCandidates, setDedupCandidates] = useState<Array<{ id: number; title: string; status: string; similarity: number; matched_substring: string }>>([]);
  const [dedupThreshold, setDedupThreshold] = useState(0.6);
  const [dedupChecking, setDedupChecking] = useState(false);
  const checkDedup = async (title: string) => {
    if (title.trim().length < 6) { setDedupCandidates([]); return; }
    setDedupChecking(true);
    try {
      const r = await fetch(`/api/dedup/check?title=${encodeURIComponent(title)}`);
      const j = await r.json();
      setDedupCandidates(j.candidates || []);
      setDedupThreshold(j.threshold || 0.6);
    } finally { setDedupChecking(false); }
  };

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const uploadPendingFiles = async (reqId: number) => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('requirement_id', String(reqId));
      pendingFiles.forEach(f => fd.append('files', f));
      await fetch('/api/attachments', { method: 'POST', body: fd });
      setPendingFiles([]);
    } catch {}
    finally { setUploading(false); }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('需求标题不能为空'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const body: any = { ...form };
      body.project_id = body.project_id ? parseInt(body.project_id) : null;
      body.handler_id = body.handler_id ? parseInt(body.handler_id) : null;
      body.verifier_id = body.verifier_id ? parseInt(body.verifier_id) : null;
      body.tags = body.tags ? body.tags.split(/[,，\s]+/).filter(Boolean) : [];
      body.story_points = body.story_points === '' || body.story_points == null ? null : Number(body.story_points);
      body.estimate_hours = body.estimate_hours === '' || body.estimate_hours == null ? null : Number(body.estimate_hours);
      body.actual_hours = body.actual_hours === '' || body.actual_hours == null ? 0 : Number(body.actual_hours);
      body.priority_score = body.priority_score === '' || body.priority_score == null ? null : Number(body.priority_score);
      body.priority_framework = body.priority_framework || null;
      const res = await fetch('/api/requirements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '创建失败'); return; }
      const newId = data.id;
      await uploadPendingFiles(newId);
      router.push(`/requirements/${newId}`);
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  };

  const updateCell = (rowIdx: number, colKey: string, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colKey]: value };
      return next;
    });
  };

  const addRows = (count: number = 5) => {
    setRows(prev => [...prev, ...Array.from({ length: count }, emptyRow)]);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const pastedRows = text.split(/\r?\n/).filter(line => line.trim()).map(line => line.split('\t'));
    if (pastedRows.length === 0) return;
    const startRow = activeCell?.row ?? 0;
    const startCol = activeCell?.col ?? 0;
    setRows(prev => {
      const next = [...prev];
      while (next.length < startRow + pastedRows.length) next.push(emptyRow());
      for (let r = 0; r < pastedRows.length; r++) {
        for (let c = 0; c < pastedRows[r].length; c++) {
          const colIdx = startCol + c;
          if (colIdx < COLUMNS.length) {
            const colKey = COLUMNS[colIdx].key;
            next[startRow + r] = { ...next[startRow + r], [colKey]: pastedRows[r][c].trim() };
          }
        }
      }
      return next;
    });
    setSuccess(`已粘贴 ${pastedRows.length} 行数据`);
    setTimeout(() => setSuccess(''), 3000);
  }, [activeCell]);

  const submitTable = async () => {
    const validRows = rows.filter(r => r.title?.trim());
    if (validRows.length === 0) { setError('请至少填写一行需求标题'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const payload = validRows.map((r) => {
        const sp = r.story_points?.trim();
        const eh = r.estimate_hours?.trim();
        return {
          ...r,
          story_points: sp === '' || sp == null ? null : Number(sp),
          estimate_hours: eh === '' || eh == null ? null : Number(eh),
        };
      });
      const res = await fetch('/api/requirements/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '批量创建失败'); return; }
      setSuccess(`✅ 成功创建 ${data.created} 条需求${data.errors?.length ? `，${data.errors.length} 条跳过` : ''}`);
      if (data.errors?.length) setError(data.errors.join('\n'));
      setRows(Array.from({ length: 5 }, emptyRow));
    } catch { setError('网络错误'); }
    finally { setLoading(false); }
  };

  const clearTable = () => {
    setRows(Array.from({ length: 5 }, emptyRow));
    setError(''); setSuccess('');
  };

  const validCount = rows.filter(r => r.title?.trim()).length;

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>➕ 新建需求</h1>
        <p>快速创建需求，支持表单或表格批量导入</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setMode('form')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${mode === 'form' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            📝 表单模式
          </button>
          <button onClick={() => setMode('table')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${mode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            📊 表格模式
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4 whitespace-pre-wrap">{error}</div>}
      {success && <div className="alert alert-success mb-4">{success}</div>}

      {mode === 'form' ? (
        <form onSubmit={submitForm} className="card mb-4"><div className="card-body">
          {/* Template selector */}
          {templates.length > 0 && (
            <div className="alert alert-info mb-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">📋 {t('requirement.useTemplate')}：</span>
                <select value={selectedTemplate} onChange={e => applyTemplate(e.target.value)} className="form-input flex-1 max-w-xs">
                  <option value="">— 不使用模板 —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Field label={t('requirement.newRequirement')}>
            <input value={form.title} onChange={e => { set('title', e.target.value); }} onBlur={e => checkDedup(e.target.value)} className="form-input" placeholder={t('requirement.titlePlaceholder')} required />
            {dedupCandidates.length > 0 && (
              <div className="alert alert-warning mt-2">
                <div className="text-xs mb-2">⚠️ {t('dedup.duplicates')} {dedupCandidates.length}（{t('dedup.threshold')} {(dedupThreshold*100).toFixed(0)}%）</div>
                <div className="space-y-1.5">
                  {dedupCandidates.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm bg-white rounded px-2 py-1.5">
                      <span className="text-xs text-gray-400 font-mono w-8">#{c.id}</span>
                      <span className="badge badge-warning">{(c.similarity*100).toFixed(0)}%</span>
                      <span className="flex-1 truncate">{c.title}</span>
                      <span className="text-xs text-gray-500">{c.status}</span>
                      <a href={`/requirements/${c.id}`} target="_blank" className="text-xs text-gray-800 hover:underline">查看</a>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-2">{t('dedup.mergeConfirm')}</div>
              </div>
            )}
          </Field>

          <Field label={t('requirement.description')}>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className="form-input min-h-[180px]" placeholder={t('requirement.descriptionPlaceholder')} />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label={t('requirement.storyPoints')}>
              <select value={form.story_points} onChange={e => set('story_points', e.target.value)} className="form-input">
                <option value="">{t('requirement.storyPointsNull')}</option>
                {SP_ALLOW_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label={t('requirement.estimatedHours')}>
              <div className="flex items-center gap-1">
                <input type="number" min={0} step={0.5} value={form.estimate_hours} onChange={e => set('estimate_hours', e.target.value)} className="form-input" placeholder="16" />
                <span className="text-sm text-gray-500">h</span>
              </div>
            </Field>
            <Field label={t('requirement.actualHours')}>
              <div className="flex items-center gap-1">
                <input type="number" min={0} step={0.5} value={form.actual_hours} onChange={e => set('actual_hours', e.target.value)} disabled className="form-input bg-gray-50 cursor-not-allowed" placeholder="0" />
                <span className="text-sm text-gray-500">h</span>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('requirement.businessUnit')}><input value={form.business_unit} onChange={e => set('business_unit', e.target.value)} className="form-input" placeholder={t('requirement.businessUnit')} /></Field>
            <Field label={t('requirement.requester')}><input value={form.requester_name} onChange={e => set('requester_name', e.target.value)} className="form-input" placeholder={t('requirement.requester')} /></Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label={t('requirement.priority')}>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className="form-input">
                {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label={t('requirement.status')}>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="form-input">
                {statuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label={t('requirement.category')}>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="form-input">
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="优先级框架">
              <select value={form.priority_framework} onChange={e => set('priority_framework', e.target.value)} className="form-input">
                <option value="">— 无 —</option>
                <option value="MoSCoW">MoSCoW</option>
                <option value="Kano">Kano</option>
                <option value="WSJF">WSJF</option>
              </select>
            </Field>
            <Field label="优先级评分">
              <input type="number" min={0} step={0.1} value={form.priority_score} onChange={e => set('priority_score', e.target.value)} className="form-input" placeholder="0.0" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label={t('requirement.project')}>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className="form-input">
                <option value="">-- {t('requirement.selectProject')} --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={t('requirement.handler')}>
              <select value={form.handler_id} onChange={e => set('handler_id', e.target.value)} className="form-input">
                <option value="">-- {t('requirement.selectHandler')} --</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </Field>
            <Field label={t('knowledge.approved')}>
              <select value={form.verifier_id} onChange={e => set('verifier_id', e.target.value)} className="form-input">
                <option value="">-- {t('requirement.selectHandler')} --</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
              </select>
            </Field>
          </div>

          <Field label={t('requirement.benefit')}>
            <textarea value={form.benefit} onChange={e => set('benefit', e.target.value)} className="form-input min-h-[120px]" placeholder={t('requirement.benefit')} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('sprint.startDate')}><input type="date" value={form.planned_start} onChange={e => set('planned_start', e.target.value)} className="form-input" /></Field>
            <Field label={t('sprint.endDate')}><input type="date" value={form.planned_end} onChange={e => set('planned_end', e.target.value)} className="form-input" /></Field>
          </div>

          <Field label={t('requirement.tags')}>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} className="form-input" placeholder={t('requirement.tagsPlaceholder')} />
          </Field>

          {/* 上传附件 */}
          <div className="mb-4">
            <label className="form-label">📎 上传附件</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-gray-400 transition">
              <input type="file" multiple onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 file:text-gray-900 hover:file:bg-gray-200" />
              {pendingFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="truncate flex-1">{f.name} <span className="text-gray-400">{(f.size / 1024).toFixed(1)} KB</span></span>
                      <button type="button" onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || uploading} className="btn btn-primary">
              {(loading || uploading) ? t('misc.processing') : t('requirement.newRequirement')}
            </button>
            <button type="button" onClick={() => router.back()} className="btn btn-secondary">{t('common.cancel')}</button>
          </div>
        </div></form>
      ) : (
        <div>
          <div className="alert alert-info mb-4">
            <strong>💡 {t('import.title')}：</strong>{t('requirement.title')}
            {t('requirement.bulkImport')}：{COLUMNS.map(c => c.label.replace(' *', '')).join(' → ')}
          </div>

          <div className="card mb-4" ref={tableRef} onPaste={handlePaste}><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-2.5 text-xs text-gray-400 font-medium border-r w-10 sticky left-0 bg-gray-50">#</th>
                    {COLUMNS.map(c => (
                      <th key={c.key} className="px-2 py-2.5 text-xs text-gray-500 font-medium border-r text-left whitespace-nowrap" style={{ minWidth: c.width }}>
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className={`border-t ${row.title?.trim() ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-2 py-1 text-xs text-gray-300 border-r text-center sticky left-0 bg-white">{ri + 1}</td>
                      {COLUMNS.map((c, ci) => (
                        <td key={c.key} className="border-r p-0">
                          <input value={row[c.key] || ''} onChange={e => updateCell(ri, c.key, e.target.value)}
                            onFocus={() => setActiveCell({ row: ri, col: ci })} placeholder={c.placeholder}
                            className={`w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:bg-gray-100 transition ${activeCell?.row === ri && activeCell?.col === ci ? 'bg-gray-100' : ''}`}
                            style={{ minWidth: c.width }} />
                        </td>
                      ))}
                      <td className="px-1">
                        <button onClick={() => setRows(prev => prev.filter((_, i) => i !== ri))} className="text-gray-300 hover:text-red-400 text-xs p-1">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div></div></div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={() => addRows(5)} className="btn btn-sm btn-secondary">+ {t('common.add')} 5</button>
              <button onClick={() => addRows(20)} className="btn btn-sm btn-secondary">+ {t('common.add')} 20</button>
              <button onClick={clearTable} className="btn btn-sm btn-secondary">{t('common.reset')}</button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{t('common.total', { n: validCount + ' / ' + rows.length })}</span>
              <button onClick={submitTable} disabled={loading || validCount === 0} className="btn btn-primary">
                {loading ? t('misc.processing') : `${t('requirement.bulkImport')} ${validCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}
