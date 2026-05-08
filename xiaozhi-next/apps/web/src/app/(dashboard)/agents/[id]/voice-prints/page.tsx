'use client';
/**
 * 智能体声纹管理页
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface VoicePrint { id: string; sourceName: string; introduce: string; createDate: string }

export default function AgentVoicePrintsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [prints, setPrints] = useState<VoicePrint[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newIntro, setNewIntro] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchPrints = async () => {
    try {
      const res = await ofetch(`/api/agents/${id}/voice-prints`, { headers: authHeaders });
      if (res.code === 0) setPrints(res.data || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchPrints(); }, [id]);

  const handleCreate = async () => {
    if (!newName) return;
    try {
      await ofetch('/api/agents/voice-prints', { method: 'POST', body: { agentId: id, sourceName: newName, introduce: newIntro }, headers: authHeaders });
      setNewName(''); setNewIntro(''); fetchPrints();
    } catch { /* 容错 */ }
  };

  const handleDelete = async (printId: string) => {
    if (!confirm('确定删除？')) return;
    try { await ofetch(`/api/agents/voice-prints/${printId}`, { method: 'DELETE', headers: authHeaders }); fetchPrints(); } catch { /* */ }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/agents/${id}`)}>
          <ArrowLeft size={16} className="mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold">声纹管理</h1>
      </div>

      {/* 新增声纹 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">新增声纹</p>
          <div className="flex gap-2 mb-2">
            <Input placeholder="声纹名称" value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" />
            <Input placeholder="简介（可选）" value={newIntro} onChange={e => setNewIntro(e.target.value)} className="flex-1" />
            <Button onClick={handleCreate} disabled={!newName}><Plus size={14} className="mr-1" />创建</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? <p className="text-muted-foreground">加载中...</p>
      : prints.length === 0 ? <p className="text-muted-foreground">暂无声纹</p>
      : (
        <div className="space-y-2">
          {prints.map(p => (
            <Card key={p.id}>
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <span className="font-medium">{p.sourceName || '未命名'}</span>
                  {p.introduce && <span className="text-sm text-muted-foreground ml-3">{p.introduce}</span>}
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(p.id)}>
                  <Trash2 size={14} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
