'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { VersionFooter } from '@/components/layout/VersionFooter';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, checkAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={28} />
        <span className="ml-3 text-muted-foreground text-sm">加载中...</span>
      </div>
    );
  }

  if (!user) return null; // 等待跳转

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <DashboardHeader />
      <div className="flex flex-1">
        <Sidebar isAdmin={user.superAdmin === 1} />
        <main className="flex-1 p-6 min-h-[calc(100vh-3.5rem-2.5rem)] overflow-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      <VersionFooter />
    </div>
  );
}
