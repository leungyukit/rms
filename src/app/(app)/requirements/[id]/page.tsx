'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/i18n/config';
import { useIsMobile } from '@/components/responsive-table';
import { MobileTabs } from '@/components/mobile-tabs';
import { useRequirementOptions } from '@/lib/use-requirement-options';
import { spBadgeClass } from '@/lib/sp-badge';
import { AcceptanceCriteriaSection as AcSectionMount } from './ac-section';
import { ChecklistSection as ChecklistSectionMount } from './checklist-section';
import WorklogSection from './worklog-section';
import { RecommendSection } from './recommend-section';

const STATUS_MAP: Record<string, string> = {
  received_not_evaluated: '仅接收，未评估', evaluated_not_scheduled: '已评估，未排期',
  scheduled: '已排期', in_progress: '处理中', completed: '已完成',
  verified: '已验证', closed: '已关闭',
};
const STATUS_COLORS: Record<string, string> = {
  received_not_evaluated: 'bg-gray-100 text-gray-700', evaluated_not_scheduled: 'bg-yellow-100 text-yellow-700',
  scheduled: 'bg-gray-200 text-gray-800', in_progress: 'bg-gray-300 text-gray-900',
  completed: 'bg-green-100 text-green-700', verified: 'bg-gray-200 text-gray-800', closed: 'bg-gray-200 text-gray-500',
};
const PRIORITY_MAP_FALLBACK: Record<string, string> = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' };
const RELATION_TYPE_LABELS: Record<string, string> = {
  related: '关联',
  depends_on: '依赖',
  blocks: '阻塞',
  implements: '实现',
  tests: '测试',
  fixes: '修复',
};

// SP 颜色规则抽到 @/lib/sp-badge
const SP_ALLOW_VALUES = [1, 2, 3, 5, 8, 13, 21];
const HOURS_PER_DAY = 8;

const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/webm', 'audio/m4a', 'audio/aac'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];

function isAudio(mime: string, name: string) { return AUDIO_TYPES.some(t => mime.startsWith(t)) || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(name); }
function isImage(mime: string, name: string) { return IMAGE_TYPES.some(t => mime.startsWith(t)) || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name); }

