'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';

/**
 * 根页面 — 自动跳转到 /home（已登录）或 /login（未登录）
 */
export default function RootPage() {
  const router = useRouter();
  const { token, checkAuth } = useAuthStore();

  useEffect(() => {
    if (token) {
      checkAuth().then(() => router.push('/home'));
    } else {
      router.push('/login');
    }
  }, [token, checkAuth, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">加载中...</p>
    </main>
  );
}
