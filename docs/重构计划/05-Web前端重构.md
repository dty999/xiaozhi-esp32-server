# 第五阶段：Web 前端重构

> **目标**：以 Next.js App Router + React 19 + shadcn/ui + Tailwind CSS 替代原 Vue 2 + Element UI 前端。
> **验证标准**：22 个页面全部可访问，所有增删改查流程正常，6 种语言切换正常，响应式布局适配。

---

## 5.1 技术选型

| 原方案 | 新方案 | 说明 |
|:---|:---|:---|
| Vue 2.6 Options API | React 19 + Hooks | 重写为函数组件 |
| Vue CLI 5 | Next.js App Router | 文件系统路由 |
| Element UI 2.15 | shadcn/ui | 无包导入，直接复制源码定制 |
| Vuex 3 | Zustand + Context | 轻量状态管理 |
| vue-i18n 8 | next-intl 4 | SSR 安全 |
| vue-router 3 | App Router 文件路由 | 基于文件夹结构 |
| Flyio HTTP | ofetch | 原生 fetch 封装 |
| sm-crypto | sm-crypto (同构) | 客户端加密逻辑 |
| opus-decoder | Web Audio API | 音频播放 |
| SCSS | Tailwind CSS 4 | 原子化 CSS |

---

## 5.2 路由映射表

### 公开页面（`(auth)` 路由组）

| 原路径 | 新路径 | 文件 |
|:---|:---|:---|
| `/login` | `/login` | `src/app/(auth)/login/page.tsx` |
| `/register` | `/register` | `src/app/(auth)/register/page.tsx` |
| `/retrieve-password` | `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` |

### 认证页面（`(dashboard)` 路由组，需登录）

| 原路径 | 新路径 | 文件 |
|:---|:---|:---|
| `/home` | `/home` | `src/app/(dashboard)/home/page.tsx` |
| `/role-config?agentId=` | `/agents/[id]` | `src/app/(dashboard)/agents/[id]/page.tsx` |
| `/voice-print?agentId=` | `/agents/[id]/voice-prints` | `src/app/(dashboard)/agents/[id]/voice-prints/page.tsx` |
| `/device-management?agentId=` | `/agents/[id]/devices` | `src/app/(dashboard)/agents/[id]/devices/page.tsx` |
| `/model-config` | `/models` | `src/app/(dashboard)/models/page.tsx` |
| `/provider-management` | `/providers` | `src/app/(dashboard)/providers/page.tsx` |
| `/knowledge-base-management` | `/knowledge` | `src/app/(dashboard)/knowledge/page.tsx` |
| `/knowledge-file-upload?knowledgeBaseId=` | `/knowledge/[id]/documents` | `src/app/(dashboard)/knowledge/[id]/documents/page.tsx` |
| `/voice-clone-management` | `/voice-clone` | `src/app/(dashboard)/voice-clone/page.tsx` |
| `/voice-resource-management` | `/voice-resource` | `src/app/(dashboard)/voice-resource/page.tsx` |
| `/ota-management` | `/ota` | `src/app/(dashboard)/ota/page.tsx` |
| `/user-management` | `/users` | `src/app/(dashboard)/users/page.tsx` |
| `/params-management` | `/params` | `src/app/(dashboard)/params/page.tsx` |
| `/dict-management` | `/dicts` | `src/app/(dashboard)/dicts/page.tsx` |
| `/server-side-management` | `/server` | `src/app/(dashboard)/server/page.tsx` |
| `/agent-template-management` | `/templates` | `src/app/(dashboard)/templates/page.tsx` |
| `/template-quick-config?id=` | `/templates/[id]` | `src/app/(dashboard)/templates/[id]/page.tsx` |
| `/feature-management` | `/features` | `src/app/(dashboard)/features/page.tsx` |
| `/replacement-word-management` | `/replacement` | `src/app/(dashboard)/replacement/page.tsx` |

---

## 5.3 布局实现

