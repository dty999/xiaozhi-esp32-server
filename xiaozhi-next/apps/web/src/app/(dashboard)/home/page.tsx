'use client';
/**
 * 首页 — 智能体卡片网格
 *
 * 对标原 Vue 2 /home 页面 (DeviceList.vue)。
 * 展示当前用户所有智能体，支持搜索、新建、删除，附聊天记录弹窗。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Settings, MessageSquare, Cpu } from 'lucide-react';
import { ChatHistoryPanel } from '@/components/features/ChatHistoryPanel';
import { useAuthStore } from '@/hooks/useAuth';

interface Agent {
  id: string;
  agentName: string;
  agentCode: string;
  ttsVoiceId: string | null;
  devicesCount: number;
  devices: { id: string; macAddress: string; isBound: number }[];
  tags: { id: string; tagName: string }[];
  createDate: string | null;
}

export default function HomePage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchAgents = async () => {
    try {
      const res = await ofetch('/api/agents', { headers: authHeaders });
      if (res.code === 0) setAgents(res.data);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreate = async () => {
    try {
      const res = await ofetch('/api/agents', { method: 'POST', body: { agentName: '新智能体' }, headers: authHeaders });
      if (res.code === 0) router.push(`/agents/${res.data.agentId}`);
    } catch { /* 容错 */ }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除智能体 「${name}」吗？此操作不可撤销。`)) return;
    try {
      await ofetch(`/api/agents/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchAgents();
    } catch { /* 容错 */ }
  };

  const filtered = keyword
    ? agents.filter(a => a.agentName.includes(keyword) || a.agentCode?.includes(keyword))
    : agents;

  // ── 骨架屏 ──
  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-28" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu size={24} />
          我的智能体
          <Badge variant="secondary" className="ml-2">{agents.length}</Badge>
        </h1>
        <Button onClick={handleCreate}>
          <Plus size={16} className="mr-1" />
          新建智能体
        </Button>
      </div>

      {/* 搜索框 */}
      <Input
        placeholder="搜索名称或编号..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="mb-6 max-w-md"
      />

      {/* 卡片网格 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Cpu size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg">{keyword ? '没有匹配的智能体' : '暂无智能体'}</p>
          {!keyword && (
            <Button variant="outline" className="mt-4" onClick={handleCreate}>创建第一个智能体</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(agent => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate text-base">{agent.agentName}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{agent.agentCode}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 标签 */}
                {agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tags.map(tag => (
                      <Badge key={tag.id} variant="secondary" className="text-xs">{tag.tagName}</Badge>
                    ))}
                  </div>
                )}

                {/* 信息 */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>绑定设备</span>
                    <span className="font-medium text-foreground">{agent.devicesCount || 0}</span>
                  </div>
                  {agent.createDate && (
                    <div className="flex justify-between">
                      <span>创建时间</span>
                      <span>{new Date(agent.createDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1" onClick={() => router.push(`/agents/${agent.id}`)}>
                    <Settings size={14} className="mr-1" />配置
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="flex-1">
                        <MessageSquare size={14} className="mr-1" />聊天记录
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>聊天记录 — {agent.agentName}</DialogTitle>
                      </DialogHeader>
                      <ChatHistoryPanel agentId={agent.id} />
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(agent.id, agent.agentName)}>
                    <Trash2 size={14} />
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
