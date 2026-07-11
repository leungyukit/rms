'use client';

/**
 * 移动端 Tabs 组件
 * 用于需求详情等长内容页面，把多个 section 折叠成 tab 切换
 * - 桌面：children 直接渲染（保持原布局）
 * - 移动 (<768px)：用 tab 切换，只显示当前 tab 内容
 */
import React, { useState } from 'react';
import { useIsMobile } from './responsive-table';

export interface Tab {
  key: string;
  label: string;
  icon: string;
  badge?: number | string;
  render: () => React.ReactNode;
}

interface MobileTabsProps {
  tabs: Tab[];
  defaultTab?: string;
  className?: string;
}

export function MobileTabs({ tabs, defaultTab, className = '' }: MobileTabsProps) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);

  if (!isMobile) {
    return <div className={className}>{tabs.map(t => <div key={t.key}>{t.render()}</div>)}</div>;
  }

  const activeTab = tabs.find(t => t.key === active) || tabs[0];

  return (
    <div className={className}>
      {/* 横向滚动 tab bar */}
      <div className="sticky top-0 z-20 bg-white border-b mb-3 -mx-4 px-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? 'border-blue-500 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.badge !== undefined && t.badge !== null && t.badge !== '' && (
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 当前 tab 内容 */}
      <div>{activeTab.render()}</div>
    </div>
  );
}
