'use client';

import { useEffect, useState } from 'react';

export type RoleOption = {
  name: string;       // 系统角色 key (e.g. 'global_admin') 或项目内角色 key (e.g. 'admin')
  label: string;      // 显示名
  desc?: string;      // 描述（仅系统角色必有）
  source: 'system' | 'project';
};

const DEFAULT_PROJECT_ROLES: RoleOption[] = [
  { name: 'admin', label: '项目管理员', desc: '管理项目内所有需求和成员', source: 'project' },
  { name: 'member', label: '项目成员', desc: '可查看和处理项目需求', source: 'project' },
  { name: 'viewer', label: '只读', desc: '仅可查看项目需求', source: 'project' },
];

function parseProjectRoles(value: string | undefined): RoleOption[] {
  if (!value || !value.trim()) return DEFAULT_PROJECT_ROLES;
  return value.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const parts = s.split('|').map(p => p.trim());
    return { name: parts[0] || s, label: parts[1] || parts[0] || s, desc: parts[2] || '', source: 'project' as const };
  });
}

// ---------- 系统角色：来自 /api/roles (roles 表) ----------

let sysCache: RoleOption[] | null = null;
let sysInflight: Promise<RoleOption[]> | null = null;
const sysListeners = new Set<(c: RoleOption[]) => void>();

export async function loadSystemRoles(force = false): Promise<RoleOption[]> {
  if (sysCache && !force) return sysCache;
  if (sysInflight && !force) return sysInflight;
  sysInflight = (async () => {
    try {
      const r = await fetch('/api/roles', { credentials: 'include' });
      const d = await r.json();
      sysCache = (Array.isArray(d) ? d : []).map((r: any) => ({
        name: r.name, label: r.label, desc: r.description || '', source: 'system' as const,
      }));
    } catch {
      sysCache = [];
    } finally {
      sysInflight = null;
      sysListeners.forEach(fn => fn(sysCache!));
    }
    return sysCache!;
  })();
  return sysInflight;
}

export function invalidateSystemRoles() {
  sysCache = null;
  void loadSystemRoles(true);
}

export function useSystemRoles() {
  const [data, setData] = useState<RoleOption[]>(sysCache ?? []);
  const [loading, setLoading] = useState(!sysCache);
  useEffect(() => {
    if (sysCache) return;
    let mounted = true;
    const update = (c: RoleOption[]) => { if (mounted) { setData(c); setLoading(false); } };
    sysListeners.add(update);
    void loadSystemRoles();
    return () => { mounted = false; sysListeners.delete(update); };
  }, []);
  const labelOf = (v: string | null | undefined) => data.find(r => r.name === v)?.label || v || '';
  return { roles: data, labelOf, loading };
}

// ---------- 项目内角色：来自 /api/config (project_roles) ----------

let projCache: RoleOption[] | null = null;
let projInflight: Promise<RoleOption[]> | null = null;
const projListeners = new Set<(c: RoleOption[]) => void>();

export async function loadProjectRoles(force = false): Promise<RoleOption[]> {
  if (projCache && !force) return projCache;
  if (projInflight && !force) return projInflight;
  projInflight = (async () => {
    try {
      const r = await fetch('/api/config', { credentials: 'include' });
      const d = await r.json();
      const cfgs: any[] = d.configs || [];
      const raw = cfgs.find(c => c.key === 'project_roles')?.value as string | undefined;
      projCache = parseProjectRoles(raw);
    } catch {
      projCache = DEFAULT_PROJECT_ROLES;
    } finally {
      projInflight = null;
      projListeners.forEach(fn => fn(projCache!));
    }
    return projCache!;
  })();
  return projInflight;
}

export function invalidateProjectRoles() {
  projCache = null;
  void loadProjectRoles(true);
}

export function useProjectRoles() {
  const [data, setData] = useState<RoleOption[]>(projCache ?? DEFAULT_PROJECT_ROLES);
  const [loading, setLoading] = useState(!projCache);
  useEffect(() => {
    if (projCache) return;
    let mounted = true;
    const update = (c: RoleOption[]) => { if (mounted) { setData(c); setLoading(false); } };
    projListeners.add(update);
    void loadProjectRoles();
    return () => { mounted = false; projListeners.delete(update); };
  }, []);
  const labelOf = (v: string | null | undefined) => data.find(r => r.name === v)?.label || v || '';
  return { roles: data, labelOf, loading };
}
