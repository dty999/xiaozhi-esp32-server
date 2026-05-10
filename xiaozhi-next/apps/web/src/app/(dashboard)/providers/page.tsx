'use client';
/**
 * 供应器管理页
 *
 * 对标旧项目 ProviderManagement.vue:
 *   - 模型类型下拉过滤 + 名称搜索
 *   - 表格：选择框、类型(tag)、编码、名称、字段配置(popover)、排序、操作
 *   - 批量选择/删除
 *   - 分页
 *   - 新增/编辑对话框：名称、类型、编码、字段定义(JSON)、排序
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Package, Plus, Pencil, Trash2, Search, Eye,
  ChevronLeft, ChevronRight, Check, Square,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

const MODEL_TYPES = ['ASR', 'VAD', 'LLM', 'TTS', 'Memory', 'Intent', 'VLLM', 'SLM', 'RAG'];
const SENSITIVE_KEYS = ['api_key', 'token', 'secret', 'password', 'private'];

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k));
}

export default function ProvidersPage() {
  const { token } = useAuthStore();
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [modelType, setModelType] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/models/providers?page=${page}&limit=${pageSize}`;
      if (keyword) url += `&providerCode=${keyword}`;
      const res = await ofetch(url, { headers: authHeaders });
      if (res.code === 0) {
        let list = (res.data.list || []).filter((p: any) => !modelType || p.modelType === modelType);
        setData(list);
        setTotal(res.data.total || 0);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, pageSize, keyword, modelType]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个供应器？`)) return;
    try {
      for (const id of ids) {
        await ofetch(`/api/models/providers/${id}`, { method: 'DELETE', headers: authHeaders });
      }
      setSelectedIds(new Set());
      fetchData();
    } catch {}
  };

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package size={24} />供应器管理
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 size={14} className="mr-1" />删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={16} className="mr-1" />新增供应器
          </Button>
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索编码或名称..."
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <select
          value={modelType}
          onChange={e => { setModelType(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">全部类型</option>
          {MODEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline" onClick={fetchData}>
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
        <p className="text-muted-foreground text-sm">暂无供应器</p>
      ) : (
        <div className="space-y-2">
          {data.map(row => {
            let fields: Record<string, any> = {};
            try { fields = typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || {}); } catch {}
            const fieldEntries = Object.entries(fields);

            return (
              <Card key={row.id} className="hover:shadow-sm">
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
                          <span className="font-medium">{row.name}</span>
                          <Badge variant="secondary" className="text-xs">{row.modelType}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>编码: {row.providerCode}</span>
                          <span>排序: {row.sort ?? '-'}</span>
                        </div>
                        {/* 字段配置 popover */}
                        {fieldEntries.length > 0 && (
                          <div className="mt-1 group relative inline-block">
                            <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                              <Eye size={12} />查看字段配置 ({fieldEntries.length})
                            </button>
                            <div className="hidden group-hover:block absolute z-10 left-0 top-5 bg-popover border rounded-lg shadow-lg p-3 min-w-[280px] max-w-md">
                              {fieldEntries.map(([key, val]: [string, any]) => (
                                <div key={key} className="flex items-center gap-2 text-xs py-0.5 border-b last:border-0">
                                  <span className="font-medium">{key}:</span>
                                  <span className="text-muted-foreground">{val?.type || typeof val}</span>
                                  {isSensitiveKey(key) && (
                                    <span className="text-orange-500 text-xs ml-auto">敏感</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-4 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setDialogOpen(true); }}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete([row.id])}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>末页</Button>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded border border-input bg-background px-1 text-xs ml-2"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/页</option>)}
          </select>
        </div>
      )}

      {/* 对话框 */}
      <ProviderDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

function ProviderDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean; editing: any; onClose: () => void; onSaved: () => void; authHeaders: Record<string, string>;
}) {
  const [name, setName] = useState('');
  const [modelType, setModelType] = useState('LLM');
  const [providerCode, setProviderCode] = useState('');
  const [fields, setFields] = useState('{}');
  const [sort, setSort] = useState(0);
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name || '');
      setModelType(editing.modelType || 'LLM');
      setProviderCode(editing.providerCode || '');
      setFields(typeof editing.fields === 'string' ? editing.fields : JSON.stringify(editing.fields || {}, null, 2));
      setSort(editing.sort ?? 0);
      setRemark(editing.remark || '');
    } else {
      setName(''); setModelType('LLM'); setProviderCode('');
      setFields('{}'); setSort(0); setRemark('');
    }
    setError('');
  }, [editing]);

  const handleSubmit = async () => {
    if (!name.trim() || !providerCode.trim()) { setError('名称和编码不能为空'); return; }
    let fieldsObj: any = {};
    try { fieldsObj = JSON.parse(fields); } catch { setError('字段定义 JSON 格式错误'); return; }

    setSaving(true);
    try {
      const body: any = { name: name.trim(), modelType, providerCode: providerCode.trim(), fields: fieldsObj, sort, remark };
      let res: any;
      if (editing?.id) {
        res = await ofetch(`/api/models/providers/${editing.id}`, { method: 'PUT', body, headers: authHeaders });
      } else {
        res = await ofetch('/api/models/providers', { method: 'POST', body, headers: authHeaders });
      }
      if (res.code === 0) onSaved();
      else setError(res.msg || '保存失败');
    } catch (e: any) { setError(e.message || '保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? '编辑供应器' : '新增供应器'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>名称</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="显示名称" /></div>
          <div className="space-y-1">
            <Label>模型类型</Label>
            <select value={modelType} onChange={e => setModelType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {MODEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>供应商编码</Label><Input value={providerCode} onChange={e => setProviderCode(e.target.value)} placeholder="如 openai, doubao" /></div>
          <div className="space-y-1">
            <Label>字段定义 (JSON)</Label>
            <Textarea value={fields} onChange={e => setFields(e.target.value)}
              rows={5} className="font-mono text-xs"
              placeholder={'{"api_key": {"type": "string", "label": "API Key", "secret": true}}'} />
          </div>
          <div className="flex gap-2">
            <div className="space-y-1 flex-1"><Label>排序</Label><Input type="number" value={sort} onChange={e => setSort(Number(e.target.value) || 0)} /></div>
            <div className="space-y-1 flex-1"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注" /></div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleSubmit} disabled={saving || !name || !providerCode} className="w-full">
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}