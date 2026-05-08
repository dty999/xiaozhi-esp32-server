'use client';
/**
 * AgentBasicInfo — 智能体基本信息编辑（名称、代码、系统提示词、标签）
 */

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ofetch } from 'ofetch';
import { X } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface Tag { id: string; tagName: string }

export function AgentBasicInfo({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const { token } = useAuthStore();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(agent.tags?.map((t: any) => t.id) || []);
  const [newTagName, setNewTagName] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch('/api/agents/tags', { headers: authHeaders });
        if (res.code === 0) setAllTags(res.data);
      } catch { /* 容错 */ }
    })();
  }, []);

  const update = (field: string, value: any) => onChange({ ...agent, [field]: value });

  const toggleTag = async (tagId: string) => {
    const newIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(newIds);
    try {
      await ofetch(`/api/agents/${agent.id}/tags`, { method: 'PUT', body: { tagIds: newIds, tagNames: [] }, headers: authHeaders });
    } catch { /* 容错 */ }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await ofetch('/api/agents/tags', { method: 'POST', body: { tagName: newTagName.trim() }, headers: authHeaders });
      if (res.code === 0) {
        setAllTags([...allTags, res.data]);
        setNewTagName('');
      }
    } catch { /* 容错 */ }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>智能体名称</Label>
              <Input value={agent.agentName || ''} onChange={(e) => update('agentName', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>智能体编码</Label>
              <Input value={agent.agentCode || ''} disabled className="opacity-60" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>系统提示词（最多 2000 字）</Label>
            <Textarea
              value={agent.systemPrompt || ''}
              onChange={(e) => update('systemPrompt', e.target.value)}
              rows={6}
              placeholder="你是一个有用的AI助手..."
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">{(agent.systemPrompt || '').length}/2000</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">标签</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {allTags.map(tag => (
              <Badge
                key={tag.id}
                variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleTag(tag.id)}
              >
                {tag.tagName}
                {selectedTagIds.includes(tag.id) && <X size={12} className="ml-1" />}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="新标签名称"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createTag()}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={createTag}>添加</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
