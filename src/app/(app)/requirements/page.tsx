'use client';

import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/components/responsive-table';
import { MobileTable } from '@/components/mobile-table';
import Link from 'next/link';
import { useT } from '@/i18n/config';
import { useRequirementOptions } from '@/lib/use-requirement-options';
import { spBadgeClass } from '@/lib/sp-badge';
import ImportDrawer from './import-drawer';

const STATUS_COLORS: Record<string, string> = {
  received_not_evaluated: 'badge-gray',
  evaluated_not_scheduled: 'badge-warning',
  scheduled: 'badge-info',
  in_progress: 'badge-primary',
  completed: 'badge-success',
  verified: 'badge-info',
  closed: 'badge-gray',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600',
  medium: 'text-yellow-600',
  low: 'text-green-600',
};

// SLA 状态 -> 显示配置
const SLA_FILTER_CHIPS: { value: string; label: string; active: string }[] = [
  { value: '', label: '全部', active: 'bg-gray-200 text-gray-800' },
  { value: 'approaching', label: '🟡 即将超期', active: 'bg-yellow-200 text-yellow-800' },
  { value: 'overdue', label: '🟠 已超期', active: 'bg-orange-200 text-orange-800' },
  { value: 'escalated', label: '🔴 严重超期', active: 'bg-red-200 text-red-800' },
];

// SP 过滤 chip：sp_min / sp_max / sp_null（sp_null=1 表示只看未估时）
const SP_FILTER_CHIPS: { spMin: string; spMax: string; spNull: string; label: string; active: string }[] = [
  { spMin: '', spMax: '', spNull: '', label: '全部', active: 'bg-gray-200 text-gray-800' },
  { spMin: '', spMax: '', spNull: '1', label: '⚪ 未估时', active: 'bg-gray-300 text-gray-700' },
  { spMin: '1', spMax: '3', spNull: '', label: '🟢 小 (1-3)', active: 'bg-green-200 text-green-800' },
  { spMin: '5', spMax: '5', spNull: '', label: '🟠 中 (5)', active: 'bg-orange-200 text-orange-800' },
  { spMin: '8', spMax: '', spNull: '', label: '🔴 大 (8+)', active: 'bg-red-200 text-red-800' },
];

// SP 颜色规则抽到 @/lib/sp-badge

function renderSpBadge(sp: any, label: any, estimateHours: any) {
  if (sp == null) return <span className="badge badge-gray">未估</span>;
  const cls = spBadgeClass(sp, label);
  const est = estimateHours != null ? ` · ${estimateHours}h` : '';
  return <span className={`badge ${cls}`}>{sp} ({label || '?'}){est}</span>;
}

const SLA_STATUS_LABEL: Record<string, string> = {
  ok: '正常', approaching: '即将超期', overdue: '已超期', escalated: '严重超期', none: '无计划时间',
};

function renderSlaCell(status: string | undefined, days: number | undefined) {
  if (!status || status === 'ok') {
    return <span className="badge badge-success">🟢 正常</span>;
  }
  if (status === 'none') {
    return <span className="badge badge-gray">⚪ 无计划时间</span>;
  }
  const d = typeof days === 'number' ? Math.abs(days) : 0;
  const num = d.toFixed(1);
  if (status === 'approaching') return <span className="badge badge-warning">🟡 即将超期 {num} 天</span>;
  if (status === 'overdue') return <span className="badge badge-warning">🟠 已超期 {num} 天</span>;
  if (status === 'escalated') return <span className="badge badge-danger">🔴 严重超期 {num} 天</span>;
  return <span>—</span>;
}

