'use client';
/**
 * 角色配置页 — 智能体详情编辑
 *
 * 对标原 Vue 2 /role-config 页面。
 * 四个 Tab：基本信息 | 模型配置 | 语音合成 | 插件工具
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
        <Loader2 className="animate-spin" size={24} />
        <span className="text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (!agent) {
    return <div className="text-center py-16 text-muted-foreground">智能体不存在</div>;
  }

  return (
    <div className="max-w-5xl">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-1" />返回
          </Button>
          <h1 className="text-xl font-bold">{agent.agentName}</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin mr-2" size={14} />}
          <Save size={14} className="mr-1" />保存
        </Button>
      </div>

      {/* 子页面快捷入口 */}
      <div className="flex gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => router.push(`/agents/${params.id}/devices`)}>
          设备管理
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push(`/agents/${params.id}/voice-prints`)}>
          声纹管理
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="mb-6">
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
