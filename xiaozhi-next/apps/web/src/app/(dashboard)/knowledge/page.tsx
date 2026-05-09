'use client';
/**
 * 知识库管理页
 *
 * 对标 Java KnowledgeBaseController:
 *  - GET /datasets         → 知识库列表（搜索、分页）
 *  - POST /datasets        → 创建知识库
 *  - PUT /datasets/{id}    → 编辑知识库
 *  - DELETE /datasets/{id} → 删除知识库
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
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, BookOpen, ExternalLink } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function KnowledgePage() {
  const { token } = useAuthStore();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const router = useRouter();

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const res = await ofetch(`/api/knowledge/datasets?page=1&limit=100&name=${search}`, { headers: authHeaders });
      if (res.code === 0) setDatasets(res.data.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [search]);

  const handleEdit = (kb: any) => {
    setEditing(kb);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此知识库？所有文档将被删除。')) return;
    try {
      await ofetch(`/api/knowledge/datasets/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchData();
    } catch { /* 容错 */ }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen size={24} />知识库
        </h1>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={16} className="mr-1" />创建知识库
        </Button>
      </div>

      <Input
        placeholder="搜索知识库..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : datasets.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无知识库</p>
      ) : (
        <div className="space-y-3">
          {datasets.map((kb: any) => (
            <Card key={kb.id} className="hover:shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{kb.name}</span>
                    {kb.documentCount !== undefined && (
                      <Badge variant="secondary">{kb.documentCount} 文档</Badge>
                    )}
                    {kb.chunkCount !== undefined && kb.chunkCount > 0 && (
                      <Badge variant="outline">{kb.chunkCount} 切片</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {kb.description || '无描述'}
                    {kb.embeddingModel ? ` · ${kb.embeddingModel}` : ''}
                    {kb.chunkMethod ? ` · ${kb.chunkMethod}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/knowledge/${kb.id}/documents`)}
                  >
                    <ExternalLink size={14} className="mr-1" />文档
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(kb)}
                  >
                    <Pencil size={14} className="mr-1" />编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(kb.id)}
                    className="text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 创建/编辑 对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑' : '创建'}知识库</DialogTitle>
          </DialogHeader>
          <KbForm
            editing={editing}
            onSuccess={() => {
              setDialogOpen(false);
              fetchData();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 知识库创建/编辑表单
 *
 * 对标 Java KnowledgeBaseController.save / update
 */
function KbForm({
  editing,
  onSuccess,
}: {
  editing: any;
  onSuccess: () => void;
}) {
  const { token } = useAuthStore();
  const [name, setName] = useState(editing?.name || '');
  const [desc, setDesc] = useState(editing?.description || '');
  const [ragModelId, setRagModelId] = useState(editing?.ragModelId?.toString() || '');
  const [embeddingModel, setEmbeddingModel] = useState(editing?.embeddingModel || '');
  const [chunkMethod, setChunkMethod] = useState(editing?.chunkMethod || '');
  const [loading, setLoading] = useState(false);
  const [ragModels, setRagModels] = useState<any[]>([]);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 加载 RAG 模型列表
  useEffect(() => {
    ofetch('/api/knowledge/datasets/rag-models', { headers: authHeaders })
      .then((res) => {
        if (res.code === 0) setRagModels(res.data || []);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    const body: any = {
      name,
      description: desc,
      ragModelId,
      embeddingModel: embeddingModel || undefined,
      chunkMethod: chunkMethod || undefined,
    };
    try {
      if (editing?.id) {
        await ofetch(`/api/knowledge/datasets/${editing.id}`, {
          method: 'PUT',
          body,
          headers: authHeaders,
        });
      } else {
        await ofetch('/api/knowledge/datasets', {
          method: 'POST',
          body,
          headers: authHeaders,
        });
      }
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>名称</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>描述</Label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
      </div>
      <div className="space-y-1">
        <Label>RAG 模型</Label>
        <select
          value={ragModelId}
          onChange={(e) => setRagModelId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">请选择 RAG 模型</option>
          {ragModels.map((m: any) => (
            <option key={m.id.toString()} value={m.id.toString()}>
              {m.modelName || m.modelCode}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>嵌入模型</Label>
        <Input
          value={embeddingModel}
          onChange={(e) => setEmbeddingModel(e.target.value)}
          placeholder="如 BAAI/bge-large-zh-v1.5"
        />
      </div>
      <div className="space-y-1">
        <Label>分块方法</Label>
        <Input
          value={chunkMethod}
          onChange={(e) => setChunkMethod(e.target.value)}
          placeholder="如 naive / knowledge_graph / manual"
        />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={loading || !name || !ragModelId}
        className="w-full"
      >
        {loading ? '保存中...' : editing ? '更新' : '创建'}
      </Button>
    </div>
  );
}
