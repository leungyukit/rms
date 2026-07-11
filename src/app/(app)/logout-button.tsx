'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <button onClick={logout} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
      退出登录
    </button>
  );
}
