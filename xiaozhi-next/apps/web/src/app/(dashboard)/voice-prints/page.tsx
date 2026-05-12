'use client';
/**
 * 声纹管理页
 *
 * 对标旧项目 VoicePrint.vue:
 *   - 声纹列表：sourceName（名称）、introduce（描述）、createDate（创建时间）
 *   - 新增/编辑声纹：sourceName、audioId（选择音频向量）、introduce
 *   - 删除声纹
 *
 * 声纹与智能体绑定，需要先选择智能体
 */

import { useEffect, useState, useRef } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, Plus, Pencil, Trash2, Play, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function VoicePrintsPage() {
  const { token } = useAuthStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [voicePrints, setVoicePrints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 加载用户的智能体列表
  useEffect(() => {
    ofetch('/api/agents', { headers: authHeaders })
      .then((res: any) => {
        if (res.code === 0) {
          const list = res.data || [];
          setAgents(list);
          if (list.length > 0) {
            setSelectedAgent(list[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  // 加载选中智能体的声纹列表
  useEffect(() => {
    if (selectedAgent) {
      fetchVoicePrints();
    }
  }, [selectedAgent]);

  const fetchVoicePrints = async () => {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const res = await ofetch(`/api/agents/${selectedAgent.id}/voice-prints`, { headers: authHeaders });
      if (res.code === 0) {
        setVoicePrints(res.data || []);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此声纹？')) return;
    try {
      await ofetch(`/api/agents/voice-prints/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchVoicePrints();
    } catch { /* 容错 */ }
  };

  const handlePlay = async (audioId: string) => {
    if (playingId === audioId) {
      // 停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const res = await ofetch(`/api/agents/audio/${audioId}`, { method: 'POST', headers: authHeaders });
      if (res.code === 0 && res.data) {
        const audio = new Audio(`/api/agents/play/${res.data}`);
        audioRef.current = audio;
        setPlayingId(audioId);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => setPlayingId(null);
        audio.play();
      }
    } catch { /* 容错 */ }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <User size={20} strokeWidth={1.8} />声纹管理
        </h1>
      </div>

      {/* 智能体选择 */}
      <div className="mb-6">
        <Label className="mb-2 block">选择智能体</Label>
        <div className="flex gap-2 flex-wrap">
          {agents.map((agent: any) => (
            <Button
              key={agent.id}
              variant={selectedAgent?.id === agent.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedAgent(agent)}
            >
              {agent.agentName || `智能体 ${agent.id.slice(-6)}`}
            </Button>
          ))}
        </div>
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">暂无可用智能体，请先创建智能体</p>
        )}
      </div>

      {/* 操作栏 */}
      {selectedAgent && (
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-muted-foreground">
            {selectedAgent.name || selectedAgent.agentName || `智能体 ${selectedAgent.id}`} 的声纹
          </span>
          <Button
            size="sm"
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            <Plus size={16} className="mr-1" />新增声纹
          </Button>
        </div>
      )}

      {/* 声纹列表 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : voicePrints.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无声纹，点击「新增声纹」添加</p>
      ) : (
        <div className="space-y-2">
          {voicePrints.map((vp: any) => (
            <Card key={vp.id} className="transition-colors hover:border-primary/15">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{vp.sourceName || '-'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: {vp.id}
                      {vp.audioId && ` · 音频ID: ${vp.audioId}`}
                    </p>
                    {vp.introduce && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        描述: {vp.introduce}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      创建时间: {formatDate(vp.createDate)}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    {/* 播放按钮 */}
                    {vp.audioId && (
                      playingId === vp.audioId ? (
                        <Button size="sm" variant="outline" onClick={() => handlePlay(vp.audioId)}>
                          <Square size={14} className="mr-1" />停止
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handlePlay(vp.audioId)}>
                          <Play size={14} className="mr-1" />播放
                        </Button>
                      )
                    )}
                    {/* 编辑 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(vp); setDialogOpen(true); }}
                    >
                      <Pencil size={14} />
                    </Button>
                    {/* 删除 */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(vp.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新增/编辑声纹对话框 */}
      <VoicePrintDialog
        open={dialogOpen}
        editing={editing}
        agentId={selectedAgent?.id}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchVoicePrints(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 声纹编辑对话框 */
function VoicePrintDialog({ open, editing, agentId, onClose, onSaved, authHeaders }: {
  open: boolean;
  editing: any;
  agentId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: Record<string, string>;
}) {
  const [form, setForm] = useState({
    sourceName: '',
    audioId: '',
    introduce: '',
  });
  const [audioOptions, setAudioOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载最近音频列表
  useEffect(() => {
    if (open && agentId) {
      ofetch(`/api/agents/${agentId}/chat-history/user`, { headers: authHeaders })
        .then((res: any) => {
          if (res.code === 0) {
            // 从聊天历史中提取音频选项
            const audios = res.data || [];
            setAudioOptions(audios.slice(0, 50)); // 最近50条
          }
        })
        .catch(() => {});
    }
  }, [open, agentId]);

  // 编辑时加载数据
  useEffect(() => {
    if (editing) {
      setForm({
        sourceName: editing.sourceName || '',
        audioId: editing.audioId || '',
        introduce: editing.introduce || '',
      });
    } else {
      setForm({
        sourceName: '',
        audioId: '',
        introduce: '',
      });
    }
  }, [editing]);

  const handleSubmit = async () => {
    if (!form.sourceName) {
      alert('请输入声纹名称');
      return;
    }
    if (!agentId) {
      alert('请先选择智能体');
      return;
    }

    setLoading(true);
    try {
      const body = {
        agentId,
        sourceName: form.sourceName,
        audioId: form.audioId || null,
        introduce: form.introduce || null,
      };

      let res;
      if (editing?.id) {
        res = await ofetch(`/api/agents/voice-prints/${editing.id}`, {
          method: 'PUT',
          body,
          headers: authHeaders,
        });
      } else {
        res = await ofetch('/api/agents/voice-prints', {
          method: 'POST',
          body,
          headers: authHeaders,
        });
      }

      if (res.code === 0) {
        onSaved();
      } else {
        alert(res.msg || '保存失败');
      }
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '编辑声纹' : '新增声纹'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 声纹名称 */}
          <div className="space-y-1">
            <Label>声纹名称 <span className="text-destructive">*</span></Label>
            <Input
              value={form.sourceName}
              onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
              placeholder="输入声纹名称"
            />
          </div>

          {/* 音频向量（可选） */}
          <div className="space-y-1">
            <Label>音频向量（可选）</Label>
            {audioOptions.length > 0 ? (
              <select
                value={form.audioId}
                onChange={(e) => setForm({ ...form, audioId: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">选择音频</option>
                {audioOptions.map((audio: any) => (
                  <option key={audio.audioId} value={audio.audioId}>
                    {audio.content?.slice(0, 30) || audio.audioId}...
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={form.audioId}
                onChange={(e) => setForm({ ...form, audioId: e.target.value })}
                placeholder="输入音频ID"
              />
            )}
            {audioOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无音频记录，可直接输入音频ID</p>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1">
            <Label>描述</Label>
            <Textarea
              value={form.introduce}
              onChange={(e) => setForm({ ...form, introduce: e.target.value })}
              placeholder="输入描述信息"
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading || !form.sourceName || !agentId} className="w-full">
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}