### 文件：`src/app/(auth)/layout.tsx`

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-8">
        {children}
      </div>
    </div>
  );
}
```

### 文件：`src/app/(dashboard)/layout.tsx`

```typescript
'use client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { VersionFooter } from '@/components/layout/VersionFooter';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <DashboardHeader />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
      <VersionFooter />
    </div>
  );
}
```

### 文件：`src/hooks/useAuth.ts`

```typescript
'use client';
import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  realName: string;
  superAdmin: number;
  headUrl?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
  loading: true,
  setToken: (token) => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    set({ token });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },
  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        set({ user: data.data, loading: false });
      } else {
        localStorage.removeItem('token');
        set({ token: null, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },
}));

export const useAuth = () => {
  return useAuthStore();
};
```

---

## 5.4 关键页面实现

### 5.4.1 登录页

**文件**：`src/app/(auth)/login/page.tsx`

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sm2 } from 'sm-crypto';
import { useTranslations } from 'next-intl';
import { ofetch } from 'ofetch';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  
  // 登录模式：username 或 phone
  const [mode, setMode] = useState<'username' | 'phone'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 获取验证码
  const fetchCaptcha = async () => {
    const res = await fetch('/api/auth/captcha');
    const svg = await res.text();
    const uuid = res.headers.get('X-Captcha-Uuid') || '';
    setCaptchaSvg(svg);
    setCaptchaId(uuid);
  };

  // 初始加载验证码
  useState(() => { fetchCaptcha(); });

  // 登录
  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      // 获取 SM2 公钥
      const pubConfig = await ofetch('/api/auth/pub-config');
      const publicKey = pubConfig.data.sm2PublicKey;

      if (!publicKey) {
        setError('系统配置错误：缺少SM2公钥');
        setLoading(false);
        return;
      }

      // SM2 加密：captcha:password
      const captchaPassword = `${captcha}:${password}`;
      const encrypted = sm2.doEncrypt(captchaPassword, publicKey, 1);

      const res = await ofetch('/api/auth/login', {
        method: 'POST',
        body: { username, password: encrypted, captchaId },
      });

      if (res.code === 0) {
        setToken(res.data.token);
        setUser(res.data.userInfo);
        router.push('/home');
      } else {
        setError(res.msg);
        fetchCaptcha();
      }
    } catch (e: any) {
      setError(e.message || '登录失败');
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl text-center">{t('login')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 登录模式切换 */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'username' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('username')}
          >
            用户名登录
          </Button>
          <Button
            variant={mode === 'phone' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('phone')}
          >
            手机号登录
          </Button>
        </div>

        {/* 用户名/手机号 */}
        <Input
          placeholder={mode === 'username' ? t('username') : t('phone')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        {/* 密码 */}
        <Input
          type="password"
          placeholder={t('password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        {/* 验证码 */}
        <div className="flex gap-2">
          <Input
            placeholder={t('captcha')}
            value={captcha}
            onChange={(e) => setCaptcha(e.target.value)}
          />
          <div
            className="w-32 h-10 cursor-pointer border rounded"
            dangerouslySetInnerHTML={{ __html: captchaSvg }}
            onClick={fetchCaptcha}
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <Button
          className="w-full"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? '登录中...' : t('login')}
        </Button>

        <div className="flex justify-between text-sm">
          <a href="/register" className="text-blue-600 hover:underline">
            {t('register')}
          </a>
          <a href="/forgot-password" className="text-blue-600 hover:underline">
            {t('forgotPassword')}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 5.4.2 首页（智能体列表）

**文件**：`src/app/(dashboard)/home/page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChatHistoryPanel } from '@/components/features/ChatHistoryPanel';

interface Agent {
  id: string;
  agentName: string;
  agentCode: string;
  ttsVoiceId: string;
  deviceCount?: number;
  lastConnectedAt?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [chatOpen, setChatOpen] = useState<string | null>(null);

