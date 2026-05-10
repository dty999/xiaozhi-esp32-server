'use client';
/**
 * 音色资源管理页
 *
 * 对标旧项目 VoiceResourceManagement.vue:
 *   - 表格列：voiceId、name、userName（用户）、modelName（平台名称）、languages、trainStatus、createDate
 *   - 搜索功能（按名称搜索）
 *   - 分页功能
 *   - 批量选择删除
 *   - 新增音色资源对话框：选择平台、voiceId列表、用户、语言
 *
 * 训练状态: 0=未训练, 1=训练中, 2=训练成功, 3=训练失败
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Music, Search, Plus, Trash2, ChevronLeft, ChevronRight, Check, Square } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function VoiceResourcePage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const limit = 10;

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/voice-resource?page=${page}&limit=${limit}&name=${keyword}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, keyword]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除选中的 ${ids.length} 条记录？`)) return;
    try {
      await ofetch(`/api/voice-resource?ids=${ids.join(',')}`, { method: 'DELETE', headers: authHeaders });
      setSelectedIds(new Set());
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((row: any) => row.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const statusBadge = (status: number) => {
    const map: Record<number, { variant: 'secondary' | 'outline' | 'destructive' | 'default'; label: string }> = {
      0: { variant: 'secondary', label: '未训练' },
      1: { variant: 'default', label: '训练中' },
      2: { variant: 'outline', label: '训练成功' },
      3: { variant: 'destructive', label: '训练失败' },
    };
    const info = map[status] || { variant: 'secondary' as const, label: `${status}` };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Music size={24} />音色资源
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 size={16} className="mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus size={16} className="mr-1" />新增音色资源
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索名称..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => { setPage(1); fetchData(); }}>
          <Search size={16} className="mr-1" />搜索
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无数据</p>
      ) : (
        <>
          {/* 全选行 */}
          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1 hover:text-foreground"
            >
              {selectedIds.size === data.length && data.length > 0 ? (
                <Check size={14} />
              ) : (
                <Square size={14} />
              )}
              全选
            </button>
            <span>已选中 {selectedIds.size} / {data.length} 条</span>
          </div>

          <div className="space-y-2">
            {data.map((row: any) => (
              <Card key={row.id} className="hover:shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 选择框 */}
                    <button
                      onClick={() => handleSelectOne(row.id)}
                      className="flex-shrink-0"
                    >
                      {selectedIds.has(row.id) ? (
                        <Check size={16} className="text-primary" />
                      ) : (
                        <Square size={16} className="text-muted-foreground" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{row.name || '-'}</span>
                        {statusBadge(row.trainStatus)}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>声音ID: {row.voiceId || '-'}</span>
                        <span>用户: {row.user?.realName || row.user?.username || row.user?.id || '-'}</span>
                        <span>平台: {row.modelName || row.modelId || '-'}</span>
                        <span>语言: {row.languages || '-'}</span>
                        <span>创建: {formatDate(row.createDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete([row.id])}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
            首页
          </Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
            末页
          </Button>
        </div>
      )}

      {/* 新增音色资源对话框 */}
      <AddVoiceResourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={() => { setDialogOpen(false); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 新增音色资源对话框 */
function AddVoiceResourceDialog({ open, onClose, onAdded, authHeaders }: {
  open: boolean; onClose: () => void; onAdded: () => void; authHeaders: Record<string, string>;
}) {
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    modelId: '',
    voiceId: '',
    userId: '',
    languages: '',
  });

  // 加载平台列表
  useEffect(() => {
    if (open) {
      ofetch('/api/voice-resource/platforms', { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setPlatforms(res.data || []); })
        .catch(() => {});
    }
  }, [open]);

  // 搜索用户
  useEffect(() => {
    if (userSearch.length >= 2) {
      ofetch(`/api/admin/users?mobile=${userSearch}&limit=20`, { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setUsers(res.data.list || []); })
        .catch(() => {});
    } else {
      setUsers([]);
    }
  }, [userSearch]);

  const handleSubmit = async () => {
    if (!form.name) {
      alert('请输入名称');
      return;
    }
    if (!form.modelId) {
      alert('请选择平台');
      return;
    }
    if (!form.voiceId) {
      alert('请输入声音ID');
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: form.name,
        modelId: form.modelId,
        voiceId: form.voiceId,
        userId: form.userId || undefined,
        languages: form.languages || undefined,
        trainStatus: 2, // 管理端直接添加，默认完成
      };
      const res = await ofetch('/api/voice-resource', {
        method: 'POST',
        body,
        headers: authHeaders,
      });
      if (res.code === 0) {
        onAdded();
        setForm({ name: '', modelId: '', voiceId: '', userId: '', languages: '' });
      } else {
        alert(res.msg || '添加失败');
      }
    } catch (e: any) {
      alert(e.message || '添加失败');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增音色资源</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 名称 */}
          <div className="space-y-1">
            <Label>名称 <span className="text-destructive">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入音色资源名称"
            />
          </div>

          {/* 平台选择 */}
          <div className="space-y-1">
            <Label>平台 <span className="text-destructive">*</span></Label>
            <select
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择 TTS 平台</option>
              {platforms.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.modelName || p.modelCode}
                </option>
              ))}
            </select>
          </div>

          {/* 声音ID */}
          <div className="space-y-1">
            <Label>声音ID <span className="text-destructive">*</span></Label>
            <Input
              value={form.voiceId}
              onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
              placeholder="输入声音ID"
            />
          </div>

          {/* 用户选择（可选） */}
          <div className="space-y-1">
            <Label>用户（可选）</Label>
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="搜索用户手机号..."
            />
            {users.length > 0 && (
              <div className="border rounded-md max-h-40 overflow-y-auto mt-1">
                {users.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setForm({ ...form, userId: u.id });
                      setUserSearch(u.mobile || u.username);
                      setUsers([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  >
                    {u.mobile || u.username} {u.realName ? `(${u.realName})` : ''}
                  </button>
                ))}
              </div>
            )}
            {form.userId && (
              <p className="text-xs text-muted-foreground mt-1">
                已选择用户ID: {form.userId}
              </p>
            )}
          </div>

          {/* 语言 */}
          <div className="space-y-1">
            <Label>语言（可选）</Label>
            <Input
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
              placeholder="如 zh-CN, en-US"
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading || !form.modelId || !form.voiceId} className="w-full">
            {loading ? '添加中...' : '添加'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}