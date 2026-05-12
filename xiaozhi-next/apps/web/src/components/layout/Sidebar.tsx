'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import {
  LayoutDashboard, Cpu, Settings, Users, Database,
  BookOpen, Mic, Music, Package, Server, FileText,
  Zap, Wrench, UserCog, ChevronLeft, ChevronRight, Globe,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/hooks/useAuth';

// ───── 菜单定义 ─────
interface MenuItem {
  href: string;
  label: string;
  icon: any;
  admin?: boolean;
  /** 对应 systemWebMenu.features 中的 key，不写则始终显示 */
  feature?: string;
}

const menuItems: MenuItem[] = [
  { href: '/home', label: '首页', icon: LayoutDashboard },
  { href: '/devices', label: '设备管理', icon: Cpu, admin: true },
  { href: '/models', label: '模型配置', icon: Settings, admin: true },
  { href: '/timbre', label: '音色管理', icon: Music, admin: true },
  { href: '/providers', label: '供应器管理', icon: Package, admin: true },
  { href: '/templates', label: '模板管理', icon: FileText, admin: true },
  { href: '/dicts', label: '字典管理', icon: Database, admin: true },
  { href: '/knowledge', label: '知识库', icon: BookOpen, feature: 'knowledgeBase' },
  { href: '/voice-clone', label: '声音克隆', icon: Mic, feature: 'voiceClone' },
  { href: '/voice-prints', label: '声纹管理', icon: User, feature: 'voiceprintRecognition' },
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
  const [featureMap, setFeatureMap] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();
  const { token } = useAuthStore();

  // 加载功能配置
  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch('/api/auth/pub-config', { headers: { Authorization: `Bearer ${token}` } });
        if (res.code === 0) {
          const features = res.data?.systemWebMenu?.features || {};
          const map: Record<string, boolean> = {};
          for (const [key, val] of Object.entries(features) as [string, any][]) {
            map[key] = val?.enabled === true;
          }
          setFeatureMap(map);
        }
      } catch { /* 网络失败时 featureMap 保持空，下面会全部显示 */ }
    })();
  }, [token]);

  // 管理员无视功能配置，全部显示
  // 普通用户受 feature 开关控制 + 隐藏 admin 菜单
  // featureMap 为空（API 失败）时全部显示，避免误隐藏
  const featuresLoaded = Object.keys(featureMap).length > 0;
  const visibleItems = menuItems.filter(m => {
    if (isAdmin) return true;
    if (m.admin) return false;
    if (m.feature && featuresLoaded && !featureMap[m.feature]) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        'relative border-r bg-card h-[calc(100vh-3.5rem-2.5rem)] transition-all duration-200 ease-in-out overflow-y-auto shrink-0',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute right-2 top-3 p-1 rounded-md hover:bg-accent text-muted-foreground transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <nav className={cn('mt-12 space-y-0.5 px-2', collapsed && 'px-1.5')}>
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150',
                active
                  ? 'bg-primary/[0.08] text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={17} strokeWidth={1.8} />
              {!collapsed && <span className="leading-none">{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
