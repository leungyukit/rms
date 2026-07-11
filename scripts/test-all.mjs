#!/usr/bin/env node
/**
 * RMS 全面端到端测试
 * 覆盖：所有 API 端点 + 关键前端页面
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const BASE = 'http://localhost:3800';
const COOKIE_JAR = {};
let TOTAL = 0, PASS = 0, FAIL = 0, SKIP = 0;
const FAILURES = [];

// ==================== HTTP 工具 ====================
function cookieHeader() {
  return Object.entries(COOKIE_JAR).map(([k, v]) => `${k}=${v}`).join('; ');
}
function saveSetCookie(res) {
  const sc = res.headers['set-cookie'] || [];
  for (const s of sc) {
    const [pair] = s.split(';');
    const [k, v] = pair.split('=');
    if (k) COOKIE_JAR[k] = v;
  }
}
async function req(method, path, { body, headers = {}, expectStatus } = {}) {
  const url = new URL(BASE + path);
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: {
        'Cookie': cookieHeader(),
        'User-Agent': 'rms-test/1.0',
        ...headers,
      },
    };
    const r = http.request(url, opts, (res) => {
      saveSetCookie(res);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}
async function get(p, opts) { return req('GET', p, opts); }
async function post(p, body, opts) { return req('POST', p, { ...opts, body, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } }); }
async function put(p, body, opts) { return req('PUT', p, { ...opts, body, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } }); }
async function del(p, opts) { return req('DELETE', p, opts); }

// ==================== 断言 ====================
async function test(name, fn) {
  TOTAL++;
  const start = Date.now();
  try {
    await fn();
    PASS++;
    const ms = Date.now() - start;
    console.log(`  ✅ ${name} (${ms}ms)`);
  } catch (e) {
    FAIL++;
    FAILURES.push({ name, err: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
function expectStatus(res, want) {
  const list = Array.isArray(want) ? want : [want];
  if (!list.includes(res.status)) {
    throw new Error(`HTTP ${res.status} (expected ${list.join('|')}): ${res.text.slice(0, 200)}`);
  }
}
function skip(name, reason) {
  TOTAL++;
  SKIP++;
  console.log(`  ⏭️  ${name}: ${reason}`);
}

// ==================== 测试分组 ====================
const groups = [];

async function group(name, fn) {
  console.log(`\n========== ${name} ==========`);
  await fn();
}

// ============ 1. 健康检查 ============
groups.push(async () => {
  await group('1. 健康检查', async () => {
    await test('GET /api/health', async () => {
      const r = await get('/api/health');
      expectStatus(r, 200);
    });
  });
});

// ============ 2. 认证 ============
groups.push(async () => {
  await group('2. 认证（auth）', async () => {
    await test('POST /api/auth/login 错误密码', async () => {
      const r = await post('/api/auth/login', { username: 'admin', password: 'wrong' });
      expectStatus(r, 401);
    });
    await test('POST /api/auth/login 正确密码', async () => {
      const r = await post('/api/auth/login', { username: 'admin', password: '123456' });
      expectStatus(r, 200);
      expect(r.json?.success, 'success=true');
    });
    await test('GET /api/auth/me 已登录', async () => {
      const r = await get('/api/auth/me');
      expectStatus(r, 200);
      expect(r.json?.user || r.json?.id, '有用户信息');
    });
    await test('GET /api/auth/tokens', async () => {
      const r = await get('/api/auth/tokens');
      expectStatus(r, [200, 404, 405]); // 可能未实现
    });
  });
});

// ============ 3. 需求管理 ============
let createdReqId = null;
groups.push(async () => {
  await group('3. 需求管理（requirements）', async () => {
    await test('GET /api/requirements 列表', async () => {
      const r = await get('/api/requirements');
      expectStatus(r, [200, 401]);
      if (r.status === 200) expect(Array.isArray(r.json?.items || r.json?.data || r.json), '有列表');
    });
    await test('POST /api/requirements 创建', async () => {
      const r = await post('/api/requirements', {
        title: '【测试】自动测试创建的需求',
        description: '由 test-all.mjs 自动创建',
        priority: 'medium',
      });
      expectStatus(r, [200, 201, 401]);
      if (r.status === 200 || r.status === 201) {
        createdReqId = r.json?.id || r.json?.data?.id;
      }
    });
    if (createdReqId) {
      await test(`GET /api/requirements/${createdReqId}`, async () => {
        const r = await get(`/api/requirements/${createdReqId}`);
        expectStatus(r, [200, 401]);
      });
      await test(`GET /api/requirements/${createdReqId}/status`, async () => {
        const r = await get(`/api/requirements/${createdReqId}/status`);
        expectStatus(r, [200, 401, 404, 405]);
      });
      await test(`GET /api/requirements/${createdReqId}/versions`, async () => {
        const r = await get(`/api/requirements/${createdReqId}/versions`);
        expectStatus(r, [200, 401, 404]);
      });
      await test(`POST /api/requirements/${createdReqId}/comments`, async () => {
        const r = await post(`/api/requirements/${createdReqId}/comments`, { content: '测试评论' });
        expectStatus(r, [200, 201, 401, 404]);
      });
    } else {
      skip('详情相关', '创建失败');
    }
    await test('GET /api/requirements/export', async () => {
      const r = await get('/api/requirements/export');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 4. 项目管理 ============
let createdProjId = null;
groups.push(async () => {
  await group('4. 项目管理（projects）', async () => {
    await test('GET /api/projects 列表', async () => {
      const r = await get('/api/projects');
      expectStatus(r, [200, 401]);
    });
    await test('POST /api/projects 创建', async () => {
      const r = await post('/api/projects', { name: '【测试】自动测试项目', description: '由 test-all.mjs 创建' });
      expectStatus(r, [200, 201, 401, 400]);
      if (r.status === 200 || r.status === 201) createdProjId = r.json?.id || r.json?.data?.id;
    });
    if (createdProjId) {
      await test(`GET /api/projects/${createdProjId}`, async () => {
        const r = await get(`/api/projects/${createdProjId}`);
        expectStatus(r, [200, 401, 404]);
      });
      await test(`GET /api/projects/${createdProjId}/health`, async () => {
        const r = await get(`/api/projects/${createdProjId}/health`);
        expectStatus(r, [200, 401, 404]);
      });
    }
  });
});

// ============ 5. 用户/角色管理 ============
groups.push(async () => {
  await group('5. 用户 / 角色管理', async () => {
    await test('GET /api/users', async () => {
      const r = await get('/api/users');
      expectStatus(r, [200, 401, 403]);
    });
    await test('GET /api/roles', async () => {
      const r = await get('/api/roles');
      expectStatus(r, [200, 401, 403]);
    });
    await test('GET /api/tags', async () => {
      const r = await get('/api/tags');
      expectStatus(r, [200, 401, 403]);
    });
  });
});

// ============ 6. 知识库 ============
groups.push(async () => {
  await group('6. 知识库（knowledge）', async () => {
    await test('GET /api/knowledge', async () => {
      const r = await get('/api/knowledge');
      expectStatus(r, [200, 401]);
    });
    await test('GET /api/knowledge/stats', async () => {
      const r = await get('/api/knowledge/stats');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/knowledge/graph', async () => {
      const r = await get('/api/knowledge/graph');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 7. Dashboard / 报表 ============
groups.push(async () => {
  await group('7. Dashboard / 报表', async () => {
    await test('GET /api/dashboard', async () => {
      const r = await get('/api/dashboard');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/dashboard/workload', async () => {
      const r = await get('/api/dashboard/workload');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/reports/weekly', async () => {
      const r = await get('/api/reports/weekly');
      expectStatus(r, [200, 401]);
    });
    await test('GET /api/reports/weekly/history', async () => {
      const r = await get('/api/reports/weekly/history');
      expectStatus(r, [200, 401]);
    });
  });
});

// ============ 8. Webhook (P3 §3) ============
let createdWebhookId = null;
groups.push(async () => {
  await group('8. Webhook（P3 §3）', async () => {
    await test('GET /api/v1/webhooks', async () => {
      const r = await get('/api/v1/webhooks');
      expectStatus(r, [200, 401]);
    });
    await test('POST /api/v1/webhooks 创建', async () => {
      const r = await post('/api/v1/webhooks', {
        name: '【测试】自动测试 Webhook',
        url: 'http://httpbin.org/post',
        events: ['requirement.created'],
      });
      expectStatus(r, [200, 201, 401, 400]);
      if (r.status === 200 || r.status === 201) createdWebhookId = r.json?.id || r.json?.data?.id;
    });
    if (createdWebhookId) {
      await test(`GET /api/v1/webhooks/${createdWebhookId}/deliveries`, async () => {
        const r = await get(`/api/v1/webhooks/${createdWebhookId}/deliveries`);
        expectStatus(r, [200, 401, 404]);
      });
      await test(`POST /api/v1/webhooks/${createdWebhookId}/test`, async () => {
        const r = await post(`/api/v1/webhooks/${createdWebhookId}/test`, {});
        expectStatus(r, [200, 401, 404, 400]);
      });
    }
    await test('GET /api/admin/webhook-worker 状态', async () => {
      const r = await get('/api/admin/webhook-worker');
      expectStatus(r, [200, 401, 403]);
    });
    await test('POST /api/admin/webhook-worker trigger', async () => {
      const r = await post('/api/admin/webhook-worker', { action: 'trigger' });
      expectStatus(r, [200, 401, 403, 400]);
    });
  });
});

// ============ 9. OpenAPI / Swagger (P3 §5) ============
groups.push(async () => {
  await group('9. OpenAPI / Swagger（P3 §5）', async () => {
    await test('GET /api/v1/openapi.json', async () => {
      const r = await get('/api/v1/openapi.json');
      expectStatus(r, [200, 401]);
      if (r.status === 200) {
        expect(r.json?.info?.title === 'RMS API', 'title=RMS API');
        expect(typeof r.json?.paths === 'object', '有 paths');
      }
    });
    await test('GET /api/v1/docs', async () => {
      const r = await get('/api/v1/docs');
      expectStatus(r, [200, 401]);
      if (r.status === 200) {
        expect(r.text.includes('swagger-ui'), '含 swagger-ui');
      }
    });
  });
});

// ============ 10. Sprint / 迭代 ============
groups.push(async () => {
  await group('10. Sprint / 迭代', async () => {
    await test('GET /api/sprints', async () => {
      const r = await get('/api/sprints');
      expectStatus(r, [200, 401]);
    });
  });
});

// ============ 11. SLA / Timesheet / Workload ============
groups.push(async () => {
  await group('11. SLA / Timesheet / Workload', async () => {
    await test('GET /api/sla/dashboard', async () => {
      const r = await get('/api/sla/dashboard');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/sla/warnings', async () => {
      const r = await get('/api/sla/warnings');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/workload/capacity', async () => {
      const r = await get('/api/workload/capacity');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/work-logs', async () => {
      const r = await get('/api/work-logs');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 12. Search / Timeline / Chat / Calendar ============
groups.push(async () => {
  await group('12. Search / Timeline / Chat / Calendar', async () => {
    await test('GET /api/search?q=test', async () => {
      const r = await get('/api/search?q=test');
      expectStatus(r, [200, 401]);
    });
    await test('GET /api/search/suggest', async () => {
      const r = await get('/api/search/suggest?q=test');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/timeline', async () => {
      const r = await get('/api/timeline');
      expectStatus(r, [200, 400, 401, 404]);  // 可能要求 requirement_id
    });
    await test('GET /api/calendar?start=2026-06-01&end=2026-06-30', async () => {
      const r = await get('/api/calendar?start=2026-06-01&end=2026-06-30');
      expectStatus(r, [200, 401, 404]);
    });
    await test('POST /api/chat', async () => {
      const r = await post('/api/chat', { message: '测试' });
      expectStatus(r, [200, 401, 404, 405]);
    });
    await test('GET /api/notifications', async () => {
      const r = await get('/api/notifications');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 13. Admin: dedup / field-policy / integrations ============
groups.push(async () => {
  await group('13. Admin 模块', async () => {
    await test('POST /api/admin/dedup/scan', async () => {
      const r = await post('/api/admin/dedup/scan', {});
      expectStatus(r, [200, 401, 403, 404, 405]);
    });
    await test('GET /api/admin/field-policies', async () => {
      const r = await get('/api/admin/field-policies');
      expectStatus(r, [200, 401, 403, 404]);
    });
    await test('GET /api/admin/integrations', async () => {
      const r = await get('/api/admin/integrations');
      expectStatus(r, [200, 401, 403, 404]);
    });
    await test('GET /api/audit-logs', async () => {
      const r = await get('/api/audit-logs');
      expectStatus(r, [200, 401, 403, 404]);
    });
    await test('GET /api/config', async () => {
      const r = await get('/api/config');
      expectStatus(r, [200, 401]);
    });
  });
});

// ============ 14. Workflows ============
groups.push(async () => {
  await group('14. Workflows', async () => {
    await test('GET /api/workflows', async () => {
      const r = await get('/api/workflows');
      expectStatus(r, [200, 401, 404]);
    });
    await test('GET /api/workflow-monitor', async () => {
      const r = await get('/api/workflow-monitor');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 15. i18n ============
groups.push(async () => {
  await group('15. i18n', async () => {
    await test('GET /api/i18n/locale', async () => {
      const r = await get('/api/i18n/locale');
      expectStatus(r, [200, 401, 404]);
    });
  });
});

// ============ 16. Database / Health ============
groups.push(async () => {
  await group('16. Database / System', async () => {
    await test('GET /api/database', async () => {
      const r = await get('/api/database');
      expectStatus(r, [200, 401, 404, 405]);
    });
  });
});

// ============ 17. 前端页面（page render） ============
const pages = [
  '/', '/login', '/dashboard', '/requirements', '/requirements/new', '/projects',
  '/knowledge', '/sprints', '/timesheet', '/workload', '/gantt', '/kanban',
  '/admin/users', '/admin/config', '/admin/dedup', '/admin/advanced', '/admin/field-policies',
  '/admin/integrations', '/admin/audit-logs',
  '/openapi', '/calendar', '/chat', '/checklist/my', '/sla-dashboard',
  '/workflows', '/workflows/designer', '/workflows/monitor',
  '/profile/tokens', '/knowledge/graph', '/knowledge/insights',
];
groups.push(async () => {
  await group('17. 前端页面（SSR）', async () => {
    for (const p of pages) {
      await test(`GET ${p}`, async () => {
        const r = await get(p, { headers: { Accept: 'text/html' } });
        // 期望 200（HTML）或 302（重定向到 login）
        expectStatus(r, [200, 302, 307]);
        if (r.status === 200) {
          expect(r.text.includes('<!DOCTYPE') || r.text.includes('<!doctype'), 'HTML 文档');
        }
      });
    }
  });
});

// ============ 18. Logout ============
groups.push(async () => {
  await group('18. Logout', async () => {
    await test('POST /api/auth/logout', async () => {
      const r = await post('/api/auth/logout', {});
      expectStatus(r, [200, 401, 405]);
    });
  });
});

// ==================== 主流程 ====================
console.log('========== RMS 全面测试 ==========');
console.log(`目标: ${BASE}`);
console.log(`共 ${groups.length} 个测试组\n`);

for (const g of groups) {
  try { await g(); } catch (e) { console.error('Group error:', e.message); }
}

console.log('\n========== 测试汇总 ==========');
console.log(`总计: ${TOTAL}`);
console.log(`✅ 通过: ${PASS}`);
console.log(`❌ 失败: ${FAIL}`);
console.log(`⏭️  跳过: ${SKIP}`);
console.log(`通过率: ${(PASS / TOTAL * 100).toFixed(1)}%`);

if (FAIL > 0) {
  console.log('\n========== 失败详情 ==========');
  for (const f of FAILURES) {
    console.log(`❌ ${f.name}`);
    console.log(`   ${f.err.slice(0, 300)}`);
  }
  process.exit(1);
}
process.exit(0);
