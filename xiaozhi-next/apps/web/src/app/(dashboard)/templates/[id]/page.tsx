'use client';
/**
 * 模板快速配置页
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function TemplateConfigPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try { const res = await ofetch(`/api/templates/${id}`, { headers: authHeaders }); if (res.code === 0) setTemplate(res.data); } catch { /* */ }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    try { await ofetch(`/api/templates/${id}`, { method: 'PUT', body: template, headers: authHeaders }); alert('保存成功'); } catch { alert('保存失败'); }
  };

  if (loading) return <div className="flex items-center gap-2 h-64"><Loader2 className="animate-spin" />加载中...</div>;
  if (!template) return <p>模板不存在</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} className="mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold">模板配置 — {template.agentName}</h1>
        <Button onClick={handleSave} className="ml-auto"><Save size={14} className="mr-1" />保存</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>模板名称</Label><Input value={template.agentName || ''} onChange={e => setTemplate({...template, agentName: e.target.value})} /></div>
          <div className="space-y-1"><Label>系统提示词</Label><Textarea value={template.systemPrompt || ''} onChange={e => setTemplate({...template, systemPrompt: e.target.value})} rows={6} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
