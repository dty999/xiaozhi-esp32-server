'use client';
/**
 * 字典管理页 — 左右双栏布局
 *
 * 对标旧项目 DictManagement.vue:
 *   左侧：字典类型列表（选中高亮、新增/编辑/批量删除）
 *   右侧：选中类型下的字典数据列表（新增/编辑/删除/批量选择）
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Database, Plus, Pencil, Trash2, Search,
  Check, Square, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function DictsPage() {
  const { token } = useAuthStore();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // ───── 字典类型 ─────
  const [types, setTypes] = useState<any[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [typeSearch, setTypeSearch] = useState('');

  // ───── 字典数据 ─────
  const [dataList, setDataList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(10);
  const [dataTotal, setDataTotal] = useState(0);
  const [selectedDataIds, setSelectedDataIds] = useState<Set<string>>(new Set());
  const [dataDialogOpen, setDataDialogOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>(null);

  // 加载类型列表
  const fetchTypes = async () => {
    setTypesLoading(true);
    try {
      const q = typeSearch ? `&dictType=${typeSearch}` : '';
      const res = await ofetch(`/api/admin/dict/types?limit=100${q}`, { headers: authHeaders });
      if (res.code === 0) {
        setTypes(res.data.list || []);
        if ((res.data.list || []).length > 0) {
          if (!selectedType || !(res.data.list as any[]).find(t => t.id === selectedType.id)) {
            setSelectedType((res.data.list as any[])[0]);
          }
        }
      }
    } catch {}
    setTypesLoading(false);
  };

  // 加载数据列表
  const fetchDataList = async (dictTypeId: string) => {
    if (!dictTypeId) return;
    setDataLoading(true);
    try {
      const res = await ofetch(
        `/api/admin/dict/data?dictTypeId=${dictTypeId}&page=${dataPage}&limit=${dataPageSize}`,
        { headers: authHeaders }
      );
      if (res.code === 0) {
        setDataList(res.data.list || []);
        setDataTotal(res.data.total || 0);
      }
    } catch {}
    setDataLoading(false);
  };

  useEffect(() => { fetchTypes(); }, [typeSearch]);
  useEffect(() => { if (selectedType?.id) fetchDataList(selectedType.id); }, [selectedType?.id, dataPage, dataPageSize]);

  // ───── 类型操作 ─────
  const handleTypeSelect = (t: any) => {
    setSelectedType(t);
    setDataPage(1);
    setSelectedDataIds(new Set());
  };

  const handleDeleteType = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个类型及其数据？`)) return;
    try {
      for (const id of ids) {
        await ofetch(`/api/admin/dict/types?id=${id}`, { method: 'DELETE', headers: authHeaders });
      }
      if (ids.includes(selectedType?.id)) setSelectedType(null);
      setSelectedTypeIds(new Set());
      fetchTypes();
    } catch {}
  };

  // ───── 数据操作 ─────
  const handleDeleteData = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 条数据？`)) return;
    try {
      for (const id of ids) {
        await ofetch(`/api/admin/dict/data?id=${id}`, { method: 'DELETE', headers: authHeaders });
      }
      setSelectedDataIds(new Set());
      if (selectedType?.id) fetchDataList(selectedType.id);
    } catch {}
  };

  const handleSelectAllData = () => {
    if (selectedDataIds.size === dataList.length) setSelectedDataIds(new Set());
    else setSelectedDataIds(new Set(dataList.map((d: any) => d.id)));
  };

  const dataTotalPages = Math.ceil(dataTotal / dataPageSize);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database size={20} strokeWidth={1.8} />字典管理
        </h1>
      </div>

      <div className="flex gap-4 h-[calc(100vh-9rem)]">
        {/* ─── 左侧：字典类型 ─── */}
        <div className="w-64 flex-shrink-0 border rounded-lg bg-card flex flex-col">
          <div className="p-3 border-b space-y-2">
            <div className="flex gap-1">
              <Input
                placeholder="搜索类型..."
                value={typeSearch}
                onChange={e => setTypeSearch(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={() => { setEditingType(null); setTypeDialogOpen(true); }}>
                <Plus size={12} className="mr-1" />新增
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={selectedTypeIds.size === 0}
                onClick={() => handleDeleteType(Array.from(selectedTypeIds))}>
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {typesLoading ? (
              <p className="text-xs text-muted-foreground p-3">加载中...</p>
            ) : types.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">暂无类型</p>
            ) : (
              types.map(t => (
                <div
                  key={t.id}
                  className={`px-3 py-2 cursor-pointer border-b text-sm flex items-center gap-2 transition-colors ${
                    selectedType?.id === t.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                  }`}
                  onClick={() => handleTypeSelect(t)}
                >
                  <button onClick={e => {
                    e.stopPropagation();
                    const next = new Set(selectedTypeIds);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    setSelectedTypeIds(next);
                  }}>
                    {selectedTypeIds.has(t.id)
                      ? <Check size={14} className="text-primary" />
                      : <Square size={14} className="text-muted-foreground" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{t.dictName}</span>
                    <span className="text-xs text-muted-foreground">{t.dictType}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={e => {
                    e.stopPropagation();
                    setEditingType(t); setTypeDialogOpen(true);
                  }}>
                    <Pencil size={12} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── 右侧：字典数据 ─── */}
        <div className="flex-1 border rounded-lg bg-card flex flex-col min-w-0">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedType ? `${selectedType.dictName} 的数据` : '请选择字典类型'}
              </span>
              {selectedType && (
                <span className="text-xs text-muted-foreground">共 {dataTotal} 条</span>
              )}
            </div>
            <div className="flex gap-1">
              {selectedType && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSelectAllData}>
                    {selectedDataIds.size === dataList.length && dataList.length > 0 ? '取消全选' : '全选'}
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setEditingData(null); setDataDialogOpen(true); }}>
                    <Plus size={12} className="mr-1" />新增
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs"
                    disabled={selectedDataIds.size === 0}
                    onClick={() => handleDeleteData(Array.from(selectedDataIds))}>
                    <Trash2 size={12} className="mr-1" />删除
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {!selectedType ? (
              <p className="text-sm text-muted-foreground text-center pt-10">← 请先选择左侧字典类型</p>
            ) : dataLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : dataList.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <div className="space-y-2">
                {dataList.map(d => (
                  <Card key={d.id} className="transition-colors hover:border-primary/15">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button onClick={() => {
                          const next = new Set(selectedDataIds);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          setSelectedDataIds(next);
                        }}>
                          {selectedDataIds.has(d.id)
                            ? <Check size={14} className="text-primary" />
                            : <Square size={14} className="text-muted-foreground" />
                          }
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{d.dictLabel}</span>
                            <span className="text-xs text-muted-foreground">值: {d.dictValue}</span>
                            <span className="text-xs text-muted-foreground">排序: {d.sort}</span>
                          </div>
                          {d.remark && <p className="text-xs text-muted-foreground truncate mt-0.5">备注: {d.remark}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingData(d); setDataDialogOpen(true); }}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteData([d.id])}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          {/* 数据分页 */}
          {selectedType && dataTotalPages > 1 && (
            <div className="p-2 border-t flex items-center justify-center gap-1">
              <Button variant="outline" size="sm" disabled={dataPage <= 1} onClick={() => setDataPage(1)}>首页</Button>
              <Button variant="outline" size="sm" disabled={dataPage <= 1} onClick={() => setDataPage(p => p - 1)} className="h-7 w-7 p-0">
                <ChevronLeft size={14} />
              </Button>
              <span className="text-xs text-muted-foreground px-2">{dataPage} / {dataTotalPages}</span>
              <Button variant="outline" size="sm" disabled={dataPage >= dataTotalPages} onClick={() => setDataPage(p => p + 1)} className="h-7 w-7 p-0">
                <ChevronRight size={14} />
              </Button>
              <select
                value={dataPageSize}
                onChange={e => { setDataPageSize(Number(e.target.value)); setDataPage(1); }}
                className="h-8 rounded border border-input bg-background px-1 text-xs ml-2"
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/页</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 类型对话框 */}
      <DictTypeDialog
        open={typeDialogOpen}
        editing={editingType}
        onClose={() => { setTypeDialogOpen(false); setEditingType(null); }}
        onSaved={() => { setTypeDialogOpen(false); setEditingType(null); fetchTypes(); }}
        authHeaders={authHeaders}
      />

      {/* 数据对话框 */}
      <DictDataDialog
        open={dataDialogOpen}
        editing={editingData}
        dictTypeId={selectedType?.id}
        onClose={() => { setDataDialogOpen(false); setEditingData(null); }}
        onSaved={() => {
          setDataDialogOpen(false); setEditingData(null);
          if (selectedType?.id) fetchDataList(selectedType.id);
        }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 字典类型编辑对话框 */
function DictTypeDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean; editing: any; onClose: () => void; onSaved: () => void; authHeaders: Record<string, string>;
}) {
  const [dictType, setDictType] = useState('');
  const [dictName, setDictName] = useState('');
  const [remark, setRemark] = useState('');
  const [sort, setSort] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setDictType(editing.dictType || '');
      setDictName(editing.dictName || '');
      setRemark(editing.remark || '');
      setSort(editing.sort ?? 0);
    } else {
      setDictType(''); setDictName(''); setRemark(''); setSort(0);
    }
  }, [editing]);

  const handleSubmit = async () => {
    if (!dictType.trim() || !dictName.trim()) return;
    setSaving(true);
    try {
      const body: any = { dictType: dictType.trim(), dictName: dictName.trim(), remark, sort };
      let res: any;
      if (editing?.id) {
        body.id = editing.id;
        res = await ofetch('/api/admin/dict/types', { method: 'PUT', body, headers: authHeaders });
      } else {
        res = await ofetch('/api/admin/dict/types', { method: 'POST', body, headers: authHeaders });
      }
      if (res.code === 0) onSaved();
      else alert(res.msg || '保存失败');
    } catch (e: any) { alert(e.message || '保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑字典类型' : '新增字典类型'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>字典类型编码</Label><Input value={dictType} onChange={e => setDictType(e.target.value)} placeholder="如 FIRMWARE_TYPE" /></div>
          <div className="space-y-1"><Label>字典名称</Label><Input value={dictName} onChange={e => setDictName(e.target.value)} placeholder="如 固件类型" /></div>
          <div className="space-y-1"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注（选填）" /></div>
          <div className="space-y-1"><Label>排序</Label><Input type="number" value={sort} onChange={e => setSort(Number(e.target.value) || 0)} /></div>
          <Button onClick={handleSubmit} disabled={saving || !dictType || !dictName} className="w-full">{saving ? '保存中...' : '保存'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 字典数据编辑对话框 */
function DictDataDialog({ open, editing, dictTypeId, onClose, onSaved, authHeaders }: {
  open: boolean; editing: any; dictTypeId: string | undefined; onClose: () => void; onSaved: () => void; authHeaders: Record<string, string>;
}) {
  const [dictLabel, setDictLabel] = useState('');
  const [dictValue, setDictValue] = useState('');
  const [remark, setRemark] = useState('');
  const [sort, setSort] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setDictLabel(editing.dictLabel || '');
      setDictValue(editing.dictValue || '');
      setRemark(editing.remark || '');
      setSort(editing.sort ?? 0);
    } else {
      setDictLabel(''); setDictValue(''); setRemark(''); setSort(0);
    }
  }, [editing]);

  const handleSubmit = async () => {
    if (!dictLabel.trim() || !dictValue.trim()) return;
    if (!editing && !dictTypeId) { alert('请先选择字典类型'); return; }

    setSaving(true);
    try {
      const body: any = {
        dictLabel: dictLabel.trim(),
        dictValue: dictValue.trim(),
        remark,
        sort,
      };

      let res: any;
      if (editing?.id) {
        body.id = editing.id;
        res = await ofetch('/api/admin/dict/data', { method: 'PUT', body, headers: authHeaders });
      } else {
        body.dictTypeId = dictTypeId;
        res = await ofetch('/api/admin/dict/data', { method: 'POST', body, headers: authHeaders });
      }
      if (res.code === 0) onSaved();
      else alert(res.msg || '保存失败');
    } catch (e: any) { alert(e.message || '保存失败'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑字典数据' : '新增字典数据'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>数据标签</Label><Input value={dictLabel} onChange={e => setDictLabel(e.target.value)} placeholder="显示名称" /></div>
          <div className="space-y-1"><Label>数据值</Label><Input value={dictValue} onChange={e => setDictValue(e.target.value)} placeholder="存储值" /></div>
          <div className="space-y-1"><Label>备注</Label><Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="备注（选填）" /></div>
          <div className="space-y-1"><Label>排序</Label><Input type="number" value={sort} onChange={e => setSort(Number(e.target.value) || 0)} /></div>
          <Button onClick={handleSubmit} disabled={saving || !dictLabel || !dictValue} className="w-full">{saving ? '保存中...' : '保存'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}