export default function RequirementsPage() {
  const { t } = useT();
  const { priorities, categories, statuses, priorityLabel, categoryLabel, statusLabel } = useRequirementOptions();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [myOnly, setMyOnly] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetch('/api/projects', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  useEffect(() => { fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).then(d => { const u = d?.user || d; if (u?.id) setCurrentUserId(u.id); }).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    if (myOnly && currentUserId) params.set('handler_id', String(currentUserId));
    if (filters.sla_filter) params.set('sla_filter', filters.sla_filter);
    if (filters.sp_min) params.set('sp_min', filters.sp_min);
    if (filters.sp_max) params.set('sp_max', filters.sp_max);
    if (filters.sp_null) params.set('sp_null', filters.sp_null);
    try {
      const res = await fetch(`/api/requirements?${params}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (e) {
/* ignore */ }
    setLoading(false);
  }, [page, search, filters, myOnly, currentUserId]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };
  const toggleMyOnly = () => {
    setMyOnly(prev => !prev);
    setPage(1);
  };

  // Export requirements to CSV
  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.project_id) params.set('project_id', filters.project_id);
    window.open(`/api/requirements/export?${params}`, '_blank');
  };

  // Import requirements from CSV
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { alert('CSV 文件格式错误'); setImporting(false); return; }

      // Parse CSV (skip header)
      const headers = lines[0].split(',');
      const dataArr: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row: any = {};
        headers.forEach((h, idx) => { row[h.trim()] = values[idx]?.replace(/^"|"$/g, '').replace(/""/g, '"') || ''; });
        dataArr.push(row);
      }

      try {
        const res = await fetch('/api/requirements/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataArr })
        });
        const result = await res.json();
        alert(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`);
        if (result.errors?.length > 0) console.error(result.errors);
        load();
      } catch (err) {
        alert('导入失败');
      }
      setImporting(false);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📋 {t('nav.requirements')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('common.total', { n: total })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn btn-secondary">
            📥 {t('common.export')}
          </button>
          <button onClick={() => setShowImport(true)} className="btn btn-secondary">
            📥 {t('requirement.bulkImport')}
          </button>
          <Link href="/requirements/new" className="btn btn-primary">
            ➕ {t('requirement.newRequirement')}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body flex flex-wrap gap-3 items-center">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('search.placeholder')}
            className="form-input"
            style={{ width: '16rem' }}
          />
          <button onClick={toggleMyOnly} className={`btn btn-sm ${myOnly ? 'btn-primary' : 'btn-secondary'}`}>
            {myOnly ? '👤 只看我处理的' : '👤 我的需求'}
          </button>
          <select
            value={filters.status || ''}
            onChange={e => updateFilter('status', e.target.value)}
            className="form-input"
            style={{ width: '10rem' }}
          >
            <option value="">{t('requirement.allStatus')}</option>
            {statuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filters.priority || ''}
            onChange={e => updateFilter('priority', e.target.value)}
            className="form-input"
            style={{ width: '10rem' }}
          >
            <option value="">{t('requirement.allPriority')}</option>
            {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select
            value={filters.project_id || ''}
            onChange={e => updateFilter('project_id', e.target.value)}
            className="form-input"
            style={{ width: '12rem' }}
          >
            <option value="">{t('requirement.allProject')}</option>
            {(Array.isArray(projects) ? projects : []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filters.category || ''}
            onChange={e => updateFilter('category', e.target.value)}
            className="form-input"
            style={{ width: '8rem' }}
          >
            <option value="">{t('common.all')}</option>
            {categories.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* SLA 快捷筛选 chip */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-gray-500">{t('sla.title')}：</span>
        {SLA_FILTER_CHIPS.map(chip => {
          const active = (filters.sla_filter || '') === chip.value;
          return (
            <button
              key={chip.value || 'all'}
              onClick={() => updateFilter('sla_filter', chip.value)}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
              style={active ? {} : {}}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* SP 估时筛选 chip */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">{t('requirement.estimatedHours')}：</span>
        {SP_FILTER_CHIPS.map(chip => {
          const active = (filters.sp_min || '') === chip.spMin
            && (filters.sp_max || '') === chip.spMax
            && (filters.sp_null || '') === chip.spNull;
          return (
            <button
              key={chip.label}
              onClick={() => {
                setFilters(prev => ({ ...prev, sp_min: chip.spMin, sp_max: chip.spMax, sp_null: chip.spNull }));
                setPage(1);
              }}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Table - desktop / Card - mobile */}
      <div className="card">
        <div className="card-body">
      <MobileTable data={data} columns={[
        { key: 'id', label: 'ID', width: '60px', render: (r) => `#${r.id}` },
        { key: 'title', label: t('requirement.title') },
        { key: 'project_name', label: t('project.name'), hideOnMobile: true },
        { key: 'category', label: t('requirement.category'), render: (r) => categoryLabel(r.category), hideOnMobile: true },
        { key: 'priority', label: t('requirement.priority'), render: (r) => <span className={`font-medium ${PRIORITY_COLORS[r.priority] || ''}`}>{priorityLabel(r.priority)}</span> },
        { key: 'sla', label: t('project.health'), hideOnMobile: true, render: (r) => renderSlaCell(r.sla_status, r.sla_days_diff) },
        { key: 'estimate', label: t('requirement.storyPoints'), hideOnMobile: true, render: (r) => renderSpBadge(r.story_points, r.sp_label, r.estimate_hours) },
        { key: 'status', label: t('requirement.status'), render: (r) => <span className={`badge ${STATUS_COLORS[r.status] || 'badge-gray'}`}>{statusLabel(r.status)}</span> },
        { key: 'receiver', label: t('requirement.requester'), hideOnMobile: true, render: (r) => r.receiver_name_display || '—' },
        { key: 'handler', label: t('requirement.handler'), hideOnMobile: true, render: (r) => r.handler_name_display || '—' },
        { key: 'updated_at', label: t('requirement.updatedAt'), hideOnMobile: true, render: (r) => r.updated_at?.slice(0, 16) },
      ]} loading={loading} />

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex justify-center items-center gap-3 p-4 border-t border-gray-100">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-secondary btn-sm">上一页</button>
            <span className="text-sm text-gray-500">每页 {data.length} 条，当前第 {page} 页，共 {Math.ceil(total / PAGE_SIZE)} 页</span>
            <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="btn btn-secondary btn-sm">下一页</button>
          </div>
        )}
        </div>
      </div>

      <ImportDrawer open={showImport} onClose={() => setShowImport(false)} onSuccess={load} />
    </div>
  );
}
