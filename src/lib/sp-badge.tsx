/**
 * Story Point 共用工具
 *
 * 抽离自 requirements/workload 等页面 + API 路由里的重复实现。
 * - spToLabel: 数值 → T-shirt 标签（API/服务端可用，纯函数）
 * - spBadgeClass: 数值/标签 → Tailwind className
 * - SpBadge: 渲染徽章的组件（前端组件用）
 *
 * 设计依据：rms-docs/RMS-优化方案-阶段1-P0.md § 5.2
 */

export type SpLabel = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL' | null;

const SP_BADGE_COLORS: Record<string, string> = {
  S: 'bg-green-100 text-green-700',
  M: 'bg-yellow-100 text-yellow-700',
  L: 'bg-orange-100 text-orange-700',
  XL: 'bg-red-100 text-red-700',
  XXL: 'bg-purple-100 text-purple-700',
  XXXL: 'bg-purple-200 text-purple-800',
};

// 数值 → 标签
//   1/2=S, 3=M, 5=L, 8=XL, 13=XXL, 21=XXXL
//   其他数字走 fallback "${sp}P" 防止意外沉默
export function spToLabel(sp: number | null | undefined): SpLabel {
  if (sp == null) return null;
  const map: Record<number, SpLabel> = { 1: 'S', 2: 'S', 3: 'M', 5: 'L', 8: 'XL', 13: 'XXL', 21: 'XXXL' };
  return map[sp] ?? (`${sp}P` as SpLabel);
}

// 数值/标签 → Tailwind className（兼容旧的 spBadgeClass(sp, label) 双参数签名）
export function spBadgeClass(sp: number | null | undefined, label?: string | null): string {
  if (sp == null) return 'bg-gray-100 text-gray-400';
  const resolved = label || spToLabel(sp);
  if (resolved && SP_BADGE_COLORS[resolved]) return SP_BADGE_COLORS[resolved];
  // 兜底：按数值
  if (sp <= 2) return SP_BADGE_COLORS.S;
  if (sp === 3) return SP_BADGE_COLORS.M;
  if (sp === 5) return SP_BADGE_COLORS.L;
  if (sp === 8) return SP_BADGE_COLORS.XL;
  return SP_BADGE_COLORS.XXL;
}

// React 徽章组件（client/server 通用）
import * as React from 'react';

export function SpBadge({
  sp,
  label,
  estimateHours,
  className = '',
}: {
  sp: number | null | undefined;
  label?: string | null;
  estimateHours?: number | null;
  className?: string;
}) {
  if (sp == null) {
    return (
      <span className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400 ${className}`}>
        未估
      </span>
    );
  }
  const resolved = label || spToLabel(sp);
  const cls = spBadgeClass(sp, resolved);
  const hours = estimateHours != null ? ` · ${estimateHours}h` : '';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls} ${className}`}>
      {sp} ({resolved}){hours}
    </span>
  );
}
