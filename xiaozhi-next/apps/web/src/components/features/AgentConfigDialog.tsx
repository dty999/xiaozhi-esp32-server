'use client';
/**
 * AgentConfigDialog — 智能体全功能配置弹框
 *
 * 六个 Tab：基本信息 | 模型配置 | 语音合成 | 插件工具 | 设备管理 | 声纹管理
 * 所有配置在弹框中完成，无需跳转独立页面。
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';
import { PluginConfigPanel } from '@/components/features/PluginConfigPanel';
import { AgentDevicesPanel } from '@/components/features/AgentDevicesPanel';
import { AgentVoicePrintsPanel } from '@/components/features/AgentVoicePrintsPanel';

interface ModelOption { id: string; modelCode: string; modelName: string }
interface Voice { id: string; name: string; languages: string | null }

export function AgentConfigDialog({ open, agentId, agentName, onClose, onSaved }: {
  open: boolean; agentId: string; agentName: string; onClose: () => void; onSaved: () => void;
}) {
  const { token } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (open && agentId) {
      setLoading(true);
      ofetch(`/api/agents/${agentId}`, { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setData(res.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, agentId]);

  const update = (field: string, value: any) => {
    if (data) setData({ ...data, [field]: value });
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await ofetch(`/api/agents/${data.id}`, { method: 'PUT', body: data, headers: authHeaders });
      if (res.code === 0) { alert('保存成功'); onSaved(); onClose(); }
      else alert(res.msg || '保存失败');
    } catch { alert('保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl h-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>配置智能体 — {agentName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2"><Loader2 className="animate-spin" />加载中...</div>
        ) : !data ? (
          <p className="text-muted-foreground text-center py-8">智能体不存在</p>
        ) : (
          <div className="flex-1 min-h-0">
            <Tabs defaultValue="basic" className="flex flex-col h-full">
              <TabsList className="mb-4 flex flex-wrap flex-shrink-0">
                <TabsTrigger value="basic">基本信息</TabsTrigger>
                <TabsTrigger value="models">模型配置</TabsTrigger>
                <TabsTrigger value="tts">语音合成</TabsTrigger>
                <TabsTrigger value="plugins">插件工具</TabsTrigger>
                <TabsTrigger value="devices">设备管理</TabsTrigger>
                <TabsTrigger value="voice-prints">声纹管理</TabsTrigger>
              </TabsList>
              <div className="flex-1 min-h-0 overflow-y-auto">

            <TabsContent value="basic">
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>智能体名称</Label>
                    <Input value={data.agentName || ''} onChange={e => update('agentName', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>编码</Label>
                    <Input value={data.agentCode || ''} disabled className="opacity-60" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>系统提示词</Label>
                  <Textarea value={data.systemPrompt || ''} onChange={e => update('systemPrompt', e.target.value)} rows={6} placeholder="你是一个有用的AI助手..." />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="models">
              <AgentModelSelector agent={data} onChange={setData} />
            </TabsContent>

            <TabsContent value="tts">
              <AgentTTSConfig agent={data} onChange={setData} />
            </TabsContent>

            <TabsContent value="plugins">
              <div className="max-w-xl mx-auto">
                <PluginConfigPanel agent={data} onChange={setData} />
              </div>
            </TabsContent>

            <TabsContent value="devices">
              <AgentDevicesPanel agentId={agentId} />
            </TabsContent>

            <TabsContent value="voice-prints">
              <AgentVoicePrintsPanel agentId={agentId} />
            </TabsContent>
          </div></Tabs>
          </div>
        )}

        {data && (
          <div className="flex justify-end gap-2 mt-3 py-2 border-t flex-shrink-0">
            <Button variant="outline" onClick={onClose}>关闭</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin mr-2" size={14} />}
              <Save size={14} className="mr-1" />{saving ? '保存中...' : '保存基本信息'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 模型选择器 */
function AgentModelSelector({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const { token } = useAuthStore();
  const [modelMap, setModelMap] = useState<Record<string, ModelOption[]>>({});

  useEffect(() => {
    ofetch('/api/models', { headers: { Authorization: `Bearer ${token}` } })
      .then((res: any) => {
        if (res.code === 0) {
          const map: Record<string, ModelOption[]> = {};
          (res.data.list || []).forEach((m: any) => {
            if (!map[m.modelType]) map[m.modelType] = [];
            map[m.modelType].push({ id: m.id.toString(), modelCode: m.modelCode, modelName: m.modelName });
          });
          setModelMap(map);
        }
      }).catch(() => {});
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

  const update = (key: string, value: string) => onChange({ ...agent, [key]: value === '_none' ? null : value });

  return (
    <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
      {MODEL_TYPES.map(({ key, label, modelType }) => {
        const options = modelMap[modelType] || [];
        return (
          <div key={key} className="space-y-1.5">
            <Label>{label}</Label>
            <Select value={agent[key] ? String(agent[key]) : '_none'} onValueChange={(v) => update(key, v)}>
              <SelectTrigger><SelectValue placeholder="未选择" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">未选择</SelectItem>
                {options.map(m => <SelectItem key={m.id} value={m.id}>{m.modelName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

/** TTS 配置 */
function AgentTTSConfig({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const { token } = useAuthStore();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [cloneVoices, setCloneVoices] = useState<any[]>([]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    // 获取普通音色
    ofetch('/api/timbre?page=1&limit=100', { headers })
      .then((res: any) => { if (res.code === 0) setVoices(res.data.list || []); })
      .catch(() => {});
    // 获取克隆音色（训练成功的）
    ofetch('/api/voice-clone?page=1&limit=100', { headers })
      .then((res: any) => {
        if (res.code === 0) {
          setCloneVoices((res.data.list || []).filter((v: any) => v.trainStatus === 2));
        }
      })
      .catch(() => {});
  }, []);

  const update = (field: string, value: any) => onChange({ ...agent, [field]: value });

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="space-y-1.5">
        <Label>音色</Label>
        <Select value={agent.ttsVoiceId ? String(agent.ttsVoiceId) : '_none'} onValueChange={(v) => update('ttsVoiceId', v === '_none' ? null : v)}>
          <SelectTrigger><SelectValue placeholder="选择音色" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">未选择</SelectItem>
            {voices.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            {cloneVoices.length > 0 && (
              <>
                <SelectItem value="_clone_separator" disabled>── 复刻音色 ──</SelectItem>
                {cloneVoices.map((v: any) => (
                  <SelectItem key={`clone_${v.id}`} value={v.id}>复刻·{v.name}</SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>
      {[
        { field: 'ttsVolume', label: '音量', default: 50 },
        { field: 'ttsRate', label: '语速', default: 50 },
        { field: 'ttsPitch', label: '音调', default: 50 },
      ].map(({ field, label, default: def }) => (
        <div key={field} className="space-y-2">
          <div className="flex justify-between"><Label>{label}</Label><span className="text-sm text-muted-foreground">{agent[field] ?? def}</span></div>
          <Slider value={[agent[field] ?? def]} min={0} max={100} onValueChange={([v]) => update(field, v)} />
        </div>
      ))}
    </div>
  );
}
