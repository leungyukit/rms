import { NextResponse } from 'next/server';
import { OPENAPI_SPEC } from '@/lib/openapi-spec';

/**
 * OpenAPI 3.1 规范端点
 *
 * 2026-09-02：原来是手写的 3 个端点（requirements / projects / webhooks），
 * 实际有 149 条路径 —— Swagger UI 上等于什么都看不到。
 * 现改为读取 `scripts/generate-openapi.mjs` 扫描 src/app/api/ 目录后生成的
 * `src/lib/openapi-spec.ts`。新增路由后重跑生成脚本即可，不用手抄。
 *
 * servers 用相对路径 `/api`，避免把开发机 localhost:3800 写死进生产文档。
 */
export async function GET() {
  const spec = {
    ...OPENAPI_SPEC,
    // Webhook 事件清单：生成器扫不出来（是运行时约定，不是路由），手动挂在这里
    'x-events': [
      'requirement.created',
      'requirement.updated',
      'requirement.status_changed',
      'requirement.assigned',
      'requirement.completed',
      'project.created',
      'project.updated',
      'knowledge.published',
    ],
  };
  return NextResponse.json(spec, { headers: { 'Cache-Control': 'public, max-age=300' } });
}