  const fetchAgents = async () => {
    const res = await ofetch('/api/agents');
    if (res.code === 0) setAgents(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreate = async () => {
    const res = await ofetch('/api/agents', {
      method: 'POST',
      body: { agentName: '新智能体' },
    });
    if (res.code === 0) {
      router.push(`/agents/${res.data.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此智能体？')) return;
    await ofetch(`/api/agents/${id}`, { method: 'DELETE' });
    fetchAgents();
  };

  const filtered = keyword
    ? agents.filter(a => a.agentName.includes(keyword) || a.agentCode.includes(keyword))
    : agents;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">智能体</h1>
        <Button onClick={handleCreate}>+ 新建智能体</Button>
      </div>

      <Input
        placeholder="搜索名称或编号..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="mb-6 max-w-md"
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(agent => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span className="truncate">{agent.agentName}</span>
                  <Badge variant="secondary">{agent.agentCode}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <p className="text-sm text-gray-500">
                    设备数: {agent.deviceCount || 0}
                  </p>
                  {agent.lastConnectedAt && (
                    <p className="text-sm text-gray-500">
                      最近连接: {new Date(agent.lastConnectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => router.push(`/agents/${agent.id}`)}
                  >
                    配置
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">聊天记录</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle>聊天记录 - {agent.agentName}</DialogTitle>
                      </DialogHeader>
                      <ChatHistoryPanel agentId={agent.id} />
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(agent.id)}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 5.4.3 角色配置页

**文件**：`src/app/(dashboard)/agents/[id]/page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { AgentBasicInfo } from '@/components/features/AgentBasicInfo';
import { ModelSelector } from '@/components/features/ModelSelector';
import { TTSConfigPanel } from '@/components/features/TTSConfigPanel';
import { PluginConfigPanel } from '@/components/features/PluginConfigPanel';

export default function AgentConfigPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await ofetch(`/api/agents/${id}`);
      if (res.code === 0) setAgent(res.data);
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await ofetch(`/api/agents/${id}`, {
      method: 'PUT',
      body: agent,
    });
    setSaving(false);
    if (res.code === 0) {
      alert('保存成功');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">角色配置</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>返回</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin mr-2" /> : null}
            保存
          </Button>
        </div>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="mb-4">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="models">模型配置</TabsTrigger>
          <TabsTrigger value="tts">语音合成</TabsTrigger>
          <TabsTrigger value="plugins">插件工具</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <AgentBasicInfo agent={agent} onChange={setAgent} />
        </TabsContent>

        <TabsContent value="models">
          <ModelSelector agent={agent} onChange={setAgent} />
        </TabsContent>

        <TabsContent value="tts">
          <TTSConfigPanel agent={agent} onChange={setAgent} />
        </TabsContent>

        <TabsContent value="plugins">
          <PluginConfigPanel agent={agent} onChange={setAgent} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 5.5 组件清单与实现优先级

### 优先级 1（核心布局）
| 组件 | 文件 | 说明 |
|:---|:---|:---|
| `DashboardHeader` | `components/layout/DashboardHeader.tsx` | 顶部导航（搜索、用户菜单、语言切换） |
| `Sidebar` | `components/layout/Sidebar.tsx` | 侧边栏（22 菜单项） |
| `VersionFooter` | `components/layout/VersionFooter.tsx` | 页脚（版本号+备案号） |

### 优先级 2（业务组件）
| 组件 | 说明 |
|:---|:---|
| `AgentCard` | 智能体卡片（首页） |
| `ModelSelector` | 8 类模型下拉选择器 |
| `TTSConfigPanel` | TTS 音色+高级参数 |
| `PluginConfigPanel` | 功能插件勾选 |
| `ChatHistoryPanel` | 聊天记录查看（会话列表+消息+音频播放） |
| `AudioPlayer` | 音频播放器（Web Audio API + Canvas 波形） |

### 优先级 3（管理页面）
| 组件 | 说明 |
|:---|:---|
| `DataTable` | 通用数据表格（分页/搜索/排序/全选） |
| `ModelEditDialog` | 模型配置编辑弹窗 |
| `KnowledgeBaseDialog` | 知识库编辑弹窗 |
| `OtaDialog` | OTA 固件上传编辑弹窗 |
| 其余弹窗 | 参数/字典/替换词/声纹/模板 |

---

## 5.6 P5 验证清单

- [ ] `pnpm dev` 前端启动成功
- [ ] 登录页可正常登录（SM2 加密流程）
- [ ] 首页智能体卡片列表显示
- [ ] 角色配置页 4 个 Tab 正常工作
- [ ] 模型配置页左侧菜单切换
- [ ] 设备管理页绑定/解绑
- [ ] 知识库管理 CRUD
- [ ] OTA 固件上传/下载
- [ ] 6 种语言切换正常
- [ ] 响应式布局（桌面/平板/手机）
- [ ] PWA 离线缓存
