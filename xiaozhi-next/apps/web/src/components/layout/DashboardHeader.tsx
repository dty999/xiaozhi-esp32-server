'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';

export function DashboardHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-card/85 backdrop-blur-xl flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-xs font-bold">XZ</span>
        </div>
        <h1
          className="text-[15px] font-semibold cursor-pointer tracking-tight"
          onClick={() => router.push('/home')}
        >
          控制台
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground hidden sm:flex items-center gap-1.5">
          <User size={14} strokeWidth={1.8} />
          <span className="max-w-[120px] truncate">{user?.realName || user?.username || '用户'}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-foreground h-8 px-2.5"
        >
          <LogOut size={14} strokeWidth={1.8} className="mr-1.5" />
          退出
        </Button>
      </div>
    </header>
  );
}
