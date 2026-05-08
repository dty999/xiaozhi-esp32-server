'use client';
/**
 * TTSConfigPanel — TTS 语音合成配置（音色选择 + 音量/语速/音调滑块）
 */

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { useAuthStore } from '@/hooks/useAuth';

interface Voice { id: string; name: string; languages: string | null }

export function TTSConfigPanel({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const { token } = useAuthStore();
  const [voices, setVoices] = useState<Voice[]>([]);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch('/api/timbre?page=1&limit=100', { headers: authHeaders });
        if (res.code === 0) setVoices(res.data.list || []);
      } catch { /* 容错 */ }
    })();
  }, []);

  const update = (field: string, value: any) => onChange({ ...agent, [field]: value });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">语音合成配置</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* 音色选择 */}
        <div className="space-y-1.5">
          <Label>音色</Label>
          <Select
            value={agent.ttsVoiceId ? String(agent.ttsVoiceId) : '_none'}
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

        {/* 高级参数 */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between"><Label>音量</Label><span className="text-sm text-muted-foreground">{agent.ttsVolume ?? 50}</span></div>
            <Slider value={[agent.ttsVolume ?? 50]} min={0} max={100} onValueChange={([v]) => update('ttsVolume', v)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>语速</Label><span className="text-sm text-muted-foreground">{agent.ttsRate ?? 50}</span></div>
            <Slider value={[agent.ttsRate ?? 50]} min={0} max={100} onValueChange={([v]) => update('ttsRate', v)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>音调</Label><span className="text-sm text-muted-foreground">{agent.ttsPitch ?? 50}</span></div>
            <Slider value={[agent.ttsPitch ?? 50]} min={0} max={100} onValueChange={([v]) => update('ttsPitch', v)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
