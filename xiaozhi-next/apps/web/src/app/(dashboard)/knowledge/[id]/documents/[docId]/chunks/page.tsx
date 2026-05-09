'use client';
/**
 * 文档切片查看页
 *
 * 对标 Java KnowledgeFilesController.listChunks:
 *   GET /datasets/{id}/documents/{docId}/chunks
 *
 * 显示指定文档的所有切片/Chunk，便于人工审查召回质量。
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface Chunk {
  id: string;
  content: string;
  chunkMethod: string;
  tokenNum?: number;
  createdAt?: string;
}

export default function ChunksPage() {
  const { id: kbId, docId } = useParams<{ id: string; docId: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const authHeaders = { Authorization: `Bearer ${token}` };

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

  useEffect(() => {
    fetchChunks(1);
  }, [kbId, docId]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} className="mr-1" />返回
        </Button>
        <h1 className="text-xl font-bold">切片详情</h1>
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground">{total}</span> 个切片
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => fetchChunks(page - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm">
              第 {page} / {totalPages || 1} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => fetchChunks(page + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : chunks.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无切片</p>
      ) : (
        <div className="space-y-3">
          {chunks.map((chunk: any, idx: number) => (
            <Card key={chunk.id || idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    切片 {idx + 1 + (page - 1) * pageSize}
                  </span>
                  {chunk.tokenNum && (
                    <span className="text-xs text-muted-foreground">
                      {chunk.tokenNum} tokens
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {chunk.content || '(无内容)'}
                </p>
                {chunk.chunkMethod && (
                  <p className="text-xs text-muted-foreground mt-2">
                    分块方式: {chunk.chunkMethod}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
