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
    <header className="sticky top-0 z-40 h-14 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <h1
          className="text-lg font-bold cursor-pointer text-primary"
          onClick={() => router.push('/home')}
        >
          小智智控台
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground hidden sm:flex items-center gap-1">
          <User size={14} />
          <span>{user?.realName || user?.username || '用户'}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-muted-foreground"
        >
          <LogOut size={14} className="mr-1" />
          退出
        </Button>
      </div>
    </header>
  );
}
