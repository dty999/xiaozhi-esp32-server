'use client';
/**
 * 知识库文档管理页
 *
 * 对标 Java KnowledgeFilesController:
 *  - GET /datasets/{id}/documents          → 文档列表
 *  - POST /datasets/{id}/documents          → 上传文档
 *  - DELETE /datasets/{id}/documents       → 批量删除
 *  - POST /datasets/{id}/chunks           → 解析文档
 *  - POST /datasets/{id}/retrieval-test    → 召回测试
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload, Play, Trash2, FileText, Search, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function KnowledgeDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
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

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [kbRes, docsRes] = await Promise.all([
        ofetch(`/api/knowledge/datasets/${id}`, { headers: authHeaders }),
        ofetch(`/api/knowledge/datasets/${id}/documents?limit=100${keywords ? `&keywords=${encodeURIComponent(keywords)}` : ''}`, { headers: authHeaders }),
      ]);
      if (kbRes.code === 0) setKb(kbRes.data);
      if (docsRes.code === 0) setDocs(docsRes.data?.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, keywords]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await ofetch(`/api/knowledge/datasets/${id}/documents`, { method: 'POST', body: formData, headers: authHeaders });
      if (fileRef.current) fileRef.current.value = '';
      fetchData();
    } catch { /* 容错 */ }
    setUploading(false);
  };

  const handleParse = async (docIds: string[]) => {
    try {
      await ofetch(`/api/knowledge/datasets/${id}/chunks`, { method: 'POST', body: { documentIds: docIds }, headers: authHeaders });
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleDeleteSelected = async () => {
    if (selectedDocs.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedDocs.size} 个文档？`)) return;
    try {
      await ofetch(`/api/knowledge/datasets/${id}/documents`, {
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
      await ofetch(`/api/knowledge/datasets/${id}/documents/${docId}`, { method: 'DELETE', headers: authHeaders });
      fetchData();
    } catch { /* */ }
  };

  const handleRetrievalTest = async () => {
    if (!retrievalQuery.trim()) return;
    setRetrieving(true);
    try {
      const res = await ofetch(`/api/knowledge/datasets/${id}/retrieval-test`, {
        method: 'POST',
        body: { query: retrievalQuery, topK: 5 },
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      });
      if (res.code === 0) {
        setRetrievalResult(res.data);
      }
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

  return (
    <div className="max-w-6xl">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/knowledge')}>
          <ArrowLeft size={16} className="mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold">{kb?.name || '知识库'} — 文档管理</h1>
      </div>

      {/* 知识库统计 */}
      {kb && (
        <Card className="mb-6">
          <CardContent className="p-4 flex gap-6 text-sm">
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
          </CardContent>
        </Card>
      )}

      {/* 上传 & 工具栏 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.csv" className="max-w-sm" />
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload size={14} className="mr-1" />
              {uploading ? '上传中...' : '上传'}
            </Button>
            <div className="flex-1" />
            {/* 搜索 */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="搜索文档..."
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-48"
              />
            </div>
            {/* 批量操作 */}
            {selectedDocs.size > 0 && (
              <>
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                  <Trash2 size={14} className="mr-1" />删除选中 ({selectedDocs.size})
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw size={14} className="mr-1" />刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 召回测试 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">召回测试</p>
          <div className="flex gap-2">
            <Input
              placeholder="输入检索词测试召回效果..."
              value={retrievalQuery}
              onChange={(e) => setRetrievalQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRetrievalTest()}
              className="max-w-md"
            />
            <Button onClick={handleRetrievalTest} disabled={retrieving || !retrievalQuery.trim()}>
              <Search size={14} className="mr-1" />
              {retrieving ? '测试中...' : '测试'}
            </Button>
          </div>
          {retrievalResult && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                找到 {retrievalResult.total || 0} 条相关切片：
              </p>
              {(retrievalResult.records || retrievalResult.data || []).slice(0, 5).map((item: any, idx: number) => (
                <Card key={idx} className="bg-muted/50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      相似度: {(item.score || item.similarity || 0).toFixed(4)}
                      {item.documentId && ` · 文档: ${item.documentId}`}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{item.content || item.text || item.chunk || '(无内容)'}</p>
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
          {/* 全选行 */}
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
                      {doc.progress && ` · ${doc.progress}`}
                      {doc.tokenCount && ` · ${doc.tokenCount} tokens`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 ml-3">
                  {/* 切片入口：仅已完成且有切片的文档显示 */}
                  {doc.status === 'SUCCESS' && doc.chunkCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => router.push(`/knowledge/${id}/documents/${doc.id}/chunks`)}
                    >
                      <FileText size={14} className="mr-1" />切片
                    </Button>
                  )}
                  {/* 解析：未完成且非 RUNNING 的文档可触发解析 */}
                  {doc.status !== 'SUCCESS' && doc.status !== 'RUNNING' && !doc.documentId?.startsWith('local_') && (
                    <Button size="sm" variant="outline" onClick={() => handleParse([doc.id])}>
                      <Play size={14} className="mr-1" />解析
                    </Button>
                  )}
                  {/* RUNNING 时显示刷新 */}
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
    </div>
  );
}
