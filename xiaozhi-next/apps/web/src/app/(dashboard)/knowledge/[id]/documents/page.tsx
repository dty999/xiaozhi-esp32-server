'use client';
/**
 * 知识库文档管理页 — 文档上传、解析、切片查看
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload, Play, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function KnowledgeDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [kb, setKb] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [kbRes, docsRes] = await Promise.all([
        ofetch(`/api/knowledge/datasets/${id}`, { headers: authHeaders }),
        ofetch(`/api/knowledge/datasets/${id}/documents?limit=100`, { headers: authHeaders }),
      ]);
      if (kbRes.code === 0) setKb(kbRes.data);
      if (docsRes.code === 0) setDocs(docsRes.data?.list || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [id]);

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

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('确定删除？')) return;
    try { await ofetch(`/api/knowledge/datasets/${id}/documents/${docId}`, { method: 'DELETE', headers: authHeaders }); fetchData(); } catch { /* */ }
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
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/knowledge')}>
          <ArrowLeft size={16} className="mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold">{kb?.name || '知识库'} — 文档管理</h1>
      </div>

      {/* 上传 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">上传文档</p>
          <div className="flex gap-2">
            <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.csv" className="max-w-sm" />
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload size={14} className="mr-1" />
              {uploading ? '上传中...' : '上传'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 文档列表 */}
      {loading ? <p className="text-muted-foreground">加载中...</p>
      : docs.length === 0 ? <p className="text-muted-foreground">暂无文档</p>
      : (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <Card key={doc.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{doc.name}</span>
                    {statusBadge(doc.status || 'PENDING')}
                    {doc.chunkCount !== undefined && <span className="text-xs text-muted-foreground">{doc.chunkCount} 切片</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.fileType} · {(Number(doc.fileSize) / 1024).toFixed(1)} KB
                    {doc.progress && ` · 进度 ${doc.progress}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {doc.status !== 'SUCCESS' && (
                    <Button size="sm" variant="outline" onClick={() => handleParse([doc.id])}>
                      <Play size={14} className="mr-1" />解析
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteDoc(doc.id)}>
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
