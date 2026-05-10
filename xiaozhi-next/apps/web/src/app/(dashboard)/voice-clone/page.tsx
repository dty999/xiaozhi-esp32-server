'use client';
/**
 * 声音克隆管理页
 *
 * 对标 Java VoiceCloneManagement.vue:
 *   列表、搜索、上传音频、触发训练、播放、改名、删除
 *
 * 训练状态: 0=未训练, 1=训练中, 2=训练成功, 3=训练失败
 */

import { useEffect, useState, useRef } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Trash2, Mic, Upload, Play, Square, Pencil,
  RefreshCw, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';
import { serializeBigInt } from '@/lib/serialize';

export default function VoiceClonePage() {
  const { token } = useAuthStore();
  const [clones, setClones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClone, setEditingClone] = useState<any>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchClones = async () => {
    try {
      const res = await ofetch(`/api/voice-clone?page=1&limit=100&name=${search}`, { headers: authHeaders });
      if (res.code === 0) setClones(res.data.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchClones(); }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此克隆记录？')) return;
    try {
      await ofetch(`/api/voice-clone?ids=${id}`, { method: 'DELETE', headers: authHeaders });
      fetchClones();
    } catch { /* 容错 */ }
  };

  const handleTrain = async (cloneId: string) => {
    try {
      const res = await ofetch('/api/voice-clone/train', {
        method: 'POST',
        body: { cloneId },
        headers: authHeaders,
      });
      if (res.code === 0) {
        alert('训练完成');
      } else {
        alert(res.msg || '训练失败');
      }
      fetchClones();
    } catch (e: any) {
      alert(e.message || '训练请求失败');
      fetchClones();
    }
  };

  const handlePlay = async (cloneId: string) => {
    try {
      // 获取一次性播放 UUID
      const res = await ofetch(`/api/voice-clone/audio/${cloneId}`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (res.code === 0 && res.data?.uuid) {
        const audio = new Audio(`/api/voice-clone/play/${res.data.uuid}`);
        audioRef.current = audio;
        setPlayingId(cloneId);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => setPlayingId(null);
        audio.play();
      }
    } catch { /* 容错 */ }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
    }
  };

  const statusBadge = (status: number, error?: string) => {
    const map: Record<number, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: any }> = {
      0: { variant: 'secondary', label: '未训练', icon: null },
      1: { variant: 'default', label: '训练中', icon: Loader2 },
      2: { variant: 'outline', label: '训练成功', icon: CheckCircle2 },
      3: { variant: 'destructive', label: '训练失败', icon: AlertCircle },
    };
    const info = map[status] || { variant: 'secondary' as const, label: `${status}`, icon: null };
    const Icon = info.icon;
    return (
      <div className="flex items-center gap-1">
        <Badge variant={info.variant}>
          {Icon && <Icon size={12} className={`mr-1 ${status === 1 ? 'animate-spin' : ''}`} />}
          {info.label}
        </Badge>
        {status === 3 && error && (
          <span className="text-xs text-destructive ml-1" title={error}>{error}</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mic size={24} />声音克隆
        </h1>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus size={16} className="mr-1" />上传音频
        </Button>
      </div>

      <Input
        placeholder="搜索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : clones.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无克隆记录，点击「上传音频」开始</p>
      ) : (
        <div className="space-y-3">
          {clones.map((clone: any) => (
            <Card key={clone.id} className="hover:shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{clone.name}</span>
                    {statusBadge(clone.trainStatus, clone.trainError)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    声音ID: {clone.voiceId}
                    {clone.languages ? ` · ${clone.languages}` : ''}
                    {clone.audioPath ? ' · 已上传音频' : ' · 未上传音频'}
                  </p>
                </div>
                <div className="flex gap-1 ml-3">
                  {/* 播放/停止 */}
                  {clone.audioPath && (
                    playingId === clone.id ? (
                      <Button size="sm" variant="outline" onClick={handleStop}>
                        <Square size={14} className="mr-1" />停止
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handlePlay(clone.id)}>
                        <Play size={14} className="mr-1" />播放
                      </Button>
                    )
                  )}
                  {/* 训练 */}
                  {clone.trainStatus !== 1 && clone.trainStatus !== 2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTrain(clone.id)}
                      disabled={!clone.audioPath}
                      title={!clone.audioPath ? '请先上传音频' : ''}
                    >
                      <RefreshCw size={14} className="mr-1" />
                      {clone.trainStatus === 3 ? '重新训练' : '训练'}
                    </Button>
                  )}
                  {/* 编辑名称 */}
                  <Button size="sm" variant="ghost" onClick={() => { setEditingClone(clone); setEditDialogOpen(true); }}>
                    <Pencil size={14} />
                  </Button>
                  {/* 删除 */}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(clone.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 上传音频弹框 */}
      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={() => { setUploadDialogOpen(false); fetchClones(); }}
        authHeaders={authHeaders}
      />

      {/* 编辑名称弹框 */}
      <EditNameDialog
        open={editDialogOpen}
        clone={editingClone}
        onClose={() => { setEditDialogOpen(false); setEditingClone(null); }}
        onSaved={() => { setEditDialogOpen(false); setEditingClone(null); fetchClones(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 上传音频弹框 */
function UploadDialog({ open, onClose, onUploaded, authHeaders }: {
  open: boolean; onClose: () => void; onUploaded: () => void; authHeaders: Record<string, string>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // 加载 TTS 模型列表
      ofetch('/api/models?modelType=TTS&limit=100', { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setModels(res.data.list || []); })
        .catch(() => {});
    }
  }, [open]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (ext === 'mp3' || ext === 'wav') {
        setFile(droppedFile);
        if (!name) setName(droppedFile.name.replace(/\.[^.]+$/, ''));
      } else {
        alert('仅支持 mp3 和 wav 格式');
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !modelId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || file.name);
      formData.append('modelId', modelId);
      await ofetch('/api/voice-clone/upload', {
        method: 'POST', body: formData, headers: authHeaders,
      });
      onUploaded();
    } catch (e: any) {
      alert(e.message || '上传失败');
    }
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传音频用于声音克隆</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 拖拽上传区域 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <div>
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground">拖拽音频文件到此处，或点击选择</p>
                <p className="text-xs text-muted-foreground mt-1">支持 mp3、wav 格式，最大 10MB</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".mp3,.wav"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="给这个声音起个名字" />
          </div>

          <div className="space-y-1">
            <Label>TTS 模型</Label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择 TTS 模型</option>
              {models.map((m: any) => (
                <option key={m.id} value={m.id}>{m.modelName || m.modelCode}</option>
              ))}
            </select>
          </div>

          <Button onClick={handleUpload} disabled={!file || !modelId || uploading} className="w-full">
            {uploading ? '上传中...' : '上传并创建'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 编辑名称弹框 */
function EditNameDialog({ open, clone, onClose, onSaved, authHeaders }: {
  open: boolean; clone: any; onClose: () => void; onSaved: () => void; authHeaders: Record<string, string>;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (clone) setName(clone.name || '');
  }, [clone]);

  const handleSave = async () => {
    if (!name.trim() || !clone) return;
    setSaving(true);
    try {
      await ofetch(`/api/voice-clone/${clone.id}/name`, {
        method: 'POST',
        body: { name },
        headers: authHeaders,
      });
      onSaved();
    } catch (e: any) {
      alert(e.message || '修改失败');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改名称</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
          </div>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="w-full">
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
