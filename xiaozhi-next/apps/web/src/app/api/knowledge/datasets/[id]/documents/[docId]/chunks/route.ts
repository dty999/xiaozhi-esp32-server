/**
 * 查询文档切片列表
 *
 * 对标 Java KnowledgeFilesController:
 *   GET /datasets/{id}/documents/{docId}/chunks  → GET /api/knowledge/datasets/[id]/documents/[docId]/chunks
 *
 * @module knowledge/datasets/[id]/documents/[docId]/chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { createRAGFlowClient } from '@/lib/ragflow-factory';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id, docId } = await params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const keywords = searchParams.get('keywords') || '';

  // 权限校验
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const document = await prisma.document.findUnique({ where: { id: BigInt(docId) } });
  if (!document) {
    return NextResponse.json({ code: 404, msg: '文档不存在' });
  }

  // 从 RAGFlow 获取切片数据
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    // RAGFlow 返回 { code, data: { chunks: [], total, ... } }
    // 直接透传，保持原有结构
    const result = await client.listChunks(kb.datasetId, document.documentId, page, pageSize, keywords);
    // result 本身已是 { code, data } 格式，直接返回
    return NextResponse.json(result);
  } catch {
    // RAGFlow 不可用时返回空
    return NextResponse.json({
      code: 0,
      data: { total: 0, chunks: [], page, pageSize },
    });
  }
}
