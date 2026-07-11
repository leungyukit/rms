'use client';

import { useState, useRef } from 'react';

const FIELDS = [
  { target: 'title', label: '标题', required: true },
  { target: 'description', label: '描述', required: false },
  { target: 'business_unit', label: '业务方', required: false },
  { target: 'priority', label: '优先级', required: false },
  { target: 'category', label: '类别', required: false },
  { target: 'project_name', label: '所属项目', required: false },
  { target: 'handler_username', label: '处理人', required: false },
  { target: 'requester_name', label: '提出人', required: false },
  { target: 'benefit', label: '价值/收益', required: false },
  { target: 'planned_start', label: '计划开始', required: false },
  { target: 'planned_end', label: '计划结束', required: false },
  { target: 'tags', label: '标签', required: false },
];

export default function ImportDrawer({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importId, setImportId] = useState<number | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMapping, setAutoMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [extraSheets, setExtraSheets] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1); setFile(null); setImportId(null); setColumns([]); setMapping({});
    setAutoMapping({}); setPreview([]); setErrors([]); setValidCount(0); setInvalidCount(0);
    setResult(null); setExtraSheets([]);
  };

  const close = () => { reset(); onClose(); };

  const handleFile = async (f: File) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('文件不能超过 10MB'); return; }
    setFile(f);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('dry_run', '1');
      const r = await fetch('/api/requirements/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          alert(`该文件 24h 内已导入过（#${j.import_id}）`);
          setFile(null);
        } else {
          alert(j.error || '解析失败');
          setFile(null);
        }
        return;
      }
      setImportId(j.import_id);
      setColumns(Object.keys(j.auto_mapping || {}));
      setMapping(j.auto_mapping || {});
      setAutoMapping(j.auto_mapping || {});
      setPreview(j.preview || []);
      setErrors(j.errors || []);
      setValidCount(j.summary.valid);
      setInvalidCount(j.summary.invalid);
      setExtraSheets(j.extra_sheets || []);
      setStep(2);
    } catch (e: any) {
      alert('上传失败: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dry_run', '0');
      fd.append('mapping', JSON.stringify(mapping));
      const r = await fetch('/api/requirements/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '提交失败'); return; }
      setResult(j);
      setStep(3);
      onSuccess?.();
    } catch (e: any) {
      alert('提交失败: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black bg-opacity-30" onClick={close} />
      <div className="w-[520px] bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-medium">📥 批量导入需求</h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* 步骤指示 */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs">
          <span className={step === 1 ? 'font-bold text-gray-900' : 'text-gray-500'}>① 选文件</span>
          <span>→</span>
          <span className={step === 2 ? 'font-bold text-gray-900' : 'text-gray-500'}>② 字段映射</span>
          <span>→</span>
          <span className={step === 3 ? 'font-bold text-gray-900' : 'text-gray-500'}>③ 完成</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 步骤 1 */}
          {step === 1 && (
            <div>
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-100"
              >
                <div className="text-4xl mb-2">📁</div>
                <div className="text-sm text-gray-600">拖拽 Excel/CSV 文件到此处</div>
                <div className="text-xs text-gray-400 mt-1">或点击选择 · 最大 10MB · 最多 5000 行</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden"
                  onChange={e => handleFile(e.target.files?.[0] as File)} />
              </div>
              {uploading && <div className="text-center text-sm text-gray-500 mt-4">解析中...</div>}
              <div className="mt-6 p-3 bg-gray-100 rounded text-xs text-gray-900">
                <div className="font-medium mb-1">💡 没有模板？</div>
                <a href="/api/requirements/import?format=xlsx" className="text-gray-900 underline">下载 xlsx 模板</a>
                <span className="mx-2">·</span>
                <a href="/api/requirements/import?format=csv" className="text-gray-900 underline">下载 csv 模板</a>
              </div>
              {extraSheets.length > 0 && (
                <div className="mt-3 text-xs text-orange-600">⚠️ 检测到多 Sheet，将只处理第一个：{extraSheets.join(', ')}</div>
              )}
            </div>
          )}

          {/* 步骤 2 */}
          {step === 2 && (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-2">
                📋 共 {validCount + invalidCount} 行 · ✅ {validCount} 合法 · ❌ {invalidCount} 非法
              </div>
              <div className="border rounded">
                <div className="grid grid-cols-2 bg-gray-50 text-xs font-medium px-3 py-2">
                  <span>文件列名</span>
                  <span>映射到</span>
                </div>
                {columns.map(col => (
                  <div key={col} className="grid grid-cols-2 items-center px-3 py-1.5 border-t text-sm">
                    <span className="truncate">{col}</span>
                    <select value={mapping[col] || ''} onChange={e => setMapping({ ...mapping, [col]: e.target.value })}
                      className={`ml-2 px-2 py-1 text-sm border rounded ${mapping[col] ? 'bg-green-50' : 'bg-yellow-50'}`}>
                      <option value="">— 不映射 —</option>
                      {FIELDS.map(f => (
                        <option key={f.target} value={f.target}>
                          {f.label} {f.required && '*'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {errors.length > 0 && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <div className="font-medium text-red-800 mb-1">❌ 非法行（{errors.length}）：</div>
                  {errors.slice(0, 5).map((e: any, i: number) => (
                    <div key={i} className="text-red-700">第 {e.row} 行：{e.error_message || (e.field || []).join(', ')}</div>
                  ))}
                  {errors.length > 5 && <div className="text-red-500">...还有 {errors.length - 5} 条</div>}
                </div>
              )}

              {preview.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-1">预览（前 3 条）：</div>
                  <div className="border rounded text-xs overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>{columns.map(c => <th key={c} className="px-2 py-1 text-left">{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 3).map((p: any, i: number) => (
                          <tr key={i} className="border-t">
                            {columns.map(c => <td key={c} className="px-2 py-1 truncate max-w-[100px]">{String(p[c === 'title' ? 'title' : c] || '—')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 步骤 3 */}
          {step === 3 && result && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-lg font-medium">导入完成</div>
              <div className="text-sm text-gray-500 mt-2">
                ✅ 成功 <span className="font-mono text-green-600 font-bold">{result.success}</span> 条
                {result.failed > 0 && <span> · ❌ 失败 <span className="font-mono text-red-600 font-bold">{result.failed}</span> 条</span>}
              </div>
              {result.error_report_url && (
                <a href={result.error_report_url} className="inline-block mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
                  📥 下载错误报告 CSV
                </a>
              )}
              <div className="mt-6 text-xs text-gray-400">任务 #{result.import_id} · 已保存到 requirement_imports 历史</div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="border-t p-4 flex items-center justify-between">
          {step === 1 && (
            <>
              <span className="text-xs text-gray-400">支持 .xlsx / .csv</span>
              <button onClick={close} className="px-4 py-1.5 text-sm border rounded">关闭</button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="px-4 py-1.5 text-sm border rounded">← 上一步</button>
              <button onClick={submit} disabled={submitting || !mapping || !Object.values(mapping).includes('title')}
                className="px-4 py-1.5 bg-gray-800 text-white rounded text-sm hover:bg-gray-900 disabled:opacity-50">
                {submitting ? '提交中...' : `提交（${validCount} 条）`}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <span className="text-xs text-gray-400">任务 #{(result as any)?.import_id}</span>
              <button onClick={close} className="px-4 py-1.5 bg-gray-800 text-white rounded text-sm">完成</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
