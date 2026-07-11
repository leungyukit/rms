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
