'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/i18n/config';

interface DedupItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  handler_name: string | null;
  merged_into: number | null;
}

interface DedupGroup {
  items: DedupItem[];
}

export default function AdminDedupPage() {
  const { t } = useT();
  const router = useRouter();
  const [threshold, setThreshold] = useState(0.6);
  const [includeMerged, setIncludeMerged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DedupGroup[]>([]);
  const [pairs, setPairs] = useState<any[]>([]);
  const [candidateCount, setCandidateCount] = useState(0);
  const [pairCount, setPairCount] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number | null>(null);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [mergeFlags, setMergeFlags] = useState({ attachments: true, comments: true, children: true, timeline: true, tags: true });
  const [mergeNote, setMergeNote] = useState('');
  const [merging, setMerging] = useState(false);

  const scan = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/dedup/scan?threshold=${threshold}&include_merged=${includeMerged ? 1 : 0}`);
      const j = await r.json();
      setGroups(j.groups || []);
      setPairs(j.pairs || []);
      setCandidateCount(j.candidate_count);
      setPairCount(j.pair_count);
      setGroupCount(j.group_count);
      setSelectedGroupIdx(null);
      setPrimaryId(null);
    } catch (e) {
      alert('扫描失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { scan(); }, []);

  const merge = async () => {
    if (!primaryId) { alert('请先选主需求'); return; }
    const group = groups[selectedGroupIdx!];
    const dupIds = group.items.filter(i => i.id !== primaryId).map(i => i.id);
    if (!confirm(`确认合并 ${dupIds.length} 条需求到 #${primaryId}？`)) return;

    setMerging(true);
    try {
      const r = await fetch('/api/admin/dedup/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: dupIds,
          ...mergeFlags,
          note: mergeNote,
        }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '合并失败'); return; }
      alert(`合并成功！迁移：${JSON.stringify(j.summary)}`);
      setMergeNote('');
      await scan();
    } catch (e: any) {
      alert('合并失败：' + e.message);
    } finally {
      setMerging(false);
    }
  };

  const selectedGroup = selectedGroupIdx != null ? groups[selectedGroupIdx] : null;

  return (
    <div className="p-6">
      <div className="page-header"><h1>🔍 需求去重扫描</h1><p>智能检测重复需求并合并</p></div>

      {/* 扫描控制 */}
      <div className="card mb-4"><div className="card-body">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="form-label mb-0">相似度阈值</label>
          <input type="number" min={0.1} max={1.0} step={0.05} value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="form-input w-20" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={includeMerged} onChange={e => setIncludeMerged(e.target.checked)} />
          包含已合并
        </label>
        <button onClick={scan} disabled={loading}
          className="btn btn-primary">
          {loading ? '扫描中...' : '🔍 重新扫描'}
        </button>
        <div className="flex-1" />
        <div className="text-xs text-gray-500">
          扫描 <span className="font-mono font-medium">{candidateCount}</span> 条 →
          <span className="font-mono font-medium text-orange-600 mx-1">{pairCount}</span> 个重复对 →
          <span className="font-mono font-medium text-red-600 mx-1">{groupCount}</span> 个组
        </div>
      </div>
      </div></div>

      {groups.length === 0 ? (
        <div className="card"><div className="card-body text-center text-gray-400">
          {loading ? '扫描中...' : '✅ 暂无重复需求'}
        </div></div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* 左：组列表 */}
          <div className="col-span-5 space-y-2">
            {groups.map((g, idx) => (
              <div key={idx}
                onClick={() => { setSelectedGroupIdx(idx); setPrimaryId(g.items[0]?.id); }}
                className={`card cursor-pointer transition ${selectedGroupIdx === idx ? 'border-gray-800 ring-2 ring-gray-200' : ''}`}>
                <div className="card-body">
                <div className="text-xs text-gray-500 mb-2">组 {idx + 1} · {g.items.length} 条</div>
                {g.items.map(it => (
                  <div key={it.id} className="flex items-center gap-2 py-1">
                    <span className="text-xs text-gray-400 font-mono w-8">#{it.id}</span>
                    <span className={`badge ${it.priority === 'high' ? 'badge-danger' : it.priority === 'medium' ? 'badge-warning' : 'badge-success'}`}>{it.priority}</span>
                    <span className="text-sm flex-1 truncate">{it.title}</span>
                    {it.merged_into != null && <span className="badge badge-warning">已合并</span>}
                  </div>
                ))}
                </div>
              </div>
            ))}
          </div>

          {/* 右：合并面板 */}
          <div className="col-span-7">
            {selectedGroup ? (
              <div className="card"><div className="card-body">
                <h2 className="card-title">合并详情 · 组 {selectedGroupIdx! + 1}</h2>
                <p className="text-xs text-gray-500 mb-4">选 1 条作主需求，其余合并过来</p>

                <div className="space-y-2 mb-4">
                  {selectedGroup.items.map(it => (
                    <label key={it.id} className="flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                      <input type="radio" name="primary" checked={primaryId === it.id} onChange={() => setPrimaryId(it.id)} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-500">#{it.id}</span>
                          <span className={`badge ${it.priority === 'high' ? 'badge-danger' : it.priority === 'medium' ? 'badge-warning' : 'badge-success'}`}>{it.priority}</span>
                          <span className="text-xs text-gray-500">状态: {it.status}</span>
                          {it.handler_name && <span className="text-xs text-gray-500">负责人: {it.handler_name}</span>}
                        </div>
                        <div className="text-sm mt-1">{it.title}</div>
                      </div>
                      {it.merged_into != null && (
                        <span className="badge badge-warning">已合并到 #{it.merged_into}</span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="border-t pt-3 mb-3">
                  <div className="text-sm font-medium mb-2">合并时迁移：</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries({
                      attachments: '附件', comments: '评论', children: '子任务', timeline: '时间线', tags: '标签',
                    }).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" checked={(mergeFlags as any)[k]} onChange={e => setMergeFlags({ ...mergeFlags, [k]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <textarea
                  value={mergeNote}
                  onChange={e => setMergeNote(e.target.value)}
                  placeholder="备注（可选，写在 status_log）"
                  rows={2}
                  className="form-input mb-3"
                />

                <div className="flex gap-2">
                  <button onClick={merge} disabled={merging || !primaryId}
                    className="btn btn-danger">
                    {merging ? '合并中...' : `合并到 #${primaryId}`}
                  </button>
                  <button onClick={() => setSelectedGroupIdx(null)} className="btn btn-secondary">取消选择</button>
                </div>
              </div></div>
            ) : (
              <div className="card"><div className="card-body text-center text-gray-400">
                👈 从左侧选一组开始合并
              </div></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
