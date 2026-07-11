'use client';
/**
 * API 文档入口页
 * P3 §5: 嵌入 Swagger UI
 */
import { useState } from 'react';

export default function OpenApiPage() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">📚 API 文档</h1>
          <p className="text-xs text-gray-500">基于 OpenAPI 3.1.0 · 完整定义见 <a href="/api/v1/openapi.json" className="text-gray-800 underline" target="_blank">/api/v1/openapi.json</a></p>
        </div>
        <div className="flex gap-2">
          <a href="/api/v1/docs" target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">
            🔗 在新窗口打开
          </a>
          <a href="/api/v1/openapi.json" target="_blank" className="btn btn-sm btn-secondary">
            📄 查看 OpenAPI JSON
          </a>
        </div>
      </div>
      <iframe
        src="/api/v1/docs"
        className="flex-1 w-full border-0"
        onLoad={() => setLoading(false)}
        title="Swagger UI"
      />
    </div>
  );
}
