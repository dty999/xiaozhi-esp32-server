'use client';
/**
 * 模型配置页
 *
 * 对标原 Vue 2 /model-config 页面。
 * 左侧模型类型切换，右侧数据表格，支持增删改。
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

const MODEL_TYPES = ['ASR', 'VAD', 'LLM', 'TTS', 'Memory', 'Intent', 'VLLM', 'SLM'] as const;

interface ModelConfig {
  id: string;
  modelType: string;
  modelCode: string;
  modelName: string;
  isDefault: number;
  isEnabled: number;
  configJson: any;
  docLink: string | null;
  sort: number;
}

export default function ModelsPage() {
  const [activeType, setActiveType] = useState<string>('LLM');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/models?modelType=${activeType}&limit=100`);
      if (res.code === 0) setModels(res.data.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchModels(); // eslint-disable-next-line
  }, [activeType]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try { await ofetch(`/api/models/${id}`, { method: 'DELETE' }); fetchModels(); } catch { /* */ }
  };

  const handleToggleDefault = async (id: string) => {
    try { await ofetch(`/api/models/${id}/default`, { method: 'PUT' }); fetchModels(); } catch { /* */ }
  };

  const handleToggleEnabled = async (id: string, current: number) => {
    const newStatus = current === 1 ? 0 : 1;
    try { await ofetch(`/api/models/${id}/enable/${newStatus}`, { method: 'PUT' }); fetchModels(); } catch { /* */ }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">模型配置</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-1" />新增模型</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? '编辑模型' : '新增模型'}</DialogTitle></DialogHeader>
            <ModelForm
              initial={editing}
              modelType={activeType}
              onSuccess={() => { setDialogOpen(false); setEditing(null); fetchModels(); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* 类型选择 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {MODEL_TYPES.map(t => (
          <Button
            key={t}
            variant={activeType === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveType(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      {/* 模型列表 */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground text-sm py-4">加载中...</p>
        ) : models.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">暂无 {activeType} 模型配置</p>
        ) : (
          models.map(m => (
            <Card key={m.id} className="hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.modelName}</span>
                      <span className="text-xs text-muted-foreground">{m.modelCode}</span>
                      {m.isDefault === 1 && <Badge variant="default" className="text-xs">默认</Badge>}
                      {m.isEnabled === 1
                        ? <Check size={14} className="text-green-500" />
                        : <X size={14} className="text-destructive" />}
                    </div>
                    {m.docLink && <p className="text-xs text-muted-foreground mt-1">{m.docLink}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleToggleDefault(m.id)} title="设为默认">
                      {m.isDefault === 1 ? '默认' : '设默认'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleEnabled(m.id, m.isEnabled)} title="启用/禁用">
                      {m.isEnabled === 1 ? '禁用' : '启用'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setDialogOpen(true); }}>
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(m.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

/** 模型编辑表单 */
function ModelForm({ initial, modelType, onSuccess }: { initial: any; modelType: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    modelCode: initial?.modelCode || '',
    modelName: initial?.modelName || '',
    configJson: initial?.configJson ? JSON.stringify(initial.configJson, null, 2) : '',
    docLink: initial?.docLink || '',
    remark: initial?.remark || '',
    isDefault: initial?.isDefault || 0,
    isEnabled: initial?.isEnabled ?? 1,
  });

  const handleSubmit = async () => {
    const body = { ...form, modelType, configJson: form.configJson ? JSON.parse(form.configJson) : null };
    if (initial?.id) {
      await ofetch(`/api/models/${modelType}/${initial.modelCode}/${initial.id}`, { method: 'PUT', body });
    } else {
      await ofetch(`/api/models/${modelType}/${form.modelCode}`, { method: 'POST', body });
    }
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1"><Label>模型编码</Label><Input value={form.modelCode} onChange={e => setForm({...form, modelCode: e.target.value})} /></div>
      <div className="space-y-1"><Label>模型名称</Label><Input value={form.modelName} onChange={e => setForm({...form, modelName: e.target.value})} /></div>
      <div className="space-y-1"><Label>文档链接</Label><Input value={form.docLink} onChange={e => setForm({...form, docLink: e.target.value})} /></div>
      <div className="space-y-1"><Label>配置 JSON</Label><Textarea value={form.configJson} onChange={e => setForm({...form, configJson: e.target.value})} rows={5} className="font-mono text-xs" /></div>
      <div className="flex gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault === 1} onChange={e => setForm({...form, isDefault: e.target.checked ? 1 : 0})} /> 设为默认</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isEnabled === 1} onChange={e => setForm({...form, isEnabled: e.target.checked ? 1 : 0})} /> 启用</label>
      </div>
      <Button onClick={handleSubmit} className="w-full">保存</Button>
    </div>
  );
}
