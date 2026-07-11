import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'RMS API',
      version: '1.0.0',
      description: '用户需求管理系统 REST API',
    },
    servers: [{ url: 'http://localhost:3800/api/v1', description: 'Local dev' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/requirements': {
        get: {
          summary: '列出需求',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'priority', in: 'query', schema: { type: 'string', enum: ['high', 'medium', 'low'] } },
            { name: 'project_id', in: 'query', schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 } },
          ],
          responses: { 200: { description: 'OK' } },
        },
        post: {
          summary: '创建需求',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 201: { description: 'Created' } },
        },
      },
      '/projects': {
        get: { summary: '列出项目', responses: { 200: { description: 'OK' } } },
      },
      '/webhooks': {
        get: { summary: '列出我的 Webhook 订阅', responses: { 200: { description: 'OK' } } },
        post: {
          summary: '创建 Webhook 订阅',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'target_url', 'events'],
                  properties: {
                    name: { type: 'string' },
                    target_url: { type: 'string', format: 'uri' },
                    events: { type: 'array', items: { type: 'string' } },
                    filter_project_id: { type: 'integer', nullable: true },
                    filter_priority: { type: 'string', enum: ['high', 'medium', 'low'], nullable: true },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Created (returns secret)' } },
        },
      },
    },
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