// Collapsible section component
function Collapsible({ title, icon, count, defaultOpen = true, children }: {
  title: string; icon: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  if (isMobile) {
    // 移动端: 始终展开，简化样式（小间距、左右少边距）
    return (
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title flex items-center gap-2">
            <span>{icon}</span>
            <span className="font-medium text-sm">{title}</span>
          </span>
          {count !== undefined && <span className="badge badge-gray">{count}</span>}
        </div>
        <div className="card-body">{children}</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-header flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <span className="card-title flex items-center gap-2">
          <span>{icon}</span>
          {title}
          {count !== undefined && <span className="badge badge-gray">{count}</span>}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

// Version item component with expand/collapse
function VersionItem({ version }: { version: any }) {
  const [expanded, setExpanded] = useState(false);
  const desc = version?.description || '';
  const hasDescription = desc.length > 100;
  
  // 本地状态映射（避免依赖 useRequirementOptions）
  const statusMap: Record<string, string> = {
    received_not_evaluated: '仅接收，未评估',
    evaluated_not_scheduled: '已评估，未排期',
    scheduled: '已排期',
    in_progress: '处理中',
    completed: '已完成',
    verified: '已验证',
    closed: '已关闭',
  };
  const priorityMap: Record<string, string> = {
    high: '🔴 高',
    medium: '🟡 中',
    low: '🟢 低',
  };
  
  const getStatusLabel = (v: string) => v ? (statusMap[v] || v) : '—';
  const getPriorityLabel = (v: string) => v ? (priorityMap[v] || v) : '—';
  
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">v{version.version}</span>
          <span className="text-xs text-gray-400">{version.created_at?.replace('T', ' ').slice(0, 16)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{version.changed_by_name}</span>
          {hasDescription && (
            <button 
              onClick={() => setExpanded(!expanded)} 
              className="text-xs text-blue-600 hover:underline"
            >
              {expanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-600 mb-1">
        {version.title && <div><span className="font-medium">标题:</span> {version.title}</div>}
        {desc && (
          <div className="mt-1">
            <span className="font-medium">描述:</span>
            {hasDescription && !expanded ? (
              <span className="text-gray-500"> {desc.slice(0, 100)}... </span>
            ) : (
              <span className="text-gray-500 whitespace-pre-wrap"> {desc}</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 mt-1">
          {version.business_unit && <span><span className="font-medium">业务方:</span> {version.business_unit}</span>}
          {version.status && <span><span className="font-medium">状态:</span> {getStatusLabel(version.status)}</span>}
          {version.priority && <span><span className="font-medium">优先级:</span> {getPriorityLabel(version.priority)}</span>}
          {version.handler_name && <span><span className="font-medium">处理人:</span> {version.handler_name}</span>}
          {version.verifier_name && <span><span className="font-medium">验证人:</span> {version.verifier_name}</span>}
        </div>
      </div>
      {version.change_summary && <div className="text-xs text-gray-500 mt-2 pt-2 border-t">{version.change_summary}</div>}
    </div>
  );
}

export default function RequirementDetailPage() {
  const { t } = useT();
  const { statuses, priorities, categories, statusLabel, priorityLabel, categoryLabel } = useRequirementOptions();
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Timeline
  const [timeline, setTimeline] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // TTS / ASR
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [asrEnabled, setAsrEnabled] = useState(false);
  const [playingTts, setPlayingTts] = useState<number | null>(null);
  const [asrResult, setAsrResult] = useState<Record<number, string>>({});
  const [asrLoading, setAsrLoading] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Comments
  const [comments, setComments] = useState<any[]>([]);
  const [wfInstance, setWfInstance] = useState<any | null>(null);
  const [wfLoading, setWfLoading] = useState(false);

  // SLA
  const [slaWarnings, setSlaWarnings] = useState<any[]>([]);
  const [slaWarningsOpen, setSlaWarningsOpen] = useState(false);
  const [ackingId, setAckingId] = useState<number | null>(null);

  // 估算（SP/estimate/actual）内联编辑
  const [estimating, setEstimating] = useState(false);
  const [estimForm, setEstimForm] = useState<{ story_points: any; estimate_hours: any; actual_hours: any }>({ story_points: null, estimate_hours: null, actual_hours: null });
  const [savingEst, setSavingEst] = useState(false);
  const [estError, setEstError] = useState('');

  // AC 验收标准（由子组件管理自身状态）
  const [acAgg, setAcAgg] = useState<any>(null);
  const [clAgg, setClAgg] = useState<any>(null);
  const refreshAggregates = async () => {
    const r = await fetch(`/api/requirements/${id}`);
    if (r.ok) {
      const j = await r.json();
      setAcAgg({
        ac_total: j.ac_total || 0,
        ac_passed: j.ac_passed || 0,
        ac_required_total: j.ac_required_total || 0,
        ac_required_passed: j.ac_required_passed || 0,
        ac_required_blocking: j.ac_required_blocking || 0,
        ac_progress_pct: j.ac_progress_pct || 0,
        ac_required_pct: j.ac_required_pct || 0,
        ac_can_complete: j.ac_can_complete || false,
      });
      setClAgg({
        checklist_total: j.checklist_total || 0,
        checklist_done: j.checklist_done || 0,
        checklist_in_progress: j.checklist_in_progress || 0,
        checklist_blocked: j.checklist_blocked || 0,
        checklist_overdue: j.checklist_overdue || 0,
        checklist_progress_pct: j.checklist_progress_pct || 0,
      });
    }
  };
  const refreshAcAgg = refreshAggregates;

  const ackSlaWarning = async (wid: number) => {
    setAckingId(wid);
    try {
      const res = await fetch(`/api/sla/warnings/${wid}/ack`, { method: 'POST' });
      if (!res.ok) throw new Error('确认失败');
      // 从列表中移除已确认的预警
      setSlaWarnings(prev => prev.filter(w => w.id !== wid));
    } catch (err) {
      console.error(err);
      alert('确认预警失败');
    }
    setAckingId(null);
  };

  const loadWf = async () => {
    setWfLoading(true);
    try {
      const d = await fetch(`/api/workflow-instances?requirement_id=${id}&status=running`, { credentials: 'include' }).then(r => r.json());
      const arr = Array.isArray(d) ? d : [];
      if (arr.length) {
        // 加载详情
        const detail = await fetch(`/api/workflow-instances?id=${arr[0].id}`, { credentials: 'include' }).then(r => r.json());
        setWfInstance(detail);
      } else {
        setWfInstance(null);
      }
    } catch { setWfInstance(null); }
    finally { setWfLoading(false); }
  };

  const advanceWf = async () => {
    if (!wfInstance) return;
    const comment = prompt('推进备注（可选）') || '';
    await fetch('/api/workflow-instances', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: wfInstance.id, action: 'complete', comment }),
    });
    loadWf();
  };

  useEffect(() => { loadWf(); }, [id]);
  useEffect(() => { if (id) refreshAggregates(); }, [id]);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Versions
  const [versions, setVersions] = useState<any[]>([]);
  const [creatingVersion, setCreatingVersion] = useState(false);

  const loadData = () => {
    if (!id) return;
    fetch(`/api/requirements/${id}`).then(r => r.json()).then(d => { setData(d); setForm(d); setLoading(false); }).catch(() => setLoading(false));
    fetch(`/api/attachments?requirement_id=${id}`).then(r => r.json()).then(setAttachments).catch(() => {});
    fetch(`/api/timeline?requirement_id=${id}`).then(r => r.json()).then(setTimeline).catch(() => {});
    fetch(`/api/requirements/${id}/comments`).then(r => r.json()).then(d => setComments(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/requirements/${id}/versions`).then(r => r.json()).then(d => setVersions(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/sla/warnings?requirement_id=${id}`).then(r => r.json()).then(d => setSlaWarnings(Array.isArray(d) ? d : (d?.data || d?.items || []))).catch(() => {});
  };

  useEffect(() => {
    loadData();
    fetch('/api/users').then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/sprints').then(r => r.json()).then(d => setSprints(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/tts').then(r => r.json()).then(d => setTtsEnabled(d.enabled)).catch(() => {});
    fetch('/api/asr').then(r => r.json()).then(d => setAsrEnabled(d.enabled)).catch(() => {});
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d?.user || d)).catch(() => {});
  }, [id]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    setAddingComment(true);
    await fetch(`/api/requirements/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newComment }) });
    setNewComment(''); loadData(); setAddingComment(false);
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm('确定删除此评论？')) return;
    await fetch(`/api/requirements/${id}/comments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: commentId }) });
    loadData();
  };

  const createVersion = async () => {
    setCreatingVersion(true);
    await fetch(`/api/requirements/${id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change_summary: '手动创建快照' }) });
    loadData(); setCreatingVersion(false);
  };

  const save = async () => {
    setSaving(true);
    // 转换日期字段为 MySQL 期望的 YYYY-MM-DD 格式
    const dateFields = ['planned_start', 'planned_end', 'actual_end'];
    const body: any = { ...form, tags: form.tags?.map?.((t: any) => t.name || t) || [] };
    for (const f of dateFields) {
      if (body[f] && typeof body[f] === 'string') {
        // 过滤掉 ISO 时间，只保留日期部分
        body[f] = body[f].split('T')[0] || null;
      }
    }
    const res = await fetch(`/api/requirements/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error || `保存失败 (${res.status})`);
      setSaving(false);
      return;
    }
    loadData(); setEditing(false); setSaving(false);
  };

  const updateStatus = async (s: string) => {
    await fetch(`/api/requirements/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }), credentials: 'include' });
    loadData();
  };

  // 保存估算字段
  const saveEstimation = async () => {
    setSavingEst(true);
    setEstError('');
    try {
      const body: any = {
        story_points: estimForm.story_points,
        estimate_hours: estimForm.estimate_hours,
        actual_hours: estimForm.actual_hours,
      };
      const res = await fetch(`/api/requirements/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          setEstError('已完成的 actual_hours 需 admin 权限');
        } else if (res.status === 400) {
          setEstError(j.error || '参数无效（SP 仅允许 1,2,3,5,8,13,21）');
        } else {
          setEstError(j.error || `保存失败 (${res.status})`);
        }
        return;
      }
      setEstimating(false);
      loadData();
    } catch (e: any) {
      setEstError('网络错误：' + (e?.message || ''));
    } finally {
      setSavingEst(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('requirement_id', String(id));
    Array.from(files).forEach(f => fd.append('files', f));
    await fetch('/api/attachments', { method: 'POST', body: fd });
    loadData(); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addNote = async () => {
    if (!newNote.trim() || !id) return;
    setAddingNote(true);
    const reqId = Number(id);
    await fetch('/api/timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirement_id: reqId, content: newNote, type: 'description' }) });
    setNewNote(''); loadData(); setAddingNote(false);
  };

  const playTts = async (text: string, entryId: number) => {
    if (playingTts === entryId) { audioRef.current?.pause(); setPlayingTts(null); return; }
    setPlayingTts(entryId);
    try {
      const resp = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!resp.ok) { setPlayingTts(null); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingTts(null);
      audio.play();
    } catch { setPlayingTts(null); }
  };

  const transcribe = async (attId: number) => {
    setAsrLoading(attId);
    try {
      const resp = await fetch('/api/asr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachment_id: attId }) });
      const data = await resp.json();
      if (data.text) setAsrResult(prev => ({ ...prev, [attId]: data.text }));
    } catch {}
    setAsrLoading(null);
  };

  const deleteAtt = async (attId: number) => {
    if (!confirm('确定删除此附件？')) return;
    await fetch('/api/attachments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: attId }) });
    loadData();
  };

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>;
  if (!data || data.error) return <div className="p-6 text-red-500">需求不存在</div>;

  return (
    <div className="p-6 max-w-5xl">
      {/* Sprint 标签 */}
      {data.sprint_id && (
        <div className="bg-gray-100 border-l-4 border-gray-500 rounded-xl p-3 mb-3 flex items-center gap-3 text-sm">
          <span className="text-xl">🏃</span>
          <div className="flex-1">
            <span className="text-gray-600">所属 Sprint：</span>
            <Link href={`/sprints/${data.sprint_id}`} className="text-gray-900 font-medium hover:underline">
              #{data.sprint_id}
            </Link>
            {data.sprint_name && <span className="text-gray-700"> · {data.sprint_name}</span>}
          </div>
        </div>
      )}

      {/* 已合并横幅 */}
      {data.merged_into != null && (
        <div className="bg-orange-50 border-l-4 border-orange-400 rounded-xl p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <div className="font-medium text-orange-800">此需求已合并到 #{data.merged_into}</div>
            <div className="text-xs text-orange-700 mt-0.5">
              合并时间: {data.merged_at?.slice(0, 19) || '—'} · 附件/评论/子任务等已迁移
            </div>
          </div>
          <Link href={`/requirements/${data.merged_into}`}
            className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
            查看原需求 →
          </Link>
          {data.merged_into && (currentUser?.roles || []).some((r: any) => r === 'global_admin' || r?.name === 'global_admin') && (
            <button
              onClick={async () => {
                if (!confirm(`确认误判？解除与 #${data.merged_into} 的合并。`)) return;
                const r = await fetch('/api/admin/dedup/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirement_id: Number(id) }) });
                const j = await r.json();
                if (r.ok) { alert('已解除'); router.refresh(); } else alert(j.error);
              }}
              className="px-3 py-1.5 border border-orange-300 rounded-lg text-xs text-orange-700 hover:bg-orange-100">
              误判回滚
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← 返回</button>
        <h1 className="text-xl font-bold flex-1">需求 #{data.id}</h1>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn btn-secondary">编辑</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? '保存中...' : '保存'}</button>
            <button onClick={() => { setEditing(false); setForm(data); }} className="btn btn-secondary">取消</button>
          </div>
        )}
      </div>

      <div className={`${isMobile ? '' : 'grid grid-cols-3 gap-6'}`}>
        {/* Main content */}
        <div className="col-span-2 space-y-4">
          {/* Title & basic info */}
          <div className="card"><div className="card-body">
            {editing ? (
              <input value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} className="text-lg font-bold w-full border-b pb-2 mb-4 focus:outline-none focus:border-gray-800" />
            ) : (
              <h2 className="text-lg font-bold mb-4">{data.title}</h2>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[data.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(data.status)}</span>
              <span className="text-sm">{priorityLabel(data.priority, true)}</span>
              <span className="text-xs text-gray-400">{categoryLabel(data.category)}</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {editing ? (
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="w-full border rounded-lg p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-gray-800" />
              ) : (data.description || <span className="text-gray-400">暂无描述</span>)}
            </div>
          </div></div>

          {/* SLA 横幅 */}
          {data.sla_status && ['approaching', 'overdue', 'escalated'].includes(data.sla_status) && (() => {
            const days = Math.abs(typeof data.sla_days_diff === 'number' ? data.sla_days_diff : 0);
            const daysText = days.toFixed(1);
            if (data.sla_status === 'approaching') {
              return (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl">🟡</span>
                  <div>
                    <div className="font-medium text-yellow-800">即将超期，还剩 {daysText} 天</div>
                    <div className="text-xs text-yellow-700 mt-0.5">请关注处理进度，避免逾期</div>
                  </div>
                </div>
              );
            }
            if (data.sla_status === 'overdue') {
              return (
                <div className="alert alert-warning flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <div className="font-medium text-orange-800">已超期 {daysText} 天</div>
                    <div className="text-xs text-orange-700 mt-0.5">建议尽快处理或调整计划完成时间</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <div className="font-medium text-red-800">严重超期 {daysText} 天，请尽快处理</div>
                  <div className="text-xs text-red-700 mt-0.5">已超过严重超期阈值，建议立即响应</div>
                </div>
              </div>
            );
          })()}

          {/* Timeline — requirement description history */}
          <Collapsible title="需求内容时间线" icon="📝" defaultOpen={true}>
            {/* Add new note */}
            <div className="mb-4 border rounded-lg p-3">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder={t('requirement.addNew')} rows={3}
                className="w-full text-sm focus:outline-none resize-none mb-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{t('requirement.updatedAt')}</span>
                <button onClick={addNote} disabled={addingNote || !newNote.trim()} className="btn btn-primary btn-sm">
                  {addingNote ? t('common.loading') : t('requirement.addNew')}
                </button>
              </div>
            </div>

            {timeline.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-4">{t('requirement.noTimeline')}</div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                <div className="space-y-4">
                  {timeline.map(entry => (
                    <div key={entry.id} className="relative pl-10">
                      <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-gray-800 border-2 border-white shadow" />
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{entry.author_name || '系统'}</span>
                            <span className="text-xs text-gray-400">{entry.created_at?.replace('T', ' ').slice(0, 16)}</span>
                          </div>
                          {ttsEnabled && (
                            <button onClick={() => playTts(entry.content, entry.id)}
                              className={`text-xs px-2 py-1 rounded-lg transition ${playingTts === entry.id ? 'bg-gray-800 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}>
                              {playingTts === entry.id ? t('chat.voiceStop') : t('chat.voicePlay')}
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Collapsible>

          {/* 验收标准 (AC) — 仅编辑模式可设置 */}
          {editing && (
            <Collapsible title="验收标准 (AC)" icon="✅" count={acAgg?.ac_total} defaultOpen={true}>
              <AcSectionMount requirementId={Number(id)} aggregate={acAgg || { ac_total: 0, ac_passed: 0, ac_required_total: 0, ac_required_passed: 0, ac_required_blocking: 0, ac_progress_pct: 0, ac_required_pct: 0, ac_can_complete: true }} onChanged={refreshAcAgg} />
            </Collapsible>
          )}

          {/* 子任务清单 — 仅编辑模式可添加 */}
          {editing && (
            <Collapsible title="子任务清单" icon="☑️" count={clAgg?.checklist_total} defaultOpen={true}>
              <ChecklistSectionMount requirementId={Number(id)} aggregate={clAgg || { checklist_total: 0, checklist_done: 0, checklist_in_progress: 0, checklist_blocked: 0, checklist_overdue: 0, checklist_progress_pct: 0 }} users={users} onChanged={refreshAggregates} />
            </Collapsible>
          )}

          {/* 需求流转流程 — 仅编辑模式可配置 */}
          {editing && (
            <Collapsible title="需求流转流程" icon="⚡" defaultOpen={true}>
              <RequirementWorkflow requirementId={Number(id)} workflowId={data.workflow_id} currentNode={data.current_node} onUpdate={loadData} />
            </Collapsible>
          )}

          {/* Attachments - simplified, no box-in-box */}
          <Collapsible title="附件" icon="📎" count={attachments.length} defaultOpen={true}>
            <div className="mb-3">
              <input ref={fileInputRef} type="file" multiple onChange={e => handleUpload(e.target.files)} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="btn btn-primary btn-sm">
                {uploading ? t('common.loading') : t('common.upload')}
              </button>
            </div>

            {attachments.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-6">暂无附件</div>
            ) : (
              <div className="space-y-4">
                {attachments.map(att => {
                  const fileUrl = `/api/public-files${att.file_path}`;
                  return (
                    <div key={att.id}>
                      {/* File info row */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getFileIcon(att.original_name, att.mime_type)}</span>
                          <a href={fileUrl} target="_blank" rel="noopener" className="text-sm font-medium text-gray-900 hover:underline">{att.original_name}</a>
                          <span className="text-xs text-gray-400">{formatSize(att.file_size)} · {att.uploader_name} · {att.created_at?.slice(0, 16)}</span>
                        </div>
                        <button onClick={() => deleteAtt(att.id)} className="text-xs text-gray-400 hover:text-red-500">删除</button>
                      </div>

                      {/* Image preview - inline, no extra box */}
                      {isImage(att.mime_type, att.original_name) && (
                        <img src={fileUrl} alt={att.original_name}
                          className="max-w-full max-h-80 rounded-lg mt-1 cursor-pointer hover:shadow-md transition"
                          loading="lazy"
                          onClick={() => window.open(fileUrl, '_blank')} />
                      )}

                      {/* PDF preview */}
                      {att.original_name.toLowerCase().endsWith('.pdf') && (
                        <iframe src={fileUrl} className="w-full h-64 rounded-lg mt-1 border" />
                      )}

                      {/* Audio playback */}
                      {isAudio(att.mime_type, att.original_name) && (
                        <div className="mt-1 space-y-2">
                          <audio controls src={fileUrl} className="w-full h-10" />
                          {asrEnabled && (
                            <div>
                              <button onClick={() => transcribe(att.id)} disabled={asrLoading === att.id}
                                className="text-xs px-3 py-1 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50">
                                {asrLoading === att.id ? t('common.loading') : t('chat.voiceInput')}
                              </button>
                              {asrResult[att.id] && (
                                <div className="mt-2 bg-gray-100 rounded-lg p-3 text-sm text-gray-700">
                                  <div className="text-xs text-gray-500 mb-1">语音识别结果：</div>
                                  {asrResult[att.id]}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Office / other files */}
                      {/\.(docx?|pptx?|xlsx?)$/i.test(att.original_name) && (
                        <div className="mt-1 text-xs text-gray-500">
                          <a href={fileUrl} download className="text-gray-800 hover:underline">下载</a>
                          {' · '}<a href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(window.location.origin + fileUrl)}`} target="_blank" className="text-gray-800 hover:underline">在线预览</a>
                        </div>
                      )}

                      {/* Markdown */}
                      {att.original_name.toLowerCase().endsWith('.md') && (
                        <div className="mt-1 text-xs text-gray-500">
                          <a href={fileUrl} target="_blank" className="text-gray-800 hover:underline">打开查看</a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Collapsible>

          {/* Related requirements */}
          {(data.children?.length > 0 || data.relations?.length > 0 || data.parent_title) && (
            <Collapsible title="关联需求" icon="🔗" defaultOpen={true}>
              {data.parent_title && (
                <div className="mb-3"><span className="text-xs text-gray-500">上级：</span><Link href={`/requirements/${data.parent_id}`} className="text-sm text-gray-900 hover:underline">#{data.parent_id} {data.parent_title}</Link></div>
              )}
              {data.children?.map((c: any) => (
                <div key={c.id} className="py-1"><Link href={`/requirements/${c.id}`} className="text-sm text-gray-900 hover:underline">#{c.id} {c.title}</Link> <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(c.status)}</span></div>
              ))}
              {data.relations?.map((r: any) => (
                <div key={r.relation_id} className="py-1 flex items-center gap-2">
                  <Link href={`/requirements/${r.id}`} className="text-sm text-gray-900 hover:underline">#{r.id} {r.title}</Link>
                  <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{RELATION_TYPE_LABELS[r.relation_type] || r.relation_type}</span>
                </div>
              ))}
            </Collapsible>
          )}

          {/* Status log */}
          <Collapsible title="状态变更记录" icon="📋" count={data.statusLog?.length} defaultOpen={false}>
            {data.statusLog?.length > 0 ? data.statusLog.map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 text-sm py-1">
                <span className="text-xs text-gray-400 w-36">{log.changed_at?.slice(0, 16)}</span>
                <span className="text-gray-600">{log.changed_by_name || '系统'}</span>
                <span className="text-gray-400">→</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[log.new_status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(log.new_status)}</span>
              </div>
            )) : <div className="text-sm text-gray-400 py-2">暂无记录</div>}
          </Collapsible>

          {/* Workflow Section */}
          <Collapsible title="工作流" icon="⚡" count={wfInstance?.nodes?.filter((n: any) => n.node_status === 'completed').length || 0} defaultOpen={true}>
            {wfLoading ? <div className="text-sm text-gray-400 py-2">加载中...</div> : !wfInstance && !data.workflow_id ? (
              <div className="text-sm text-gray-500 py-3">
                <div>该需求未关联工作流</div>
                <Link href="/workflows" className="text-gray-900 hover:underline text-xs">前往工作流管理</Link>
              </div>
            ) : !wfInstance && data.workflow_id ? (
              <div className="text-sm text-gray-500 py-3">
                <div>已关联工作流模板 (ID: {data.workflow_id})</div>
                <div className="text-xs text-gray-400 mt-1">当前无运行中的工作流实例</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{wfInstance.workflow_name}</span>
                    <span className="ml-2 text-xs text-gray-500">实例 #{wfInstance.id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    wfInstance.status === 'running' ? 'bg-gray-200 text-gray-900' :
                    wfInstance.status === 'completed' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{wfInstance.status === 'running' ? '运行中' : wfInstance.status === 'completed' ? '已完成' : '已取消'}</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                  {(wfInstance.nodes || []).map((n: any) => {
                    const colors: any = {
                      pending: 'text-gray-400', active: 'text-gray-900 font-semibold',
                      completed: 'text-green-600', skipped: 'text-gray-300',
                    };
                    const icons: any = {
                      pending: '○', active: '●', completed: '✓', skipped: '⊘',
                    };
                    return (
                      <div key={n.node_key} className={`flex items-center gap-2 text-xs ${colors[n.node_status]}`}>
                        <span className="w-3">{icons[n.node_status]}</span>
                        <span className="flex-1">{n.label}</span>
                        {n.auto_status && <span className="text-[10px] text-gray-400">→ {n.auto_status}</span>}
                      </div>
                    );
                  })}
                </div>
                {wfInstance.status === 'running' && (
                  <button
                    onClick={advanceWf}
                    className="btn btn-secondary btn-sm w-full"
                  >
                    ▶️ 完成当前节点 (推进)
                  </button>
                )}
                {(wfInstance.logs || []).length > 0 && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer">查看流转日志 ({(wfInstance.logs || []).length})</summary>
                    <div className="mt-1 space-y-1">
                      {wfInstance.logs.slice(0, 8).map((l: any, i: number) => (
                        <div key={i} className="text-[11px]">
                          <span className="text-gray-400">{l.created_at?.slice(11, 19)}</span> · {l.detail}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </Collapsible>

          {/* Comments Section */}
          <Collapsible title="评论" icon="💬" count={comments.length} defaultOpen={true}>
            {/* Add comment */}
            <div className="mb-4 border rounded-lg p-3">
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="添加评论..." rows={2}
                className="w-full text-sm focus:outline-none resize-none mb-2" />
              <div className="flex justify-end">
                <button onClick={addComment} disabled={addingComment || !newComment.trim()}
                  className="btn btn-primary btn-sm">
                  {addingComment ? '发表中...' : '发表评论'}
                </button>
              </div>
            </div>
            {comments.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-4">暂无评论</div>
            ) : (
              <div className="space-y-3">
                {comments.map(comment => (
                  <div key={comment.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{comment.user_name || comment.user_username}</span>
                        <span className="text-xs text-gray-400">{comment.created_at?.replace('T', ' ').slice(0, 16)}</span>
                      </div>
                      <button onClick={() => deleteComment(comment.id)} className="text-xs text-gray-400 hover:text-red-500">删除</button>
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</div>
                  </div>
                ))}
              </div>
            )}
          </Collapsible>

          {/* Version History Section */}
          <Collapsible title="版本历史" icon="📜" count={versions.length} defaultOpen={false}>
            <div className="mb-3">
              <button onClick={createVersion} disabled={creatingVersion}
                className="btn btn-primary btn-sm">
                {creatingVersion ? '创建中...' : '📸 创建快照'}
              </button>
            </div>
            {versions.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-4">暂无版本记录</div>
            ) : (
              <div className="space-y-3">
                {versions.map(v => (
                  <VersionItem key={v.id} version={v} />
                ))}
              </div>
            )}
          </Collapsible>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card"><div className="card-body space-y-4">
            <h3 className="font-medium">状态流转</h3>
            <div className="flex flex-wrap gap-2">
              {statuses.map(s => (
                <button key={s.value} onClick={() => updateStatus(s.value)} disabled={data.status === s.value}
                  className={`px-2 py-1 rounded text-xs transition ${data.status === s.value ? (STATUS_COLORS[s.value] || 'bg-gray-100 text-gray-700') + ' font-bold ring-2 ring-gray-400' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card"><div className="card-body space-y-3 text-sm">
            <h3 className="font-medium">详细信息</h3>
            <InfoRow label="项目" value={data.project_name || '—'} />
            <InfoRow label="业务方" value={data.business_unit || '—'} />
            <InfoRow label="提出人" value={data.requester_name || '—'} />
            <InfoRow label="接收人" value={data.receiver_name_display || '—'} />
            <InfoRow label="处理人">
              {editing ? (
                <select value={form.handler_id || ''} onChange={e => setForm({...form, handler_id: e.target.value ? parseInt(e.target.value) : null})} className="border rounded px-2 py-1 text-sm">
                  <option value="">—</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              ) : (data.handler_name_display || '—')}
            </InfoRow>
            <InfoRow label="Sprint">
              {editing ? (
                <select value={form.sprint_id || ''} onChange={e => setForm({...form, sprint_id: e.target.value ? parseInt(e.target.value) : null})} className="border rounded px-2 py-1 text-sm">
                  <option value="">—</option>
                  {sprints.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (data.sprint_name ? <Link href={`/sprints/${data.sprint_id}`} className="text-blue-600 hover:underline">{data.sprint_name}</Link> : '—')}
            </InfoRow>
            <InfoRow label="验证人">
              {editing ? (
                <select value={form.verifier_id || ''} onChange={e => setForm({...form, verifier_id: e.target.value ? parseInt(e.target.value) : null})} className="border rounded px-2 py-1 text-sm">
                  <option value="">—</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              ) : (data.verifier_name_display || '—')}
            </InfoRow>
            <InfoRow label="计划开始" value={editing ? <input type="date" value={form.planned_start || ''} onChange={e => setForm({...form, planned_start: e.target.value})} className="border rounded px-2 py-1 text-sm" /> : (data.planned_start || '—')} />
            <InfoRow label="计划完成" value={editing ? <input type="date" value={form.planned_end || ''} onChange={e => setForm({...form, planned_end: e.target.value})} className="border rounded px-2 py-1 text-sm" /> : (data.planned_end || '—')} />
            <InfoRow label="优先级框架">
              {editing ? (
                <select value={form.priority_framework || ''} onChange={e => setForm({...form, priority_framework: e.target.value || null})} className="border rounded px-2 py-1 text-sm">
                  <option value="">— 无 —</option>
                  <option value="MoSCoW">MoSCoW</option>
                  <option value="Kano">Kano</option>
                  <option value="WSJF">WSJF</option>
                </select>
              ) : (data.priority_framework || '—')}
            </InfoRow>
            <InfoRow label="优先级评分" value={editing ? <input type="number" min={0} step={0.1} value={form.priority_score ?? ''} onChange={e => setForm({...form, priority_score: e.target.value === '' ? null : Number(e.target.value)})} className="border rounded px-2 py-1 text-sm" /> : (data.priority_score ?? '—')} />
            {/* ===== 估时/Story Point 区块 ===== */}
            <div className="pt-3 mt-1 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">估时</span>
                {!estimating ? (
                  <button onClick={() => {
                    setEstimForm({
                      story_points: data.story_points ?? null,
                      estimate_hours: data.estimate_hours ?? null,
                      actual_hours: data.actual_hours ?? null,
                    });
                    setEstError('');
                    setEstimating(true);
                  }} className="text-xs text-gray-900 hover:underline">✏️ 编辑估算</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveEstimation} disabled={savingEst} className="text-xs px-2 py-1 bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50">{savingEst ? '保存中...' : '保存'}</button>
                    <button onClick={() => { setEstimating(false); setEstError(''); }} className="text-xs px-2 py-1 border rounded text-gray-500 hover:bg-gray-50">取消</button>
                  </div>
                )}
              </div>
              {estError && <div className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">{estError}</div>}
              {estimating ? (
                <div className="space-y-2 bg-gray-100/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">Story Points</span>
                    <select
                      value={estimForm.story_points ?? ''}
                      onChange={e => setEstimForm({ ...estimForm, story_points: e.target.value === '' ? null : Number(e.target.value) })}
                      className="form-input" style={{flex:1}}
                    >
                      <option value="">未估时</option>
                      {SP_ALLOW_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">估算工时</span>
                    <input
                      type="number" min={0} step={0.5}
                      value={estimForm.estimate_hours ?? ''}
                      onChange={e => setEstimForm({ ...estimForm, estimate_hours: e.target.value === '' ? null : Number(e.target.value) })}
                      className="form-input" style={{flex:1}}
                      placeholder="h"
                    />
                    <span className="text-xs text-gray-400">h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16">实际工时</span>
                    <input
                      type="number" min={0} step={0.5}
                      value={estimForm.actual_hours ?? ''}
                      onChange={e => setEstimForm({ ...estimForm, actual_hours: e.target.value === '' ? null : Number(e.target.value) })}
                      className="form-input" style={{flex:1}}
                      placeholder="h"
                    />
                    <span className="text-xs text-gray-400">h</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Story Points</span>
                    <span>
                      {data.story_points == null ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400">未估</span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${spBadgeClass(data.story_points, data.sp_label)}`}>
                          {data.story_points} ({data.sp_label || '?'})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">估算</span>
                    <span className="text-gray-900">
                      {data.estimate_hours != null
                        ? <>{data.estimate_hours}h <span className="text-xs text-gray-400">({(data.estimate_hours / HOURS_PER_DAY).toFixed(1)} 天)</span></>
                        : <span className="text-gray-400">—</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">实际</span>
                    <EstimationActualCell actualHours={data.actual_hours} estimateHours={data.estimate_hours} accuracy={data.estimation_accuracy} color={data.estimation_color} />
                  </div>
                </div>
              )}
            </div>
            <SlaInfoRow status={data.sla_status} days={data.sla_days_diff} warningCount={data.sla_warning_count} />
            {slaWarnings.length > 0 && (
              <div className="pt-2 border-t">
                <button onClick={() => setSlaWarningsOpen(o => !o)} className="text-xs text-gray-900 hover:underline flex items-center gap-1">
                  {slaWarningsOpen ? '▼' : '▶'} 最近 {Math.min(3, slaWarnings.length)} 条预警历史
                </button>
                {slaWarningsOpen && (
                  <div className="mt-2 space-y-2">
                    {slaWarnings.slice(0, 3).map(w => {
                      const wt = (w.warning_type || '').toLowerCase();
                      const lvl = w.warning_level;
                      // 严重程度推导：level 3/escalated 红；level 2/overdue 橙；level 1/approaching 黄
                      const isEscalated = wt === 'escalated' || lvl === 3;
                      const isOverdue = wt === 'overdue' || lvl === 2;
                      const sevColor = isEscalated ? 'text-red-600' : isOverdue ? 'text-orange-600' : 'text-yellow-700';
                      const sevLabel = isEscalated ? '🚨 严重超期' : isOverdue ? '⚠️ 已超期' : '🟡 即将超期';
                      return (
                        <div key={w.id} className="bg-gray-50 rounded p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${sevColor}`}>{sevLabel}</span>
                            {w.acknowledged_at ? (
                              <span className="text-gray-400">已确认</span>
                            ) : (
                              <button onClick={() => ackSlaWarning(w.id)} disabled={ackingId === w.id} className="text-gray-900 hover:underline disabled:opacity-50">
                                {ackingId === w.id ? '确认中…' : '我知道了'}
                              </button>
                            )}
                          </div>
                          <div className="text-gray-400 mt-1">{w.created_at?.replace('T', ' ').slice(0, 16)}</div>
                          {typeof w.days_diff === 'number' && (
                            <div className="text-gray-600 mt-1">差 {Math.abs(w.days_diff).toFixed(1)} 天</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <InfoRow label="实际完成" value={data.actual_end || '—'} />
            <InfoRow label="创建时间" value={data.created_at?.slice(0, 16)} />
            <InfoRow label="更新时间" value={data.updated_at?.slice(0, 16)} />
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
);
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="text-gray-900">{children || value}</span></div>;
}

function EstimationActualCell({ actualHours, estimateHours, accuracy, color }: { actualHours: any; estimateHours: any; accuracy: any; color: any }) {
  if (actualHours == null) return <span className="text-gray-400">—</span>;
  const colorClass = color === 'green' ? 'text-green-600'
    : color === 'orange' ? 'text-orange-600'
    : color === 'red' ? 'text-red-600'
    : 'text-gray-700';
  const biasPct = (typeof accuracy === 'number' && estimateHours) ? Math.round((accuracy - 1) * 100) : null;
  return (
    <span className={colorClass}>
      {actualHours}h
      {biasPct != null && (
        <span className="text-xs ml-1 text-gray-400">({biasPct >= 0 ? '+' : ''}{biasPct}%)</span>
      )}
    </span>
  );
}

function SlaInfoRow({ status, days, warningCount }: { status?: string; days?: number; warningCount?: number }) {
  if (!status || status === 'ok' || status === 'none') {
    const txt = !status || status === 'none' ? '⚪ 无计划时间' : '🟢 正常';
    return <div className="flex justify-between"><span className="text-gray-500">SLA</span><span className="text-gray-700">{txt}</span></div>;
  }
  const d = Math.abs(typeof days === 'number' ? days : 0).toFixed(1);
  const label = status === 'approaching' ? '🟡 即将超期' : status === 'overdue' ? '🟠 已超期' : '🔴 严重超期';
  const color = status === 'approaching' ? 'text-yellow-700' : status === 'overdue' ? 'text-orange-600' : 'text-red-600 font-medium';
  const statusName = status === 'approaching' ? '即将超期' : status === 'overdue' ? '已超期' : '严重超期';
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">SLA</span>
      <span className={`${color} flex items-center gap-1`}>
        <span>{label}</span>
        <span className="text-xs">{statusName} {d} 天</span>
        {typeof warningCount === 'number' && warningCount > 0 && <span className="text-[10px] text-gray-400">×{warningCount}</span>}
      </span>
    </div>
  );
}

function getFileIcon(name: string, mime: string) {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (isImage(mime, name) || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (isAudio(mime, name) || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(ext)) return '🎵';
  if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) return '🎬';
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return '📝';
  if (['ppt', 'pptx'].includes(ext)) return '📊';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📈';
  if (['md', 'markdown'].includes(ext)) return '📋';
  if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return '📦';
  if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'go', 'rs'].includes(ext)) return '💻';
  if (['txt', 'log'].includes(ext)) return '📃';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  return '📁';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ====== Per-Requirement Workflow Component ======
function RequirementWorkflow({ requirementId, workflowId, currentNode, onUpdate }: {
  requirementId: number; workflowId: number | null; currentNode: string | null; onUpdate: () => void;
}) {
  const { statusLabel } = useRequirementOptions();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [wfData, setWfData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/workflows').then(r => r.json()).then(d => setWorkflows(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (workflowId) {
      fetch(`/api/workflows?id=${workflowId}`).then(r => r.json()).then(setWfData).catch(() => {});
    } else {
      setWfData(null);
    }
  }, [workflowId]);

  const assignWorkflow = async (wfId: number | null) => {
    setLoading(true);
    const body: any = { workflow_id: wfId };
    if (wfId) {
      const wf = await fetch(`/api/workflows?id=${wfId}`).then(r => r.json());
      const startNode = wf.nodes?.find((n: any) => n.type === 'start');
      const firstTask = wf.edges?.find((e: any) => e.from_node === (startNode?.node_key || 'start'));
      body.current_node = firstTask?.to_node || startNode?.node_key || 'start';
    } else {
      body.current_node = null;
    }
    await fetch(`/api/requirements/${requirementId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include',
    });
    setLoading(false);
    onUpdate();
  };

  const advanceNode = async (toNode: string) => {
    const targetNode = wfData?.nodes?.find((n: any) => n.node_key === toNode);
    const body: any = { current_node: toNode };
    if (targetNode?.auto_status) body.status = targetNode.auto_status;
    if (targetNode?.assignee_id) body.handler_id = targetNode.assignee_id;
    await fetch(`/api/requirements/${requirementId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include',
    });
    onUpdate();
  };

  const nodes = wfData?.nodes || [];
  const edges = wfData?.edges || [];
  const currentNodeData = nodes.find((n: any) => n.node_key === currentNode);
  const outEdges = edges.filter((e: any) => e.from_node === currentNode);

  if (!workflowId) {
    return (
      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        <p className="text-sm text-gray-400 mb-3">该需求尚未配置流转流程</p>
        <div className="flex items-center justify-center gap-2">
          <select onChange={e => e.target.value && assignWorkflow(Number(e.target.value))} disabled={loading}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">选择工作流模板...</option>
            {workflows.map(w => (
              <option key={w.id} value={w.id}>{w.name} {w.is_default ? '(默认)' : ''}</option>
            ))}
          </select>
          <Link href="/workflows/designer" className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50">
            + 新建流程
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Mini flow visualization */}
      <div className="flex items-center gap-1 overflow-x-auto pb-3 mb-4">
        {nodes.sort((a: any, b: any) => a.pos_x - b.pos_x).map((node: any, i: number) => {
          const isCurrent = node.node_key === currentNode;
          const isPast = nodes.findIndex((n: any) => n.node_key === currentNode) > i;
          const color = node.type === 'start' ? 'var(--node-start)' : node.type === 'end' ? 'var(--node-end)' : 'var(--node-task)';
          return (
            <div key={node.node_key} className="flex items-center shrink-0">
              {i > 0 && <div className={`w-6 h-0.5 ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />}
              <div className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                isCurrent ? 'ring-2 ring-gray-500 shadow-md scale-105' : isPast ? 'opacity-60' : ''
              }`}
                style={{
                  background: isCurrent ? color : isPast ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--node-idle-bg)',
                  borderColor: isCurrent ? color : isPast ? `color-mix(in srgb, ${color} 32%, transparent)` : 'var(--node-idle-bd)',
                  color: isCurrent ? '#FFFFFF' : isPast ? color : 'var(--node-idle-fg)',
                }}>
                {node.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current node info */}
      {currentNodeData && (
        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">当前节点：{currentNodeData.label}</span>
            {currentNodeData.assignee_id && (
              <span className="text-xs text-gray-900">👤 {wfData?.users?.find((u: any) => u.id === currentNodeData.assignee_id)?.display_name || '未知'}</span>
            )}
          </div>
          {currentNodeData.auto_status && (
            <div className="text-xs text-gray-900 mb-2">自动状态：{statusLabel(currentNodeData.auto_status)}</div>
          )}
          {outEdges.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-300">
              <div className="text-xs text-gray-900 mb-2">可流转到：</div>
              <div className="flex flex-wrap gap-2">
                {outEdges.map((edge: any, i: number) => {
                  const targetNode = nodes.find((n: any) => n.node_key === edge.to_node);
                  return (
                    <button key={i} onClick={() => advanceNode(edge.to_node)}
                      className="px-3 py-1.5 bg-white border border-gray-400 rounded-lg text-xs text-gray-900 hover:bg-gray-200 transition">
                      → {targetNode?.label || edge.to_node}
                      {edge.label && <span className="text-gray-500 ml-1">({edge.label})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <button onClick={() => assignWorkflow(null)} className="text-xs text-gray-400 hover:text-red-500">
        移除流程配置
      </button>
    </div>
  );
}
