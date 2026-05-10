'use client';
/**
 * 参数管理页
 *
 * 对标旧项目 ParamsManagement.vue + ParamDialog.vue:
 *   - 表格列：选择框、参数编码、参数值（敏感参数显隐控制）、值类型、备注、操作
 *   - 搜索（按参数编码）
 *   - 分页（每页条数选择）
 *   - 批量选择删除
 *   - 新增/编辑对话框：
 *     - 参数编码（必填）
 *     - 值类型（string/number/boolean/array/json）
 *     - 参数值（根据类型切换输入框/文本域；array按行编辑；json格式化显示）
 *     - 备注
 *   - 敏感参数值显隐切换（令牌/密钥等）
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
  Settings, Search, Trash2, ChevronLeft, ChevronRight,
  Check, Square, Plus, Pencil, Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

const VALUE_TYPE_MAP: Record<number, string> = {
  0: 'string',
  1: 'number',
  2: 'boolean',
  3: 'array',
  4: 'json',
};

const VALUE_TYPE_OPTIONS = [
  { value: 0, label: 'string' },
  { value: 1, label: 'number' },
  { value: 2, label: 'boolean' },
  { value: 3, label: 'array' },
  { value: 4, label: 'json' },
];

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** 参数值类型名称 */
function valueTypeName(vt: number | null | undefined): string {
  if (vt === null || vt === undefined) return '-';
  return VALUE_TYPE_MAP[vt] || `类型${vt}`;
}

export default function ParamsPage() {
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
      const res = await ofetch(`/api/admin/params?page=${page}&limit=${pageSize}&paramCode=${keyword}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, pageSize, keyword]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个参数？`)) return;
    try {
      for (const id of ids) {
        await ofetch(`/api/admin/params/${id}`, { method: 'DELETE', headers: authHeaders });
      }
      setSelectedIds(new Set());
      fetchData();
    } catch { /* 容错 */ }
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

  /** 敏感参数值遮盖 */
  function maskValue(val: string): string {
    if (!val || val.length <= 4) return '****';
    return val.slice(0, 2) + '****' + val.slice(-2);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings size={24} />参数管理
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 size={14} className="mr-1" />删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={16} className="mr-1" />新增参数
          </Button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索参数编码..."
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
          className="max-w-xs"
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
        <p className="text-muted-foreground text-sm">暂无参数</p>
      ) : (
        <div className="space-y-2">
          {data.map((row: any) => (
            <ParamCard
              key={row.id}
              row={row}
              selected={selectedIds.has(row.id)}
              onToggleSelect={() => handleSelectOne(row.id)}
              onEdit={() => { setEditing(row); setDialogOpen(true); }}
              onDelete={() => handleDelete([row.id])}
              maskValue={maskValue}
            />
          ))}
        </div>
      )}

      {/* 分页 */}
      <div className="flex items-center justify-between mt-4">
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
      <ParamDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 单条参数卡片 */
