'use client';
/**
 * 模型配置页面
 * 对标原 Vue 2 /model-config 页面。 * 左侧模型类型切换，右侧数据表格，支持增删改。 * 新增/编辑时，根据选择的供应商动态渲染配置表单。 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

const MODEL_TYPES = ['ASR', 'VAD', 'LLM', 'TTS', 'Memory', 'Intent', 'VLLM', 'SLM', 'RAG'] as const;

/** 字段定义（对应 ModelProvider.fields 的 JSON Schema） */
interface FieldSchema {
  type: 'string' | 'number' | 'boolean';
  label: string;
  placeholder?: string;
  default?: any;
  required?: boolean;
  secret?: boolean; // 是否加密显示
  options?: { label: string; value: string }[]; // 下拉选项
}

/** 供应商 */
interface Provider {
  id: string;
  providerCode: string;
  name: string;
  modelType: string;
  fields: Record<string, FieldSchema> | null;
  sort: number;
}

/** 模型配置 */
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
  const { token } = useAuthStore();
  const [activeType, setActiveType] = useState<string>('LLM');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/models?modelType=${activeType}&limit=100`, { headers: authHeaders });
      if (res.code === 0) setModels(res.data.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, [activeType, token]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try { await ofetch(`/api/models/${id}`, { method: 'DELETE', headers: authHeaders }); fetchModels(); } catch { /* */ }
  };

  const handleToggleDefault = async (id: string) => {
    try { await ofetch(`/api/models/${id}/default`, { method: 'PUT', headers: authHeaders }); fetchModels(); } catch { /* */ }
  };

  const handleToggleEnabled = async (id: string, current: number) => {
    const newStatus = current === 1 ? 0 : 1;
    try { await ofetch(`/api/models/${id}/enable/${newStatus}`, { method: 'PUT', headers: authHeaders }); fetchModels(); } catch { /* */ }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold">模型配置</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-1" />新增模型</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
      <div className="flex gap-1.5 mb-4 flex-wrap">
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
      <div className="space-y-2">
        {loading ? (
          <p className="text-muted-foreground text-sm py-4">加载中...</p>
        ) : models.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">暂无 {activeType} 模型配置</p>
        ) : (
          models.map(m => (
            <Card key={m.id} className="transition-colors hover:border-primary/15">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.modelName}</span>
                      <span className="text-xs text-muted-foreground">{m.modelCode}</span>
                      {m.isDefault === 1 && <Badge variant="default" className="text-xs">默认</Badge>}
                      {m.isEnabled === 1
                        ? <Check size={14} className="text-emerald-500" />
                        : <X size={14} className="text-destructive" />}
                    </div>
                    {m.docLink && <p className="text-xs text-muted-foreground mt-1">{m.docLink}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleToggleDefault(m.id)} title="设为默认">
                      {m.isDefault === 1 ? '默认' : '取消默认'}
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
  const { token } = useAuthStore();
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [basicInfo, setBasicInfo] = useState({
    modelCode: initial?.modelCode || '',
    modelName: initial?.modelName || '',
    docLink: initial?.docLink || '',
    remark: initial?.remark || '',
    isDefault: initial?.isDefault || 0,
    isEnabled: initial?.isEnabled ?? 1,
  });

  // 配置 JSON（直接编辑文本）
  const [configJsonText, setConfigJsonText] = useState(
    initial?.configJson ? JSON.stringify(initial.configJson, null, 2) : ''
  );

  // 供应商相关的
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // 加载供应商列表
  useEffect(() => {
    setLoadingProviders(true);
    ofetch(`/api/models/${modelType}/providers`, { headers: authHeaders })
      .then((res: any) => { if (res.code === 0) setProviders(res.data || []); })
      .catch(() => {})
      .finally(() => setLoadingProviders(false));
  }, [modelType]);

  // 编辑/新增时同步
  useEffect(() => {
    if (initial) {
      setBasicInfo({
        modelCode: initial.modelCode || '',
        modelName: initial.modelName || '',
        docLink: initial.docLink || '',
        remark: initial.remark || '',
        isDefault: initial.isDefault || 0,
        isEnabled: initial.isEnabled ?? 1,
      });
      setConfigJsonText(initial.configJson ? JSON.stringify(initial.configJson, null, 2) : '');
    } else {
      setBasicInfo({ modelCode: '', modelName: '', docLink: '', remark: '', isDefault: 0, isEnabled: 1 });
      setConfigJsonText('');
    }
  }, [initial]);

  // 选择供应商时，自动填充 fields JSON
  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider?.fields) {
      const fieldsObj = typeof provider.fields === 'string' ? JSON.parse(provider.fields) : provider.fields;
      setConfigJsonText(JSON.stringify(fieldsObj, null, 2));
      // 自动补全 modelCode
      if (basicInfo.modelCode && !basicInfo.modelCode.includes('/')) {
        setBasicInfo(prev => ({ ...prev, modelCode: `${provider.providerCode}/${prev.modelCode}` }));
      }
    }
  };

  const handleSubmit = async () => {
    let configJson = null;
    if (configJsonText.trim()) {
      try { configJson = JSON.parse(configJsonText); } catch { alert('配置 JSON 格式错误，请检查'); return; }
    }

    const body = { ...basicInfo, modelType, configJson };

    try {
      if (initial?.id) {
        await ofetch(`/api/models/${initial.id}`, { method: 'PUT', body, headers: authHeaders });
      } else {
        await ofetch('/api/models', { method: 'POST', body, headers: authHeaders });
      }
      onSuccess();
    } catch { /* */ }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>模型编码</Label>
        <Input value={basicInfo.modelCode} onChange={e => setBasicInfo({...basicInfo, modelCode: e.target.value})} placeholder="如 openai/gpt-4o-mini" />
      </div>
      <div className="space-y-1">
        <Label>模型名称</Label>
        <Input value={basicInfo.modelName} onChange={e => setBasicInfo({...basicInfo, modelName: e.target.value})} placeholder="显示名称" />
      </div>

      {/* 供应商选择（新增模式） */}
      {!initial && (
        <div className="space-y-1">
          <Label>供应商</Label>
          {loadingProviders ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              暂无可用的供应商，请先去<Link href="/providers" className="text-primary hover:underline">供应商管理</Link> 添加
            </p>
          ) : (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-none"
              value=""
              onChange={e => handleProviderChange(e.target.value)}
            >
              <option value="">请选择供应商</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.providerCode})</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* 配置 JSON 文本域 */}
      <div className="space-y-1">
        <Label>配置 JSON</Label>
        <Textarea
          value={configJsonText}
          onChange={e => setConfigJsonText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder='{"api_key": "sk-xxx", "api_url": "https://..."}'
        />
      </div>

      <div className="space-y-1">
        <Label>文档链接</Label>
        <Input value={basicInfo.docLink} onChange={e => setBasicInfo({...basicInfo, docLink: e.target.value})} placeholder="可选" />
      </div>
      <div className="space-y-1">
        <Label>备注</Label>
        <Textarea value={basicInfo.remark} onChange={e => setBasicInfo({...basicInfo, remark: e.target.value})} rows={2} placeholder="可选" />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={basicInfo.isDefault === 1} onChange={e => setBasicInfo({...basicInfo, isDefault: e.target.checked ? 1 : 0})} /> 设为默认
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={basicInfo.isEnabled === 1} onChange={e => setBasicInfo({...basicInfo, isEnabled: e.target.checked ? 1 : 0})} /> 启用
        </label>
      </div>

      <Button onClick={handleSubmit} className="w-full">保存</Button>
    </div>
  );
}
