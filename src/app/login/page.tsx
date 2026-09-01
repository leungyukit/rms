'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/i18n/config';

function LoginContent() {
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [wecomEnabled, setWecomEnabled] = useState(false);
  const [wecomConfig, setWecomConfig] = useState<any>(null);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [feishuConfig, setFeishuConfig] = useState<any>(null);
  const [dingtalkEnabled, setDingtalkEnabled] = useState(false);
  const [dingtalkConfig, setDingtalkConfig] = useState<any>(null);
  const [showQrCode, setShowQrCode] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for OAuth callback errors
  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      const msgs: Record<string, string> = {
        wecom_no_code: '企业微信授权失败：未获取到授权码',
        wecom_not_configured: '企业微信登录未配置',
        wecom_no_userid: '无法获取企业微信用户信息',
        wecom_user_not_found: '该企业微信用户未注册，请联系管理员',
        wecom_error: `企业微信登录失败：${searchParams.get('msg') || '未知错误'}`,
        feishu_no_code: '飞书授权失败：未获取到授权码',
        feishu_not_configured: t('auth.feishuLoginUnconfigured'),
        feishu_no_userid: t('auth.feishuUserInfoFailed'),
        feishu_user_not_found: '该飞书用户未注册，请联系管理员',
        feishu_error: `飞书登录失败：${searchParams.get('msg') || '未知错误'}`,
        dingtalk_no_code: '钉钉授权失败：未获取到授权码',
        dingtalk_not_configured: t('auth.dingtalkLoginUnconfigured'),
        dingtalk_no_userid: '无法获取钉钉用户信息',
        dingtalk_user_not_found: '该钉钉用户未注册，请联系管理员',
        dingtalk_error: `钉钉登录失败：${searchParams.get('msg') || '未知错误'}`,
      };
      setError(msgs[err] || t('error.serverError'));
    }
  }, [searchParams]);

  // Check OAuth availability
  useEffect(() => {
    fetch('/api/auth/wecom').then(r => r.json()).then(d => {
      if (d.enabled) { setWecomEnabled(true); setWecomConfig(d); }
    }).catch(() => {});
    fetch('/api/auth/feishu').then(r => r.json()).then(d => {
      if (d.enabled) { setFeishuEnabled(true); setFeishuConfig(d); }
    }).catch(() => {});
    fetch('/api/auth/dingtalk').then(r => r.json()).then(d => {
      if (d.enabled) { setDingtalkEnabled(true); setDingtalkConfig(d); }
    }).catch(() => {});
  }, []);

  // Load WeCom QR code when showQrCode changes
  useEffect(() => {
    if (showQrCode !== 'wecom' || !wecomConfig || !qrRef.current) return;

    qrRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://wwcdn.weixin.qq.com/node/wework/wwopen/js/sso/wwLogin-1.2.7.js';
    script.onload = () => {
      if ((window as any).WwLogin && qrRef.current) {
        new (window as any).WwLogin({
          id: 'wecom_qr_container',
          appid: wecomConfig.corpId,
          agentid: wecomConfig.agentId,
          redirect_uri: encodeURIComponent(wecomConfig.redirectUri),
          state: wecomConfig.state || 'rms_login',
          href: '',
          lang: 'zh',
        });
      }
    };
    document.body.appendChild(script);

    return () => { try { document.body.removeChild(script); } catch {} };
  }, [showQrCode, wecomConfig]);

  const handleOAuthLogin = (type: string) => {
    if (type === 'feishu' && feishuConfig) {
      window.location.href = feishuConfig.qrUrl;
    } else if (type === 'dingtalk' && dingtalkConfig) {
      window.location.href = dingtalkConfig.qrUrl;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const url = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body: any = { username, password };
      if (isRegister) body.display_name = displayName || username;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('common.failed')); return; }
      router.push('/chat');
      router.refresh();
    } catch { setError(t('error.networkError')); }
    finally { setLoading(false); }
  };

  const hasAnyOAuth = wecomEnabled || feishuEnabled || dingtalkEnabled;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <img src="/logo.png" alt="RMS Logo" className="w-16 h-16 object-contain mb-4" />
          <h1 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">{t('auth.loginSubtitle')}</h1>
          <p className="text-sm text-[var(--muted-fg)] mt-1.5">{t('requirement.title')}{t('common.search')}{t('dashboard.myRequirements')}</p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-c)] rounded-lg p-8" style={{ boxShadow: 'var(--shadow-lg)' }}>
          {showQrCode === 'wecom' ? (
            /* ===== WeCom QR Code View ===== */
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[var(--foreground)]">{t('auth.wechatWorkLogin')}</h2>
                <button onClick={() => setShowQrCode(null)} className="text-sm font-medium text-[var(--primary-c)] hover:underline underline-offset-2">
                  ← {t('auth.goLogin')}
                </button>
              </div>

              <div className="flex flex-col items-center">
                <div id="wecom_qr_container" ref={qrRef} className="w-[300px] h-[400px] flex items-center justify-center border border-[var(--border-c)] rounded-md">
                  <div className="text-sm text-[var(--muted-fg)] animate-pulse">{t('common.loading')}</div>
                </div>
                <p className="text-xs text-[var(--muted-fg)] mt-2">{t('auth.wechatWorkLogin')}</p>
                <p className="text-xs text-[var(--muted-fg)] opacity-70 mt-1">{t('auth.sessionExpired')}</p>
              </div>

              {error && <div className="alert alert-danger text-sm mt-4">{error}</div>}
            </div>
          ) : (
            /* ===== Normal Login/Register Form ===== */
            <div>
              <h2 className="text-lg font-semibold mb-6 text-[var(--foreground)]">{isRegister ? t('auth.register') : t('auth.login')}</h2>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="form-label">{t('auth.username')}</label>
                  <input value={username} onChange={e => setUsername(e.target.value)}
                    className="form-input"
                    placeholder={t('auth.username')} required />
                </div>
                {isRegister && (
                  <div>
                    <label className="form-label">{t('user.displayName')}</label>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                      className="form-input"
                      placeholder={t('user.displayName')} />
                  </div>
                )}
                <div>
                  <label className="form-label">{t('auth.password')}</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="form-input"
                    placeholder={t('auth.password')} required />
                </div>

                {error && <div className="alert alert-danger text-sm">{error}</div>}

                <button type="submit" disabled={loading}
                  className="btn btn-primary w-full btn-lg">
                  {loading ? t('misc.processing') : isRegister ? t('auth.register') : t('auth.login')}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button onClick={() => { setIsRegister(!isRegister); setError(''); }}
                  className="text-sm font-medium text-[var(--primary-c)] hover:underline underline-offset-2 px-1 transition-colors">
                  {isRegister ? t('auth.haveAccount') + ' ' + t('auth.goLogin') : t('auth.needAccount') + ' ' + t('auth.goRegister')}
                </button>
              </div>

              {/* OAuth Login Icons */}
              {hasAnyOAuth && !isRegister && (
                <div className="mt-6 pt-5 border-t border-[var(--border-c)]">
                  <div className="text-center">
                    <p className="text-xs text-[var(--muted-fg)] mb-3">{t('auth.needAccount')}</p>
                    <div className="flex justify-center gap-4">
                      {wecomEnabled && (
                        <button
                          onClick={() => { setShowQrCode('wecom'); setError(''); }}
                          className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#07C160] hover:opacity-90 transition-opacity"
                          style={{ boxShadow: 'var(--shadow)' }}
                          title="企业微信扫码登录"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M15.85 8.14c.26 0 .51.01.77.04C15.86 5.24 12.82 3 9.23 3 5.14 3 1.8 5.83 1.8 9.34c0 2.02 1.1 3.76 2.81 5.05l-.7 2.14 2.48-1.24c.87.24 1.63.49 2.54.49.25 0 .5-.01.74-.04-.16-.54-.24-1.1-.24-1.68 0-3.23 2.77-5.92 6.42-5.92zM12 6.76c.49 0 .88.39.88.87 0 .49-.39.88-.88.88-.48 0-.87-.39-.87-.88 0-.48.39-.87.87-.87zM6.47 8.51c-.49 0-.88-.39-.88-.88 0-.48.39-.87.88-.87.48 0 .87.39.87.87 0 .49-.39.88-.87.88z"/>
                            <path d="M22.2 14.06c0-2.93-2.93-5.32-6.21-5.32-3.47 0-6.22 2.39-6.22 5.32 0 2.94 2.75 5.32 6.22 5.32.73 0 1.46-.12 2.19-.37l1.93.97-.53-1.71c1.47-1.1 2.62-2.73 2.62-4.21zm-8.34-.88c-.37 0-.67-.3-.67-.67 0-.37.3-.67.67-.67.37 0 .67.3.67.67 0 .37-.3.67-.67.67zm4.25 0c-.37 0-.67-.3-.67-.67 0-.37.3-.67.67-.67.37 0 .67.3.67.67 0 .37-.3.67-.67.67z"/>
                          </svg>
                        </button>
                      )}
                      {feishuEnabled && (
                        <button
                          onClick={() => handleOAuthLogin('feishu')}
                          className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#427BA8] hover:opacity-90 transition-opacity"
                          style={{ boxShadow: 'var(--shadow)' }}
                          title="飞书扫码登录"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-2-8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
                          </svg>
                        </button>
                      )}
                      {dingtalkEnabled && (
                        <button
                          onClick={() => handleOAuthLogin('dingtalk')}
                          className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#1677FF] hover:opacity-90 transition-opacity"
                          style={{ boxShadow: 'var(--shadow)' }}
                          title="钉钉扫码登录"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 13.78c-.24.72-.96 1.22-1.72 1.22h-2.0c-.88 0-1.6-.72-1.6-1.6v-4.0c0-.76.52-1.4 1.24-1.6.12-.72.96-1.22 1.72-1.22h2.0c.88 0 1.6.72 1.6 1.6v4.0c0 .76-.52 1.4-1.24 1.6z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted-fg)] mt-2">
                      {[wecomEnabled && '企业微信', feishuEnabled && '飞书', dingtalkEnabled && '钉钉'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[var(--muted-fg)] mt-6">
          {hasAnyOAuth ? `${[wecomEnabled && t('auth.wechatWorkLogin'), feishuEnabled && t('auth.feishuLogin'), dingtalkEnabled && t('auth.dingtalkLogin')].filter(Boolean).join(' · ')} · ` : ''}{t('user.autoRegister')}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--background)]"><div className="text-sm text-[var(--muted-fg)] border border-[var(--border-c)] rounded-md p-4" style={{boxShadow:'var(--shadow)'}}>加载中...</div></div>}>
      <LoginContent />
    </Suspense>
  );
}