function ParamCard({ row, selected, onToggleSelect, onEdit, onDelete, maskValue }: {
  row: any;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  maskValue: (v: string) => string;
}) {
  const [showSensitive, setShowSensitive] = useState(false);
  const isSensitive = row.isSensitive;
  const displayValue = isSensitive && !showSensitive ? maskValue(row.paramValue) : row.paramValue;

  return (
    <Card className="hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={onToggleSelect} className="flex-shrink-0">
              {selected
                ? <Check size={16} className="text-primary" />
                : <Square size={16} className="text-muted-foreground" />
              }
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium font-mono text-sm">{row.paramCode}</span>
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                  {valueTypeName(row.valueType)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground break-all max-w-md line-clamp-2">
                  值: {displayValue || '(空)'}
                </span>
                {isSensitive && (
                  <button
                    onClick={() => setShowSensitive(!showSensitive)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    title={showSensitive ? '隐藏' : '显示'}
                  >
                    {showSensitive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
              {row.remark && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">备注: {row.remark}</p>
              )}
            </div>
          </div>

          <div className="flex gap-1 ml-4 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil size={14} />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** 参数编辑对话框 */
function ParamDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean;
  editing: any;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: Record<string, string>;
}) {
  const [paramCode, setParamCode] = useState('');
  const [valueType, setValueType] = useState(0);
  const [paramValue, setParamValue] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 编辑/新增时填充
  useEffect(() => {
    if (editing) {
      setParamCode(editing.paramCode || '');
      const vt = editing.valueType ?? 0;
      setValueType(vt);
      let val = editing.paramValue || '';
      // array类型：分号→换行；json类型：格式化
      if (vt === 3 && val.includes(';')) {
        val = val.split(';').filter(Boolean).join(';\n');
      } else if (vt === 4) {
        try { val = JSON.stringify(JSON.parse(val), null, 2); } catch {}
      }
      setParamValue(val);
      setRemark(editing.remark || '');
    } else {
      setParamCode('');
      setValueType(0);
      setParamValue('');
      setRemark('');
    }
    setError('');
  }, [editing]);

  const handleSubmit = async () => {
    if (!paramCode.trim()) { setError('请输入参数编码'); return; }
    if (!paramValue.trim()) { setError('请输入参数值'); return; }

    let finalValue = paramValue;
    // 校验并转换 array 类型
    if (valueType === 3) {
      const lines = paramValue.split('\n').filter(l => l.trim());
      for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i].trim().endsWith(';')) {
          setError(`第 ${i + 1} 行数组格式错误，每行需以英文分号结尾（最后一行除外）`);
          return;
        }
      }
      finalValue = lines.map(l => l.trim().replace(/;$/, '')).filter(Boolean).join(';');
    }
    // 校验并压缩 json 类型
    if (valueType === 4) {
      try {
        finalValue = JSON.stringify(JSON.parse(paramValue));
      } catch {
        setError('JSON 格式错误，请检查');
        return;
      }
    }

    setError('');
    setSaving(true);
    try {
      const body = { paramCode: paramCode.trim(), paramValue: finalValue, valueType, remark: remark.trim() || null };

      let res: any;
      if (editing?.id) {
        res = await ofetch(`/api/admin/params/${editing.id}`, { method: 'PUT', body, headers: authHeaders });
      } else {
        res = await ofetch('/api/admin/params', { method: 'POST', body, headers: authHeaders });
      }
      if (res.code === 0) onSaved();
      else setError(res.msg || '保存失败');
    } catch (e: any) {
      setError(e.message || '保存失败');
    }
    setSaving(false);
  };

  const isComplexType = valueType === 3 || valueType === 4;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑参数' : '新增参数'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 参数编码 */}
          <div className="space-y-1">
            <Label>参数编码 <span className="text-destructive">*</span></Label>
            <Input value={paramCode} onChange={e => { setParamCode(e.target.value); setError(''); }}
              placeholder="如 server.port" />
          </div>

          {/* 值类型 */}
          <div className="space-y-1">
            <Label>值类型 <span className="text-destructive">*</span></Label>
            <select
              value={valueType}
              onChange={e => { setValueType(Number(e.target.value)); setError(''); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {VALUE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 参数值 */}
          <div className="space-y-1">
            <Label>参数值 <span className="text-destructive">*</span></Label>
            {isComplexType ? (
              <Textarea
                value={paramValue}
                onChange={e => { setParamValue(e.target.value); setError(''); }}
                placeholder={valueType === 3 ? '每行一条，英文分号结尾\n如：item1;\nitem2;' : '输入 JSON'}
                rows={8}
                className="font-mono text-sm"
              />
            ) : (
              <Input
                value={paramValue}
                onChange={e => { setParamValue(e.target.value); setError(''); }}
                placeholder="输入参数值"
              />
            )}
            {valueType === 3 && (
              <p className="text-xs text-blue-600">每行一条，除最后一行外每行以英文分号结尾</p>
            )}
          </div>

          {/* 备注 */}
          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="输入备注"
              rows={2}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={saving || !paramCode.trim() || !paramValue.trim()} className="w-full">
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}