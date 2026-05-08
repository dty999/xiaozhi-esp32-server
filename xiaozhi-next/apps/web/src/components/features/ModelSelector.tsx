'use client';
/**
 * ModelSelector — 8 类模型选择器（ASR / VAD / LLM / TTS / Memory / Intent / VLLM / SLM）
 */

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { useAuthStore } from '@/hooks/useAuth';

const MODEL_TYPES = [
  { key: 'llmModelId', label: 'LLM 大模型', field: 'asrModelId' },
  { key: 'asrModelId', label: 'ASR 语音识别' },
  { key: 'vadModelId', label: 'VAD 语音检测' },
  { key: 'ttsModelId', label: 'TTS 语音合成' },
  { key: 'memModelId', label: 'Memory 记忆模型' },
  { key: 'intentModelId', label: 'Intent 意图识别' },
  { key: 'vllmModelId', label: 'VLLM 视觉模型' },
  { key: 'slmModelId', label: 'SLM 小语言模型' },
];

interface ModelOption { id: string; modelCode: string; modelName: string }

export function ModelSelector({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const { token } = useAuthStore();
  const [modelMap, setModelMap] = useState<Record<string, ModelOption[]>>({});

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch('/api/models', { headers: authHeaders });
        if (res.code === 0) {
          const map: Record<string, ModelOption[]> = {};
          (res.data.list || []).forEach((m: any) => {
            if (!map[m.modelType]) map[m.modelType] = [];
            map[m.modelType].push({ id: m.id.toString(), modelCode: m.modelCode, modelName: m.modelName });
          });
          setModelMap(map);
        }
      } catch { /* 容错 */ }
    })();
  }, []);

  const update = (key: string, value: string) => {
    onChange({ ...agent, [key]: value === '_none' ? null : value });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">模型配置</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODEL_TYPES.map(({ key, label }) => {
            const typeKey = key === 'llmModelId' ? 'LLM' : key === 'asrModelId' ? 'ASR'
              : key === 'vadModelId' ? 'VAD' : key === 'ttsModelId' ? 'TTS'
              : key === 'memModelId' ? 'Memory' : key === 'intentModelId' ? 'Intent'
              : key === 'vllmModelId' ? 'VLLM' : 'SLM';
            const options = modelMap[typeKey] || [];
            const current = agent[key];

            return (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select
                  value={current ? String(current) : '_none'}
                  onValueChange={(v) => update(key, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="未选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">未选择</SelectItem>
                    {options.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
