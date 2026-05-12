'use client';
/**
 * 用户管理页
 *
 * 对标旧项目 UserManagement.vue:
 *   - 用户列表：选择框、用户ID、手机号、设备数、创建时间、状态(tag)、操作
 *   - 搜索（按手机号）
 *   - 分页（每页条数选择）
 *   - 批量选择 + 全选
 *   - 批量启用/禁用/删除
 *   - 单个操作：重置密码（弹窗展示新密码）、启用/禁用、删除
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Users, Search, Trash2, ChevronLeft, ChevronRight,
  Check, Square, Key, Ban, CheckCircle2, AlertTriangle, Plus,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function UsersPage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; password: string }>({ open: false, password: '' });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/admin/users?page=${page}&limit=${pageSize}&mobile=${keyword}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, pageSize, keyword]);

  // ───── 批量操作 ─────
  const handleBatchStatus = async (status: 0 | 1) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const action = status === 1 ? '启用' : '禁用';
    if (!confirm(`确定${action}选中的 ${ids.length} 个用户？`)) return;
    try {
      const res = await ofetch('/api/admin/users', {
        method: 'PUT',
        body: { status, userIds: ids },
        headers: authHeaders,
      });
      if (res.code === 0) {
        setSelectedIds(new Set());
        fetchData();
      } else {
        alert(res.msg || '操作失败');
      }
    } catch (e: any) {
      alert(e.message || '操作失败');
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 个用户？此操作不可恢复！`)) return;
    try {
      let success = 0, fail = 0;
      for (const id of ids) {
        try {
          await ofetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: authHeaders });
          success++;
        } catch { fail++; }
      }
      setSelectedIds(new Set());
      fetchData();
      if (fail === 0) alert(`成功删除 ${success} 个用户`);
      else alert(`删除完成：成功 ${success}，失败 ${fail}`);
    } catch { /* 容错 */ }
  };

  // ───── 单用户操作 ─────
  const handleResetPassword = async (id: string) => {
    if (!confirm('确定重置此用户的密码？')) return;
    try {
      const res = await ofetch(`/api/admin/users/${id}`, { method: 'PUT', headers: authHeaders });
      if (res.code === 0) {
        setPasswordDialog({ open: true, password: res.data.password || '未知' });
      } else {
        alert(res.msg || '重置失败');
      }
    } catch (e: any) {
      alert(e.message || '重置失败');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: number) => {
    const newStatus = currentStatus === 1 ? 0 : 1;
    const action = newStatus === 1 ? '启用' : '禁用';
    if (!confirm(`确定${action}此用户？`)) return;
    try {
      const res = await ofetch('/api/admin/users', {
        method: 'PUT',
        body: { status: newStatus, userIds: [id] },
        headers: authHeaders,
      });
      if (res.code === 0) fetchData();
      else alert(res.msg || '操作失败');
    } catch (e: any) {
      alert(e.message || '操作失败');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('确定删除此用户？此操作不可恢复！')) return;
    try {
      const res = await ofetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: authHeaders });
      if (res.code === 0) fetchData();
      else alert(res.msg || '删除失败');
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  // ───── 选择 ─────
  const handleSelectAll = () => {
    if (selectedIds.size === data.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.map(r => r.id)));
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users size={20} strokeWidth={1.8} />用户管理
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus size={16} className="mr-1" />新增用户
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleBatchStatus(1)}>
                <CheckCircle2 size={14} className="mr-1" />批量启用
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBatchStatus(0)}>
                <Ban size={14} className="mr-1" />批量禁用
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                <Trash2 size={14} className="mr-1" />批量删除 ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 搜索 */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索手机号..."
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs h-8"
        />
        <Button variant="outline" onClick={() => { setPage(1); fetchData(); }}>
          <Search size={16} className="mr-1" />搜索
        </Button>
      </div>

      {/* 全选 */}
      {data.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <button onClick={handleSelectAll} className="flex items-center gap-1 hover:text-foreground">
            {selectedIds.size === data.length ? <Check size={14} /> : <Square size={14} />}
            全选
          </button>
          <span>已选 {selectedIds.size} / {data.length}</span>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无用户</p>
      ) : (
        <div className="space-y-2">
          {data.map((row: any) => (
            <Card key={row.id} className="transition-colors hover:border-primary/15">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => handleSelectOne(row.id)} className="flex-shrink-0">
                      {selectedIds.has(row.id)
                        ? <Check size={16} className="text-primary" />
                        : <Square size={16} className="text-muted-foreground" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {row.realName || row.username || '-'}
                        </span>
                        <Badge variant={row.status === 1 ? 'outline' : 'destructive'} className="text-xs">
                          {row.status === 1 ? '正常' : '禁用'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>ID: {row.id}</span>
                        <span>手机: {row.mobile || '-'}</span>
                        <span>用户名: {row.username || '-'}</span>
                        {row.email && <span>邮箱: {row.email}</span>}
                        <span>设备: {row.deviceCount ?? '-'}</span>
                        <span>创建: {formatDate(row.createDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4 flex-shrink-0 flex-wrap">
                    {/* 重置密码 */}
                    <Button size="sm" variant="outline" onClick={() => handleResetPassword(row.id)}>
                      <Key size={14} className="mr-1" />重置密码
                    </Button>
                    {/* 启用/禁用 */}
                    {row.status === 1 ? (
                      <Button size="sm" variant="outline" onClick={() => handleToggleStatus(row.id, 1)}>
                        <Ban size={14} className="mr-1" />禁用
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleToggleStatus(row.id, 0)}>
                        <CheckCircle2 size={14} className="mr-1" />启用
                      </Button>
                    )}
                    {/* 删除 */}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteUser(row.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      <div className="flex items-center justify-between mt-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">每页</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">条</span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>末页</Button>
          </div>
        )}

        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </div>

      {/* 重置密码结果弹窗 */}
      <PasswordResultDialog
        open={passwordDialog.open}
        password={passwordDialog.password}
        onClose={() => setPasswordDialog({ open: false, password: '' })}
      />

      {/* 新增用户弹窗 */}
      <CreateUserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={() => { setCreateDialogOpen(false); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 重置密码结果显示对话框 */
function PasswordResultDialog({ open, password, onClose }: {
  open: boolean; password: string; onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key size={18} />密码已重置
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-primary/5 border border-primary/15 rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-2">新密码</p>
            <p className="text-2xl font-mono font-bold text-primary select-all">{password}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            请将此密码告知用户，建议登录后立即修改密码。
          </p>
          <Button onClick={onClose} className="w-full">我知道了</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 新增用户对话框 */
function CreateUserDialog({ open, onClose, onCreated, authHeaders }: {
  open: boolean; onClose: () => void; onCreated: () => void; authHeaders: Record<string, string>;
}) {
  const [form, setForm] = useState({ username: '', password: '', realName: '', mobile: '', email: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.username.trim()) { alert('请输入用户名'); return; }
    if (!form.password.trim()) { alert('请输入密码'); return; }

    setSaving(true);
    try {
      const res = await ofetch('/api/admin/users', {
        method: 'POST',
        body: {
          username: form.username.trim(),
          password: form.password.trim(),
          realName: form.realName.trim() || undefined,
          mobile: form.mobile.trim() || undefined,
          email: form.email.trim() || undefined,
        },
        headers: authHeaders,
      });
      if (res.code === 0) {
        onCreated();
      } else {
        alert(res.msg || '创建失败');
      }
    } catch (e: any) {
      alert(e.message || '创建失败');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={18} />新增用户
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>用户名 <span className="text-destructive">*</span></Label>
            <Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="登录用用户名" />
          </div>
          <div className="space-y-1">
            <Label>密码 <span className="text-destructive">*</span></Label>
            <Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="初始密码" />
          </div>
          <div className="space-y-1">
            <Label>姓名</Label>
            <Input value={form.realName} onChange={e => setForm({...form, realName: e.target.value})} placeholder="真实姓名（选填）" />
          </div>
          <div className="space-y-1">
            <Label>手机号</Label>
            <Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="手机号（选填）" />
          </div>
          <div className="space-y-1">
            <Label>邮箱</Label>
            <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="邮箱（选填）" />
          </div>
          <Button onClick={handleSubmit} disabled={saving || !form.username || !form.password} className="w-full">
            {saving ? '创建中...' : '创建用户'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}