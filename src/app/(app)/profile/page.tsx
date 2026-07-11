'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profile/tokens');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400">正在跳转...</div>
    </div>
  );
}
