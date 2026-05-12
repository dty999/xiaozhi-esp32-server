'use client';
/**
 * 知识库管理页
 *
 * 对标 Java KnowledgeBaseController:
 *  - GET /datasets         → 知识库列表（搜索、分页）
 *  - POST /datasets        → 创建知识库
 *  - PUT /datasets/{id}    → 编辑知识库
 *  - DELETE /datasets/{id} → 删除知识库
 *
 * 文档管理、切片查看均以弹框形式嵌入，无需跳转页面。
 */

import { useEffect, useState, useRef } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Pencil, Trash2, BookOpen, FileText,
  Upload, Play, Search, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

// ─────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────
export default function KnowledgePage() {
  const { token } = useAuthStore();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formKey, setFormKey] = useState(0);

  // 文档弹框
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsKbId, setDocsKbId] = useState<string>('');
  const [docsKbName, setDocsKbName] = useState<string>('');

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
    setFormKey(k => k + 1);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此知识库？所有文档将被删除。')) return;
    try {
      await ofetch(`/api/knowledge/datasets/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleOpenDocs = (kb: any) => {
    setDocsKbId(kb.id);
    setDocsKbName(kb.name);
    setDocsDialogOpen(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen size={20} strokeWidth={1.8} />知识库
        </h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormKey(k => k + 1);
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
        className="mb-4 max-w-sm h-8"
      />

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : datasets.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无知识库</p>
      ) : (
        <div className="space-y-2">
          {datasets.map((kb: any) => (
            <Card key={kb.id} className="transition-colors hover:border-primary/15">
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
                    onClick={() => handleOpenDocs(kb)}
                  >
                    <FileText size={14} className="mr-1" />文档
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

      {/* 创建/编辑 知识库弹框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑' : '创建'}知识库</DialogTitle>
          </DialogHeader>
          <KbForm
            key={formKey}
            editing={editing}
            onSuccess={() => {
              setDialogOpen(false);
              fetchData();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 文档管理弹框 */}
      <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{docsKbName} — 文档管理</DialogTitle>
          </DialogHeader>
          {docsKbId && (
            <DocumentsPanel kbId={docsKbId} authHeaders={authHeaders} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────
// 知识库创建/编辑表单
// ─────────────────────────────────────────
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

// ─────────────────────────────────────────
// 文档管理面板（嵌入弹框）
// ─────────────────────────────────────────
function DocumentsPanel({ kbId, authHeaders }: { kbId: string; authHeaders: Record<string, string> }) {
  const [kb, setKb] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [keywords, setKeywords] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalResult, setRetrievalResult] = useState<any>(null);
  const [retrieving, setRetrieving] = useState(false);

  // 切片子弹框
  const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
  const [chunksDocId, setChunksDocId] = useState('');
  const [chunksDocName, setChunksDocName] = useState('');

  const fetchData = async () => {
    try {
      const [kbRes, docsRes] = await Promise.all([
        ofetch(`/api/knowledge/datasets/${kbId}`, { headers: authHeaders }),
        ofetch(`/api/knowledge/datasets/${kbId}/documents?limit=100${keywords ? `&keywords=${encodeURIComponent(keywords)}` : ''}`, { headers: authHeaders }),
      ]);
      if (kbRes.code === 0) setKb(kbRes.data);
      if (docsRes.code === 0) setDocs(docsRes.data?.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [kbId, keywords]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await ofetch(`/api/knowledge/datasets/${kbId}/documents`, {
        method: 'POST', body: formData, headers: authHeaders,
      });
      if (fileRef.current) fileRef.current.value = '';
      fetchData();
    } catch { /* 容错 */ }
    setUploading(false);
  };

  const handleParse = async (docIds: string[]) => {
    try {
      await ofetch(`/api/knowledge/datasets/${kbId}/chunks`, {
        method: 'POST', body: { documentIds: docIds }, headers: authHeaders,
      });
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleDeleteSelected = async () => {
    if (selectedDocs.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedDocs.size} 个文档？`)) return;
    try {
      await ofetch(`/api/knowledge/datasets/${kbId}/documents`, {
        method: 'DELETE',
        body: { ids: Array.from(selectedDocs) },
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      setSelectedDocs(new Set());
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('确定删除？')) return;
    try {
      await ofetch(`/api/knowledge/datasets/${kbId}/documents/${docId}`, {
        method: 'DELETE', headers: authHeaders,
      });
      fetchData();
    } catch { /* */ }
  };

  const handleRetrievalTest = async () => {
    if (!retrievalQuery.trim()) return;
    setRetrieving(true);
    try {
      const res = await ofetch(`/api/knowledge/datasets/${kbId}/retrieval-test`, {
        method: 'POST',
        body: { query: retrievalQuery, topK: 5 },
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      if (res.code === 0) setRetrievalResult(res.data);
    } catch (e: any) {
      alert(e.message || '召回测试失败');
    }
    setRetrieving(false);
  };

  const toggleSelect = (docId: string) => {
    const next = new Set(selectedDocs);
    if (next.has(docId)) next.delete(docId);
    else next.add(docId);
    setSelectedDocs(next);
  };

  const toggleSelectAll = () => {
    if (selectedDocs.size === docs.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(docs.map((d: any) => d.id)));
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      PENDING: { variant: 'secondary', label: '等待中' },
      RUNNING: { variant: 'default', label: '解析中' },
      SUCCESS: { variant: 'outline', label: '已完成' },
      FAILED: { variant: 'destructive', label: '失败' },
      UNSTART: { variant: 'secondary', label: '未开始' },
    };
    const info = map[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const handleOpenChunks = (docId: string, docName: string) => {
    setChunksDocId(docId);
    setChunksDocName(docName);
    setChunksDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* 知识库统计 */}
      {kb && (
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">文档：</span>
            <span className="font-medium">{docs.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">嵌入模型：</span>
            <span className="font-medium">{kb.embeddingModel || '默认'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">分块方式：</span>
            <span className="font-medium">{kb.chunkMethod || '默认'}</span>
          </div>
        </div>
      )}

      {/* 上传 & 工具栏 */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.csv" className="max-w-sm" />
        <Button onClick={handleUpload} disabled={uploading} size="sm">
          <Upload size={14} className="mr-1" />
          {uploading ? '上传中...' : '上传'}
        </Button>
        <div className="flex-1" />
        <Input
          placeholder="搜索文档..."
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-40"
        />
        {selectedDocs.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
            <Trash2 size={14} className="mr-1" />删除选中 ({selectedDocs.size})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* 召回测试 */}
      <Card>
        <CardContent className="p-3">
          <p className="text-sm font-medium mb-2">召回测试</p>
          <div className="flex gap-2">
            <Input
              placeholder="输入检索词测试召回效果..."
              value={retrievalQuery}
              onChange={(e) => setRetrievalQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRetrievalTest()}
              className="max-w-md"
            />
            <Button onClick={handleRetrievalTest} disabled={retrieving || !retrievalQuery.trim()} size="sm">
              <Search size={14} className="mr-1" />
              {retrieving ? '测试中...' : '测试'}
            </Button>
          </div>
          {retrievalResult && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                找到 {retrievalResult.total || 0} 条相关切片：
              </p>
              {(retrievalResult.records || retrievalResult.data || []).slice(0, 3).map((item: any, idx: number) => (
                <Card key={idx} className="bg-muted/50">
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground mb-1">
                      相似度: {(item.score || item.similarity || 0).toFixed(4)}
                    </p>
                    <p className="text-xs whitespace-pre-wrap line-clamp-3">{item.content || item.text || item.chunk || '(无内容)'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 文档列表 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无文档</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={selectedDocs.size === docs.length && docs.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4"
            />
            <span className="text-sm text-muted-foreground">全选</span>
          </div>
          {docs.map((doc: any) => (
            <Card key={doc.id} className={selectedDocs.has(doc.id) ? 'ring-2 ring-primary' : ''}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedDocs.has(doc.id)}
                    onChange={() => toggleSelect(doc.id)}
                    className="w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{doc.name}</span>
                      {statusBadge(doc.status || 'PENDING')}
                      {doc.chunkCount > 0 && (
                        <Badge variant="secondary">{doc.chunkCount} 切片</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {doc.fileType} · {(Number(doc.fileSize) / 1024).toFixed(1)} KB
                      {doc.tokenCount && ` · ${doc.tokenCount} tokens`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 ml-3">
                  {doc.status === 'SUCCESS' && doc.chunkCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenChunks(doc.id, doc.name)}
                    >
                      <FileText size={14} className="mr-1" />切片
                    </Button>
                  )}
                  {doc.status !== 'SUCCESS' && doc.status !== 'RUNNING' && !doc.documentId?.startsWith('local_') && (
                    <Button size="sm" variant="outline" onClick={() => handleParse([doc.id])}>
                      <Play size={14} className="mr-1" />解析
                    </Button>
                  )}
                  {doc.status === 'RUNNING' && (
                    <Button size="sm" variant="outline" onClick={fetchData}>
                      <RefreshCw size={14} className="mr-1" />刷新
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDeleteDoc(doc.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 切片详情弹框（嵌套在文档弹框内） */}
      <Dialog open={chunksDialogOpen} onOpenChange={setChunksDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{chunksDocName} — 切片详情</DialogTitle>
          </DialogHeader>
          {chunksDocId && (
            <ChunksPanel kbId={kbId} docId={chunksDocId} authHeaders={authHeaders} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────
// 切片面板（嵌入弹框）
// ─────────────────────────────────────────
function ChunksPanel({ kbId, docId, authHeaders }: { kbId: string; docId: string; authHeaders: Record<string, string> }) {
  const [chunks, setChunks] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const fetchChunks = async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await ofetch(
        `/api/knowledge/datasets/${kbId}/documents/${docId}/chunks?page=${pageNum}&pageSize=${pageSize}`,
        { headers: authHeaders }
      );
      if (res.code === 0) {
        setChunks(res.data?.chunks || []);
        setTotal(res.data?.total || 0);
        setPage(pageNum);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchChunks(1); }, [kbId, docId]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{total}</span> 个切片
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchChunks(page - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm">第 {page} / {totalPages || 1} 页</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchChunks(page + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : chunks.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无切片</p>
      ) : (
        <div className="space-y-2">
          {chunks.map((chunk: any, idx: number) => (
            <Card key={chunk.id || idx}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    切片 {idx + 1 + (page - 1) * pageSize}
                  </span>
                  {chunk.tokenNum && (
                    <span className="text-xs text-muted-foreground">{chunk.tokenNum} tokens</span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {chunk.content || '(无内容)'}
                </p>
                {chunk.chunkMethod && (
                  <p className="text-xs text-muted-foreground mt-1">分块方式: {chunk.chunkMethod}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
