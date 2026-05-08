'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Cpu, Settings, Users, Database,
  BookOpen, Mic, Music, Package, Server, FileText,
  Zap, Wrench, UserCog, ChevronLeft, ChevronRight, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// ───── 菜单定义 ─────
const menuItems = [
  { href: '/home', label: '首页', icon: LayoutDashboard },
  { href: '/devices', label: '设备管理', icon: Cpu, admin: true },
  { href: '/models', label: '模型配置', icon: Settings, admin: true },
  { href: '/timbre', label: '音色管理', icon: Music, admin: true },
  { href: '/providers', label: '供应器管理', icon: Package, admin: true },
  { href: '/templates', label: '模板管理', icon: FileText, admin: true },
  { href: '/dicts', label: '字典管理', icon: Database, admin: true },
  { href: '/knowledge', label: '知识库', icon: BookOpen },
  { href: '/voice-clone', label: '声音克隆', icon: Mic },
  { href: '/voice-resource', label: '音色资源', icon: Music, admin: true },
  { href: '/ota', label: 'OTA 管理', icon: Zap, admin: true },
  { href: '/replacement', label: '替换词', icon: FileText },
  { href: '/users', label: '用户管理', icon: Users, admin: true },
  { href: '/params', label: '参数管理', icon: Wrench, admin: true },
  { href: '/server', label: '服务端管理', icon: Server, admin: true },
  { href: '/features', label: '功能配置', icon: Globe, admin: true },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const visibleItems = isAdmin ? menuItems : menuItems.filter(m => !m.admin);

  return (
    <aside
      className={cn(
        'relative border-r bg-card h-[calc(100vh-3.5rem)] transition-all duration-200 overflow-y-auto',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute right-2 top-2 p-1 rounded hover:bg-muted text-muted-foreground"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <nav className={cn('mt-10 space-y-1 px-2', collapsed && 'px-1')}>
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
