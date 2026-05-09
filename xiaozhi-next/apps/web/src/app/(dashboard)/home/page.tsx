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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Settings, MessageSquare, Cpu, Loader2 } from 'lucide-react';
import { ChatHistoryPanel } from '@/components/features/ChatHistoryPanel';
import { AgentConfigDialog } from '@/components/features/AgentConfigDialog';
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configAgent, setConfigAgent] = useState<{ id: string; name: string } | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchAgents = async () => {
    try {
      const res = await ofetch('/api/agents', { headers: authHeaders });
      if (res.code === 0) setAgents(res.data);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreate = async (name: string, templateId?: string) => {
    try {
      const body: any = { agentName: name || '新智能体' };
      if (templateId) body.templateId = templateId;
      const res = await ofetch('/api/agents', { method: 'POST', body, headers: authHeaders });
      if (res.code === 0) { setDialogOpen(false); fetchAgents(); }
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-1" />新建智能体</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>新建智能体</DialogTitle></DialogHeader>
            <CreateAgentForm
              onCreate={handleCreate}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
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
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>创建第一个智能体</Button>
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
                  <Button size="sm" className="flex-1" onClick={() => setConfigAgent({ id: agent.id, name: agent.agentName })}>
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

      <AgentConfigDialog
        open={!!configAgent}
        agentId={configAgent?.id || ''}
        agentName={configAgent?.name || ''}
        onClose={() => setConfigAgent(null)}
        onSaved={() => { setConfigAgent(null); fetchAgents(); }}
      />
    </div>
  );
}

/** 新建智能体表单 — 支持选择模板 */
function CreateAgentForm({ onCreate, onCancel }: { onCreate: (name: string, templateId?: string) => Promise<void>; onCancel: () => void }) {
  const { token } = useAuthStore();
  const [name, setName] = useState('新智能体');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    ofetch('/api/templates', { headers: { Authorization: `Bearer ${token}` } })
      .then((res: any) => { if (res.code === 0) setTemplates(Array.isArray(res.data) ? res.data : res.data?.list || []); })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setCreating(true);
    const tid = !templateId || templateId === '_none' ? undefined : templateId;
    await onCreate(name, tid);
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>智能体名称</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="输入名称" />
      </div>
      <div className="space-y-1">
        <Label>选择模板（可选）</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger><SelectValue placeholder="不使用模板，创建空白智能体" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">不使用模板</SelectItem>
            {templates.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.agentName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">选择模板后，智能体将自动配置模板中的模型和参数</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">取消</Button>
        <Button onClick={handleSubmit} disabled={creating || !name.trim()} className="flex-1">
          {creating && <Loader2 className="animate-spin mr-2" size={14} />}
          创建
        </Button>
      </div>
    </div>
  );
}
