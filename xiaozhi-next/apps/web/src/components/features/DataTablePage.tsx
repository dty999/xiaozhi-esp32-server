'use client';
/**
 * 通用数据表格页面模板 — 用于用户/参数/字典/模板/替换词/OTA/音色 等管理页面
 *
 * 此文件作为所有 CRUD 管理页面的共享逻辑抽取。
 * 每个具体页面通过参数配置列定义和 API 端点即可复用。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export interface TableCol {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
}

/** 表单字段类型 */
export type FormFieldType = 'text' | 'textarea' | 'number' | 'select';

/** 表单字段定义 */
export interface FormField {
  key: string;
  label: string;
  type?: FormFieldType;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  /** 提交时的值类型：string | number，默认为 string */
  valueType?: 'string' | 'number';
}

interface DataTableProps {
  title: string;
  apiBase: string;
  columns: TableCol[];
  searchPlaceholder?: string;
  formFields?: FormField[];
  rowActions?: (row: any, refresh: () => void) => React.ReactNode;
  /** 创建成功后的回调，参数为创建后的数据 */
  onCreated?: (row: any) => void;
  /** 详情页 URL 模式，{id} 会被替换为行 ID。设置后编辑按钮点击跳转到详情页 */
  detailUrl?: string;
}

export function DataTablePage({
  title, apiBase, columns, searchPlaceholder = '搜索...', formFields, rowActions, onCreated, detailUrl,
}: DataTableProps) {
  const router = useRouter();
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
      const res = await ofetch(`${apiBase}?page=${page}&limit=${limit}&keyword=${keyword}`, { headers: authHeaders });
      if (res.code === 0) { setData(res.data.list || []); setTotal(res.data.total || 0); }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, keyword]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try { await ofetch(`${apiBase}/${id}`, { method: 'DELETE', headers: authHeaders }); fetchData(); } catch { /* */ }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={16} className="mr-1" />新增
          </Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? '编辑' : '新增'}{title}</DialogTitle></DialogHeader>
            <CrudForm fields={formFields || []} editing={editing} apiBase={apiBase} onSuccess={(result: any) => { setDialogOpen(false); fetchData(); if (onCreated && !editing && result) { onCreated(result); } }} />
          </DialogContent>
        </Dialog>
      </div>

      <Input placeholder={searchPlaceholder} value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} className="mb-4 max-w-md" />

      {loading ? <p className="text-muted-foreground text-sm">加载中...</p>
      : data.length === 0 ? <p className="text-muted-foreground text-sm">暂无数据</p>
      : (
        <div className="space-y-2">
          {data.map((row: any) => (
            <Card key={row.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                    {columns.map(col => (
                      <div key={col.key}>
                        <span className="text-muted-foreground text-xs">{col.label}: </span>
                        <span>{col.render ? col.render(row[col.key], row) : (row[col.key]?.toString() || '-')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    {rowActions ? rowActions(row, fetchData) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (detailUrl) { router.push(detailUrl.replace('{id}', row.id)); }
                          else { setEditing(row); setDialogOpen(true); }
                        }}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

/** 通用表单 */
function CrudForm({ fields, editing, apiBase, onSuccess }: { fields: FormField[]; editing: any; apiBase: string; onSuccess: (result?: any) => void }) {
  const { token } = useAuthStore();
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (editing) {
      const init: Record<string, string> = {};
      fields.forEach(f => {
        const raw = editing[f.key];
        if (raw === null || raw === undefined) {
          init[f.key] = '';
        } else if (typeof raw === 'object') {
          init[f.key] = JSON.stringify(raw);
        } else {
          init[f.key] = String(raw);
        }
      });
      setForm(init);
    } else {
      const init: Record<string, string> = {};
      fields.forEach(f => { init[f.key] = ''; });
      setForm(init);
    }
  }, [editing, fields]);

  /** 根据字段类型转换表单值后提交 */
  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 根据 valueType 转换值
      const body: Record<string, any> = {};
      fields.forEach(f => {
        const raw = form[f.key];
        if (f.valueType === 'number') {
          body[f.key] = raw === '' ? null : Number(raw);
        } else {
          body[f.key] = raw;
        }
      });

      let result: any = null;
      if (editing?.id) {
        await ofetch(`${apiBase}/${editing.id}`, { method: 'PUT', body, headers: authHeaders });
      } else {
        result = await ofetch(apiBase, { method: 'POST', body, headers: authHeaders });
      }
      onSuccess(result);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {fields.map(f => (
        <div key={f.key} className="space-y-1">
          <Label>{f.label}</Label>
          {f.type === 'textarea' ? (
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form[f.key] || ''}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              rows={3}
            />
          ) : f.type === 'select' ? (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form[f.key] || ''}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
            >
              <option value="">{f.placeholder || '请选择'}</option>
              {f.options?.map(opt => (
                <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
              ))}
            </select>
          ) : f.type === 'number' ? (
            <Input
              type="number"
              value={form[f.key] || ''}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
            />
          ) : (
            <Input
              value={form[f.key] || ''}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={loading} className="w-full">{loading ? '保存中...' : '保存'}</Button>
    </div>
  );
}
