'use client';
/**
 * OTA 固件管理页
 *
 * 对标旧项目 OtaManagement.vue + FirmwareDialog.vue:
 *   - 固件列表：选择框、名称、类型、版本、大小、备注、创建/更新时间、下载/编辑/删除
 *   - 搜索（按名称）、分页、每页条数选择
 *   - 批量选择删除
 *   - 新增/编辑对话框：名称、类型（从字典取 FIRMWARE_TYPE）、版本（x.x.x 格式）、文件上传、备注
 *   - 文件上传：.bin/.apk 格式、最大 100MB、进度条
 *   - 下载：获取 UUID → 打开下载
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Package, Plus, Pencil, Trash2, Download,
  ChevronLeft, ChevronRight, Upload, Check, Square,
  AlertCircle, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

/** 文件大小格式化 */
function formatFileSize(bytes: number | string | bigint | null | undefined): string {
  if (bytes == null) return '-';
  const num = Number(bytes);
  if (num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = num;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 日期格式化 */
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function OtaPage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/ota/mag?page=${page}&limit=${pageSize}&firmwareName=${keyword}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, pageSize, keyword]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个固件？`)) return;
    try {
      for (const id of ids) {
        await ofetch(`/api/ota/mag/${id}`, { method: 'DELETE', headers: authHeaders });
      }
      setSelectedIds(new Set());
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await ofetch(`/api/ota/mag/${id}/download-url`, { headers: authHeaders });
      if (res.code === 0) {
        window.open(`/api/ota/mag/download/${res.data}`);
      } else {
        alert(res.msg || '获取下载链接失败');
      }
    } catch (e: any) {
      alert(e.message || '获取下载链接失败');
    }
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
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package size={24} />OTA 固件管理
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 size={16} className="mr-1" />删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={16} className="mr-1" />新增固件
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索固件名称..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      {/* 全选行 */}
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
        <p className="text-muted-foreground text-sm">暂无数据</p>
      ) : (
        <div className="space-y-2">
          {data.map((row: any) => (
            <Card key={row.id} className="hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 选择框 */}
                    <button onClick={() => handleSelectOne(row.id)} className="flex-shrink-0">
                      {selectedIds.has(row.id)
                        ? <Check size={16} className="text-primary" />
                        : <Square size={16} className="text-muted-foreground" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{row.firmwareName || '-'}</span>
                        <Badge variant="outline" className="text-xs">
                          {row.type || 'default'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">v{row.version || '-'}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>大小: {formatFileSize(row.fileSize)}</span>
                        {row.md5 && <span>MD5: {row.md5.slice(0, 16)}...</span>}
                        {row.remark && <span>备注: {row.remark}</span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>创建: {formatDate(row.createDate)}</span>
                        {row.updateDate && <span>更新: {formatDate(row.updateDate)}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    {/* 下载 */}
                    <Button size="sm" variant="outline" onClick={() => handleDownload(row.id)}>
                      <Download size={14} className="mr-1" />下载
                    </Button>
                    {/* 编辑 */}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setDialogOpen(true); }}>
                      <Pencil size={14} />
                    </Button>
                    {/* 删除 */}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete([row.id])}>
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
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">每页</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">条</span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>末页</Button>
          </div>
        )}

        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </div>

      {/* 新增/编辑对话框 */}
      <FirmwareDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 固件对话框（新增/编辑 + 文件上传） */
function FirmwareDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean;
  editing: any;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: Record<string, string>;
}) {
  const [form, setForm] = useState({
    firmwareName: '',
    type: '',
    version: '',
    remark: '',
    firmwarePath: '',
    fileSize: 0,
  });
  const [firmwareTypes, setFirmwareTypes] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'success' | 'exception' | ''>('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 加载固件类型（需认证）
  useEffect(() => {
    if (open) {
      ofetch('/api/admin/dict/data/type/FIRMWARE_TYPE', { headers: authHeaders })
        .then((res: any) => { if (res.code === 0) setFirmwareTypes(res.data || []); })
        .catch(() => setFirmwareTypes([]));
    }
  }, [open]);

  // 编辑/新增时填充表单
  useEffect(() => {
    if (editing) {
      setForm({
        firmwareName: editing.firmwareName || '',
        type: editing.type || '',
        version: editing.version || '',
        remark: editing.remark || '',
        firmwarePath: editing.firmwarePath || '',
        fileSize: editing.fileSize ? Number(editing.fileSize) : 0,
      });
    } else {
      setForm({ firmwareName: '', type: '', version: '', remark: '', firmwarePath: '', fileSize: 0 });
    }
    setFile(null);
    setUploadProgress(0);
    setUploadStatus('');
  }, [editing]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // 验证类型
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'bin' && ext !== 'apk') {
      alert('仅支持 .bin 和 .apk 格式固件');
      return;
    }
    // 验证大小（100MB）
    if (f.size > 100 * 1024 * 1024) {
      alert('固件文件不能超过 100MB');
      return;
    }

    setFile(f);
    // 新增模式下自动填充名称
    if (!editing && !form.firmwareName) {
      setForm(prev => ({ ...prev, firmwareName: f.name }));
    }
  };

  const handleUpload = async (): Promise<boolean> => {
    if (!file) return false;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('');

    try {
      const body = new FormData();
      body.append('file', file);
      body.append('firmwareName', form.firmwareName || file.name);
      body.append('type', form.type || 'default');
      body.append('version', form.version || '');

      // 模拟进度（实际 fetch 不支持进度，后续可换 XMLHttpRequest）
      setUploadProgress(50);

      const res: any = await ofetch('/api/ota/mag/upload', {
        method: 'POST',
        body,
        headers: authHeaders,
        // 不设置 Content-Type 让浏览器自动推导 multipart boundary
      });

      setUploadProgress(100);
      if (res.code === 0) {
        setUploadStatus('success');
        form.firmwarePath = res.data?.firmwarePath || '';
        form.fileSize = Number(res.data?.fileSize || file.size);
        return true;
      } else {
        setUploadStatus('exception');
        alert(res.msg || '上传失败');
        return false;
      }
    } catch (e: any) {
      setUploadStatus('exception');
      alert(e.message || '上传失败');
      return false;
    } finally {
      setTimeout(() => setUploading(false), 1500);
    }
  };

  const handleSubmit = async () => {
    // 表单验证
    if (!form.firmwareName) { alert('请输入固件名称'); return; }
    if (!form.type) { alert('请选择固件类型'); return; }
    if (!form.version) { alert('请输入版本号'); return; }
    if (!/^\d+\.\d+\.\d+$/.test(form.version)) { alert('版本号格式错误，请使用 x.x.x 格式'); return; }
    if (!editing && !file) { alert('请选择固件文件'); return; }

    setSaving(true);

    try {
      if (editing?.id) {
        // 编辑模式：只更新信息
        const res = await ofetch(`/api/ota/mag/${editing.id}`, {
          method: 'PUT',
          body: {
            firmwareName: form.firmwareName,
            type: form.type,
            version: form.version,
            remark: form.remark || null,
          },
          headers: authHeaders,
        });
        if (res.code === 0) {
          onSaved();
        } else {
          alert(res.msg || '更新失败');
        }
      } else {
        // 新增模式：先上传文件
        if (file) {
          const body = new FormData();
          body.append('file', file);
          body.append('firmwareName', form.firmwareName);
          body.append('type', form.type);
          body.append('version', form.version);

          const res: any = await ofetch('/api/ota/mag/upload', {
            method: 'POST',
            body,
            headers: authHeaders,
          });
          if (res.code === 0) {
            onSaved();
          } else {
            alert(res.msg || '新增失败');
          }
        }
      }
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑固件' : '新增固件'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 固件名称 */}
          <div className="space-y-1">
            <Label>固件名称 <span className="text-destructive">*</span></Label>
            <Input
              value={form.firmwareName}
              onChange={(e) => setForm({ ...form, firmwareName: e.target.value })}
              placeholder="输入固件名称"
              disabled={!!editing}
            />
          </div>

          {/* 固件类型 */}
          <div className="space-y-1">
            <Label>固件类型 <span className="text-destructive">*</span></Label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={!!editing}
            >
              <option value="">选择固件类型</option>
              {firmwareTypes.length > 0 ? (
                firmwareTypes.map((t: any) => (
                  <option key={t.id || t.dictValue} value={t.dictValue || t.key}>
                    {t.dictLabel || t.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="default">默认 (default)</option>
                  <option value="esp32">ESP32</option>
                  <option value="esp32s3">ESP32-S3</option>
                  <option value="esp32c3">ESP32-C3</option>
                </>
              )}
            </select>
          </div>

          {/* 版本号 */}
          <div className="space-y-1">
            <Label>版本号 <span className="text-destructive">*</span></Label>
            <Input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="如 1.0.0"
              disabled={!!editing}
            />
            <p className="text-xs text-muted-foreground">格式: x.x.x</p>
          </div>

          {/* 文件上传（仅新增模式） */}
          {!editing && (
            <div className="space-y-1">
              <Label>固件文件 <span className="text-destructive">*</span></Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div>
                    <Upload size={24} className="mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">点击选择固件文件</p>
                    <p className="text-xs text-muted-foreground mt-1">支持 .bin、.apk 格式，最大 100MB</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".bin,.apk"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* 上传进度 */}
              {(uploading || uploadStatus) && (
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      uploadStatus === 'success' ? 'bg-green-500' :
                      uploadStatus === 'exception' ? 'bg-destructive' : 'bg-primary'
                    }`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

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

          <Button
            onClick={handleSubmit}
            disabled={saving || uploading || !form.firmwareName || !form.type || !form.version || (!editing && !file)}
            className="w-full"
          >
            {saving || uploading ? (
              <><Loader2 size={16} className="mr-1 animate-spin" />保存中...</>
            ) : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}