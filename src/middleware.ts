import { NextRequest, NextResponse } from 'next/server';

// Edge Runtime 不能用 Node crypto；用 Web Crypto API 替代
async function hashTokenForMiddleware(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  if (pathname === '/login' || pathname === '/register' ||
      pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/register') ||
      pathname.startsWith('/api/auth/wecom') || pathname.startsWith('/api/auth/feishu') || pathname.startsWith('/api/auth/dingtalk') ||
      pathname.startsWith('/api/integrations/') ||  // 飞书/企微/钉钉 公开 webhook 回调
      pathname.startsWith('/api/public-files/') ||
      pathname === '/api/health') {  // 健康检查公开
    return NextResponse.next();
  }

  // MCP 端点：跳过中间件的 cookie 检查，由路由自己鉴权（2026-09-02）
  //
  // 为什么必须放行：
  //   1. MCP 客户端走 `Authorization: Bearer rms_xxx`，不带 cookie。下面那段
  //      Bearer 分支本可放过，但**只在 token 以 rms_ 开头时**才放行；
  //      非法/缺失 token 会掉到 cookie 检查，被中间件抢先返回「未登录」401。
  //   2. 这会让 mcp_enabled=false 时该返回的 404、以及 MCP 协议要求的
  //      `WWW-Authenticate: Bearer` 401 全都发不出去 —— 客户端拿到的错误无法区分
  //      「服务没开」和「token 不对」。
  //
  // ⚠️ 放行 ≠ 不鉴权。src/app/api/mcp/route.ts 里有三道闸，顺序固定：
  //      mcp_enabled 关 → 404 ／ getCurrentUser() 为空 → 401 ／ 超限 → 429
  //    改那个文件时不要动掉鉴权，否则这里就成了真的后门。
  if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) {
    const mcpAuth = request.headers.get('authorization');
    const mcpXToken = request.headers.get('x-access-token');
    const bearer = mcpAuth?.startsWith('Bearer ') ? mcpAuth.substring(7) : null;
    const raw = bearer?.startsWith('rms_') ? bearer
      : mcpXToken?.startsWith('rms_') ? mcpXToken
      : null;
    if (raw) {
      // 与下面通用分支一致：把 token 规范化到 x-access-token 交给路由
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-access-token', raw);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  // Check for Access Token in API routes (Bearer or x-access-token)
  const authHeader = request.headers.get('authorization');
  const xAccessToken = request.headers.get('x-access-token');
  if (pathname.startsWith('/api/')) {
    let token: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (xAccessToken?.startsWith('rms_')) {
      token = xAccessToken;
    }
    if (token?.startsWith('rms_')) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-access-token', token);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  // Check auth for app routes and API routes
  const cookieToken = request.cookies.get('rms_token')?.value;
  if (!cookieToken && (pathname.startsWith('/api/') || pathname === '/' || pathname.startsWith('/chat') || pathname.startsWith('/requirements') || pathname.startsWith('/projects') || pathname.startsWith('/kanban') || pathname.startsWith('/gantt') || pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/profile'))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
