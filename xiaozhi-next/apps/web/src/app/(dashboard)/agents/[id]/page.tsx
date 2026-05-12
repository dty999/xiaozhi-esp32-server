'use client';
/**
 * 角色配置页 — 智能体详情编辑
 *
 * 对标原 Vue 2 /role-config 页面。
 * 六个 Tab：基本信息 | 模型配置 | 语音合成 | 插件工具 | 设备管理 | 声纹管理
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { AgentBasicInfo } from '@/components/features/AgentBasicInfo';
import { ModelSelector } from '@/components/features/ModelSelector';
import { TTSConfigPanel } from '@/components/features/TTSConfigPanel';
import { PluginConfigPanel } from '@/components/features/PluginConfigPanel';
import { AgentDevicesPanel } from '@/components/features/AgentDevicesPanel';
import { AgentVoicePrintsPanel } from '@/components/features/AgentVoicePrintsPanel';
import { useAuthStore } from '@/hooks/useAuth';

export default function AgentConfigPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch(`/api/agents/${params.id}`, { headers: authHeaders });
        if (res.code === 0) setAgent(res.data);
      } catch { /* 容错 */ }
      setLoading(false);
    })();
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await ofetch(`/api/agents/${params.id}`, { method: 'PUT', body: agent, headers: authHeaders });
      if (res.code === 0) alert('保存成功');
      else alert(res.msg || '保存失败');
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="animate-spin" size={22} />
        <span className="text-muted-foreground text-sm">加载中...</span>
      </div>
    );
  }

  if (!agent) {
    return <div className="text-center py-16 text-muted-foreground">智能体不存在</div>;
  }

  return (
    <div className="max-w-5xl">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => router.back()}>
            <ArrowLeft size={16} strokeWidth={1.8} className="mr-1" />返回
          </Button>
          <h1 className="text-lg font-semibold">{agent.agentName}</h1>
        </div>
        <Button onClick={handleSave} disabled={saving} className="h-8">
          {saving && <Loader2 className="animate-spin mr-2" size={14} />}
          <Save size={14} strokeWidth={1.8} className="mr-1" />保存
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="mb-5">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="models">模型配置</TabsTrigger>
          <TabsTrigger value="tts">语音合成</TabsTrigger>
          <TabsTrigger value="plugins">插件工具</TabsTrigger>
          <TabsTrigger value="devices">设备管理</TabsTrigger>
          <TabsTrigger value="voice-prints">声纹管理</TabsTrigger>
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
        <TabsContent value="devices">
          <AgentDevicesPanel agentId={params.id} />
        </TabsContent>
        <TabsContent value="voice-prints">
          <AgentVoicePrintsPanel agentId={params.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
