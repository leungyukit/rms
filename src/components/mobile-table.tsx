'use client';

import { useIsMobile } from './responsive-table';
import Link from 'next/link';

interface Column { key: string; label: string; width?: string; hideOnMobile?: boolean; mobileLabel?: string; render?: (row: any) => React.ReactNode }

export function MobileTable({ data, columns, loading }: { data: any[]; columns: Column[]; loading?: boolean }) {
  const isMobile = useIsMobile();

  if (loading) return <div className="bg-white rounded-xl border p-12 text-center text-gray-400 text-sm">加载中...</div>;
  if (!data.length) return <div className="bg-white rounded-xl border p-12 text-center text-gray-400 text-sm">暂无数据</div>;

  if (isMobile) {
    const visibleCols = columns.filter(c => !c.hideOnMobile);
    return (
      <div className="space-y-2">
        {data.map((r, i) => (
          <Link key={r.id ?? i} href={`/requirements/${r.id}`} className="block bg-white border rounded-lg p-3 shadow-sm hover:border-blue-300">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="font-medium text-sm text-gray-800 line-clamp-2 flex-1">{r.title || r.name || `#${r.id}`}</div>
              <span className="text-[10px] text-gray-400 shrink-0">#{r.id}</span>
            </div>
            <div className="space-y-0.5">
              {visibleCols.filter(c => c.key !== 'title' && c.key !== 'id').map(col => (
                <div key={col.key} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-500 shrink-0">{col.mobileLabel || col.label}</span>
                  <span className="text-gray-800 truncate">{col.render ? col.render(r) : (r[col.key] ?? '-')}</span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left px-4 py-3 font-medium text-gray-500" style={c.width ? { width: c.width } : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((r, i) => (
              <tr key={r.id ?? i} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/requirements/${r.id}`}>
                {columns.map(c => (
                  <td key={c.key} className="px-4 py-3">{c.render ? c.render(r) : (r[c.key] ?? '-')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
