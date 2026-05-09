'use client';
/**
 * 模板管理页 — 列表 + 配置弹框
 *
 * 点击"配置"按钮弹出全功能配置弹框（模型选择 + TTS参数 + 系统提示词）
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Settings, Trash2, Loader2, Save } from 'lucide-react';
import { DataTablePage } from '@/components/features/DataTablePage';
import { useAuthStore } from '@/hooks/useAuth';

interface ModelOption { id: string; modelCode: string; modelName: string }
interface Voice { id: string; name: string; languages: string | null }

export default function TemplatesPage() {
  const [configOpen, setConfigOpen] = useState(false);
  const [configTemplate, setConfigTemplate] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <>
      <DataTablePage
        key={refreshKey}
        title="模板管理"
        apiBase="/api/templates"
        columns={[
          { key: 'agentName', label: '模板名称' },
          { key: 'agentCode', label: '编码' },
          { key: 'sort', label: '排序' },
        ]}
        formFields={[
          { key: 'agentName', label: '模板名称' },
          { key: 'agentCode', label: '编码' },
        ]}
        onCreated={(row) => {
          const id = row?.data?.id || row?.id;
          if (id) { setConfigTemplate({ id, agentName: row?.data?.agentName || row?.agentName || '' }); setConfigOpen(true); refresh(); }
        }}
        rowActions={(row, refetch) => (
          <>
            <Button size="sm" variant="secondary" onClick={() => { setConfigTemplate(row); setConfigOpen(true); }}>
              <Settings size={14} className="mr-1" />配置
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
              if (!confirm('确定删除？')) return;
              const { token } = useAuthStore.getState();
              try { await ofetch(`/api/templates/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); refetch(); } catch { /* */ }
            }}>
              <Trash2 size={14} />
            </Button>
          </>
        )}
      />

      {/* 模板配置弹框 */}
      <TemplateConfigDialog
        open={configOpen}
        template={configTemplate}
        onClose={() => { setConfigOpen(false); setConfigTemplate(null); }}
        onSaved={refresh}
      />
    </>
  );
}

/** 模板配置弹框 */
function TemplateConfigDialog({ open, template, onClose, onSaved }: {
  open: boolean; template: any; onClose: () => void; onSaved: () => void;
}) {
  const { token } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 加载模板详情
  useEffect(() => {
    if (open && template?.id) {
      setLoading(true);
      ofetch(`/api/templates/${template.id}`, { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setData(res.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, template?.id]);

  const update = (field: string, value: any) => {
    if (data) setData({ ...data, [field]: value });
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await ofetch(`/api/templates/${data.id}`, { method: 'PUT', body: data, headers: authHeaders });
      if (res.code === 0) { alert('保存成功'); onSaved(); onClose(); }
      else alert(res.msg || '保存失败');
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template?.agentName ? `配置模板 — ${template.agentName}` : '配置模板'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2">
            <Loader2 className="animate-spin" />加载中...
          </div>
        ) : !data ? (
          <p className="text-muted-foreground text-center py-8">模板不存在</p>
        ) : (
          <Tabs defaultValue="basic">
            <TabsList className="mb-4">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="models">模型配置</TabsTrigger>
              <TabsTrigger value="tts">语音合成</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>模板名称</Label>
                  <Input value={data.agentName || ''} onChange={e => update('agentName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>系统提示词</Label>
                  <Textarea value={data.systemPrompt || ''} onChange={e => update('systemPrompt', e.target.value)} rows={6} placeholder="你是一个有用的AI助手..." />
                </div>
                <div className="space-y-1">
                  <Label>函数列表（逗号分隔）</Label>
                  <Input value={data.functions || ''} onChange={e => update('functions', e.target.value)} placeholder="get_weather,get_news,get_time" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="models">
              <TemplateModelSelector template={data} onChange={setData} />
            </TabsContent>

            <TabsContent value="tts">
              <TemplateTTSConfig template={data} onChange={setData} />
            </TabsContent>
          </Tabs>
        )}

        {data && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin mr-2" size={14} />}
              <Save size={14} className="mr-1" />{saving ? '保存中...' : '保存'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 模板模型选择器（复用 ModelSelector 的逻辑但嵌在弹框内） */
function TemplateModelSelector({ template, onChange }: { template: any; onChange: (t: any) => void }) {
  const { token } = useAuthStore();
  const [modelMap, setModelMap] = useState<Record<string, ModelOption[]>>({});

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    ofetch('/api/models', { headers: authHeaders })
      .then((res: any) => {
        if (res.code === 0) {
          const map: Record<string, ModelOption[]> = {};
          (res.data.list || []).forEach((m: any) => {
            if (!map[m.modelType]) map[m.modelType] = [];
            map[m.modelType].push({ id: m.id.toString(), modelCode: m.modelCode, modelName: m.modelName });
          });
          setModelMap(map);
        }
      })
      .catch(() => {});
  }, []);

  const MODEL_TYPES = [
    { key: 'asrModelId', label: 'ASR 语音识别', modelType: 'ASR' },
    { key: 'vadModelId', label: 'VAD 语音检测', modelType: 'VAD' },
    { key: 'llmModelId', label: 'LLM 大模型', modelType: 'LLM' },
    { key: 'ttsModelId', label: 'TTS 语音合成', modelType: 'TTS' },
    { key: 'memModelId', label: 'Memory 记忆', modelType: 'Memory' },
    { key: 'intentModelId', label: 'Intent 意图识别', modelType: 'Intent' },
    { key: 'vllmModelId', label: 'VLLM 视觉模型', modelType: 'VLLM' },
    { key: 'slmModelId', label: 'SLM 小模型', modelType: 'SLM' },
  ];

  const update = (key: string, value: string) => {
    onChange({ ...template, [key]: value === '_none' ? null : value });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {MODEL_TYPES.map(({ key, label, modelType }) => {
        const options = modelMap[modelType] || [];
        return (
          <div key={key} className="space-y-1.5">
            <Label>{label}</Label>
            <Select
              value={template[key] ? String(template[key]) : '_none'}
              onValueChange={(v) => update(key, v)}
            >
              <SelectTrigger><SelectValue placeholder="未选择" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">未选择</SelectItem>
                {options.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.modelName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

/** 模板 TTS 配置 */
function TemplateTTSConfig({ template, onChange }: { template: any; onChange: (t: any) => void }) {
  const { token } = useAuthStore();
  const [voices, setVoices] = useState<Voice[]>([]);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    ofetch('/api/timbre?page=1&limit=100', { headers: authHeaders })
      .then((res: any) => { if (res.code === 0) setVoices(res.data.list || []); })
      .catch(() => {});
  }, []);

  const update = (field: string, value: any) => onChange({ ...template, [field]: value });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>音色</Label>
        <Select
          value={template.ttsVoiceId ? String(template.ttsVoiceId) : '_none'}
          onValueChange={(v) => update('ttsVoiceId', v === '_none' ? null : v)}
        >
          <SelectTrigger><SelectValue placeholder="选择音色" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">未选择</SelectItem>
            {voices.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {[
          { field: 'ttsVolume', label: '音量', default: 50 },
          { field: 'ttsRate', label: '语速', default: 50 },
          { field: 'ttsPitch', label: '音调', default: 50 },
        ].map(({ field, label, default: def }) => (
          <div key={field} className="space-y-2">
            <div className="flex justify-between">
              <Label>{label}</Label>
              <span className="text-sm text-muted-foreground">{template[field] ?? def}</span>
            </div>
            <Slider value={[template[field] ?? def]} min={0} max={100} onValueChange={([v]) => update(field, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}
