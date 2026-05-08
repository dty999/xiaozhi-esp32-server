/**
 * 删除知识库中的文档
 *
 * 对标 Java KnowledgeFilesController:
 *   DELETE /datasets/{id}/documents/{docId}  → DELETE /api/knowledge/datasets/[id]/documents/[docId]
 *
 * @module knowledge/datasets/[id]/documents/[docId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { createRAGFlowClient } from '@/lib/ragflow-factory';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id, docId } = await params;

  // 权限校验
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const document = await prisma.document.findUnique({
    where: { id: BigInt(docId) },
  });

  if (!document) {
    return NextResponse.json({ code: 404, msg: '文档不存在' });
  }

  // 删除 RAGFlow 远程文档
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    await client.deleteDocument(kb.datasetId, document.documentId);
  } catch {
    // 容错
  }

  // 删除本地记录
  await prisma.document.delete({ where: { id: BigInt(docId) } });

  return NextResponse.json({ code: 0, msg: '文档已删除' });
}
