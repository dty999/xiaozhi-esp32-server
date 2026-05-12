'use client';
/**
 * 音色管理页
 *
 * 对标旧项目 timbre.js API 和 VoiceResourceManagement.vue:
 *   - 音色名称、语言、备注、排序
 *   - TTS模型ID、音色代码、参考音频、参考文本、演示音频
 *
 * 旧项目字段映射:
 *   voiceName -> name
 *   languageType -> languages
 *   ttsVoice -> voiceCode (ttsVoice)
 *   voiceDemo -> voiceDemo
 *   referenceAudio -> referenceAudio
 *   referenceText -> referenceText
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Music, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function TimbrePage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const limit = 10;

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/timbre?page=${page}&limit=${limit}&name=${keyword}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, keyword]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此音色？')) return;
    try {
      await ofetch(`/api/timbre?ids=${id}`, { method: 'DELETE', headers: authHeaders });
      fetchData();
    } catch { /* 容错 */ }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Music size={20} strokeWidth={1.8} />音色管理
        </h1>
        <Button size="sm" className="h-7" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus size={14} strokeWidth={1.8} className="mr-1" />新增音色
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索音色名称..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs h-8"
        />
        <Button variant="outline" size="sm" className="h-8" onClick={() => { setPage(1); fetchData(); }}>
          <Search size={14} strokeWidth={1.8} className="mr-1" />搜索
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无数据</p>
      ) : (
        <div className="space-y-3">
          {data.map((row: any) => (
            <Card key={row.id} className="transition-colors hover:border-primary/15">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{row.name || '-'}</span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                        排序: {row.sort ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span>ID: {row.id}</span>
                      <span>TTS模型: {row.ttsModelId || '-'}</span>
                      <span>音色代码: {row.ttsVoice || row.voiceCode || '-'}</span>
                      <span>语言: {row.languages || '-'}</span>
                    </div>
                    {row.remark && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        备注: {row.remark}
                      </p>
                    )}
                    {(row.voiceDemo || row.referenceAudio) && (
                      <div className="flex gap-2 mt-1">
                        {row.voiceDemo && (
                          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded-md">
                            有演示音频
                          </span>
                        )}
                        {row.referenceAudio && (
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md">
                            有参考音频
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setEditing(row); setDialogOpen(true); }}
                    >
                      <Pencil size={14} strokeWidth={1.8} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/5"
                      onClick={() => handleDelete(row.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-5">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} strokeWidth={1.8} />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className="h-7 w-7 p-0 text-xs"
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} strokeWidth={1.8} />
          </Button>
        </div>
      )}

      {/* 新增/编辑音色对话框 */}
      <TimbreDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 音色编辑对话框 */
function TimbreDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean;
  editing: any;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: Record<string, string>;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    languages: '',
    ttsModelId: '',
    ttsVoice: '',
    voiceDemo: '',
    referenceAudio: '',
    referenceText: '',
    remark: '',
    sort: 0,
  });

  // 加载 TTS 模型列表
  const [models, setModels] = useState<any[]>([]);
  useEffect(() => {
    if (open) {
      ofetch('/api/models?modelType=TTS&limit=100', { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setModels(res.data.list || []); })
        .catch(() => {});
    }
  }, [open]);

  // 编辑时加载数据
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || '',
        languages: editing.languages || '',
        ttsModelId: editing.ttsModelId || '',
        ttsVoice: editing.ttsVoice || editing.voiceCode || '',
        voiceDemo: editing.voiceDemo || '',
        referenceAudio: editing.referenceAudio || '',
        referenceText: editing.referenceText || '',
        remark: editing.remark || '',
        sort: editing.sort ?? 0,
      });
    } else {
      setForm({
        name: '',
        languages: '',
        ttsModelId: '',
        ttsVoice: '',
        voiceDemo: '',
        referenceAudio: '',
        referenceText: '',
        remark: '',
        sort: 0,
      });
    }
  }, [editing]);

  const handleSubmit = async () => {
    if (!form.name) {
      alert('请输入音色名称');
      return;
    }
    if (!form.ttsModelId) {
      alert('请选择 TTS 模型');
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: form.name,
        languages: form.languages || null,
        ttsModelId: form.ttsModelId,
        ttsVoice: form.ttsVoice || null,
        voiceDemo: form.voiceDemo || null,
        referenceAudio: form.referenceAudio || null,
        referenceText: form.referenceText || null,
        remark: form.remark || null,
        sort: form.sort ?? 0,
      };

      let res;
      if (editing?.id) {
        res = await ofetch(`/api/timbre/${editing.id}`, {
          method: 'PUT',
          body,
          headers: authHeaders,
        });
      } else {
        res = await ofetch('/api/timbre', {
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑音色' : '新增音色'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 音色名称 */}
          <div className="space-y-1">
            <Label>音色名称 <span className="text-destructive">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入音色名称"
            />
          </div>

          {/* TTS 模型 */}
          <div className="space-y-1">
            <Label>TTS 模型 <span className="text-destructive">*</span></Label>
            <select
              value={form.ttsModelId}
              onChange={(e) => setForm({ ...form, ttsModelId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择 TTS 模型</option>
              {models.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.modelName || m.modelCode}
                </option>
              ))}
            </select>
          </div>

          {/* 音色代码 */}
          <div className="space-y-1">
            <Label>音色代码</Label>
            <Input
              value={form.ttsVoice}
              onChange={(e) => setForm({ ...form, ttsVoice: e.target.value })}
              placeholder="输入音色代码（如音色标识符）"
            />
          </div>

          {/* 语言 */}
          <div className="space-y-1">
            <Label>语言</Label>
            <Input
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
              placeholder="如 zh-CN, en-US"
            />
          </div>

          {/* 排序 */}
          <div className="space-y-1">
            <Label>排序</Label>
            <Input
              type="number"
              value={form.sort}
              onChange={(e) => setForm({ ...form, sort: parseInt(e.target.value) || 0 })}
              placeholder="数值越小越靠前"
            />
          </div>

          {/* 演示音频 URL */}
          <div className="space-y-1">
            <Label>演示音频 URL</Label>
            <Input
              value={form.voiceDemo}
              onChange={(e) => setForm({ ...form, voiceDemo: e.target.value })}
              placeholder="输入演示音频 URL"
            />
          </div>

          {/* 参考音频 URL */}
          <div className="space-y-1">
            <Label>参考音频 URL</Label>
            <Input
              value={form.referenceAudio}
              onChange={(e) => setForm({ ...form, referenceAudio: e.target.value })}
              placeholder="输入参考音频 URL"
            />
          </div>

          {/* 参考文本 */}
          <div className="space-y-1">
            <Label>参考文本</Label>
            <Textarea
              value={form.referenceText}
              onChange={(e) => setForm({ ...form, referenceText: e.target.value })}
              placeholder="输入参考文本"
              rows={2}
            />
          </div>

          {/* 备注 */}
          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              placeholder="输入备注信息"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8" onClick={onClose}>取消</Button>
            <Button size="sm" className="h-8" onClick={handleSubmit} disabled={loading || !form.name || !form.ttsModelId}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}