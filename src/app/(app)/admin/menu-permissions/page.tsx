'use client';

import { Fragment, useEffect, useState } from 'react';
import { useT } from '@/i18n/config';
import { useRouter } from 'next/navigation';

interface Role {
  id: number;
  name: string;
  label: string;
}

interface MenuItem {
  id: number;
  href: string;
  icon: string;
  label_key: string;
  section: string;
  sort_order: number;
}

export default function MenuPermissionsPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [permissions, setPermissions] = useState<Record<number, Record<number, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const { t } = useT();

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const user = data.user || data;
        if (user?.roles?.includes('global_admin')) {
          setIsAdmin(true);
        } else {
          router.replace('/requirements');
        }
        setChecking(false);
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (checking || !isAdmin) return;
    fetch('/api/admin/menu-permissions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.json()))
      .then(data => {
        setRoles(data.roles || []);
        setMenuItems(data.menuItems || []);
        const parsed: Record<number, Record<number, boolean>> = {};
        for (const rid in data.permissions) {
          parsed[Number(rid)] = data.permissions[rid];
        }
        setPermissions(parsed);
      })
      .catch(() => setMessage('加载失败'));
  }, [checking, isAdmin]);

  if (checking) return <div className="p-6 text-center text-gray-500">加载中...</div>;
  if (!isAdmin) return null;

  const sectionLabel: Record<string, string> = {
    requirement: '需求',
    project: '项目',
    analysis: '分析',
    knowledge: '知识',
    admin: '系统管理',
  };

  const toggle = (roleId: number, menuId: number) => {
    setPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [menuId]: !(prev[roleId]?.[menuId] ?? true),
      },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const roleId in permissions) {
        for (const menuId in permissions[roleId]) {
          await fetch('/api/admin/menu-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              role_id: Number(roleId),
              menu_item_id: Number(menuId),
              allowed: permissions[roleId][menuId],
            }),
          });
        }
      }
      setMessage('保存成功');
    } catch {
      setMessage('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    (acc[item.section] = acc[item.section] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">菜单权限配置</h1>
      <p className="text-sm text-gray-500 mb-4">勾选表示该角色可以使用此菜单项，取消勾选则隐藏。</p>

      {message && <div className="mb-4 text-sm text-gray-900">{message}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 bg-white rounded-xl overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">菜单项</th>
              {roles.map(r => (
                <th key={r.id} className="text-center px-4 py-3 text-sm font-medium text-gray-600 min-w-[100px]">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(grouped).map(([section, items]) => (
              <Fragment key={section}>
                <tr>
                  <td colSpan={roles.length + 1} className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {sectionLabel[section] || section}
                  </td>
                </tr>
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      <span className="mr-2">{item.icon}</span>
                      <span>{t(item.label_key)}</span>
                      <span className="text-xs text-gray-400 ml-2">{item.href}</span>
                    </td>
                    {roles.map(r => (
                      <td key={r.id} className="text-center px-4 py-2">
                        <input
                          type="checkbox"
                          checked={permissions[r.id]?.[item.id] ?? true}
                          onChange={() => toggle(r.id, item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-700"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <button
          onClick={saveAll}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
