'use client';

import { useEffect } from 'react';

export default function AdvancedConfigPage() {
  useEffect(() => {
    window.location.href = '/admin/config';
  }, []);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400">正在跳转到系统配置...</div>
    </div>
  );
}
