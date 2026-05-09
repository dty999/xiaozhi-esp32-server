'use client';
/**
 * 模板详情配置页
 *
 * 对标原 Java AgentTemplate 配置。
 * 三个 Tab：基本信息 | 模型配置 | 语音合成
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { ModelSelector } from '@/components/features/ModelSelector';
import { TTSConfigPanel } from '@/components/features/TTSConfigPanel';
import { useAuthStore } from '@/hooks/useAuth';

export default function TemplateConfigPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch(`/api/templates/${id}`, { headers: authHeaders });
        if (res.code === 0) setTemplate(res.data);
      } catch { /* 容错 */ }
      setLoading(false);
    })();
  }, [id]);

  const update = (field: string, value: any) => setTemplate({ ...template, [field]: value });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await ofetch(`/api/templates/${id}`, { method: 'PUT', body: template, headers: authHeaders });
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

  if (!template) {
    return <div className="text-center py-16 text-muted-foreground">模板不存在</div>;
  }

  return (
    <div className="max-w-5xl">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-1" />返回
          </Button>
          <h1 className="text-xl font-bold">{template.agentName}</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin mr-2" size={14} />}
          <Save size={14} className="mr-1" />{saving ? '保存中...' : '保存'}
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="mb-6">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="models">模型配置</TabsTrigger>
          <TabsTrigger value="tts">语音合成</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <h3 className="text-base font-semibold">基本信息</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>模板名称</Label>
                  <Input value={template.agentName || ''} onChange={e => update('agentName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>模板编码</Label>
                  <Input value={template.agentCode || ''} disabled className="opacity-60" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>系统提示词</Label>
                <Textarea value={template.systemPrompt || ''} onChange={e => update('systemPrompt', e.target.value)} rows={6} placeholder="你是一个有用的AI助手..." />
              </div>
              <div className="space-y-1">
                <Label>函数列表（逗号分隔）</Label>
                <Input value={template.functions || ''} onChange={e => update('functions', e.target.value)} placeholder="get_weather,get_news,get_time" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="models">
          <ModelSelector agent={template} onChange={setTemplate} />
        </TabsContent>

        <TabsContent value="tts">
          <TTSConfigPanel agent={template} onChange={setTemplate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
