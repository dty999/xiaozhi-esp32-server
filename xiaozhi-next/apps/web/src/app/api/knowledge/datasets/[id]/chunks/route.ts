/**
 * 解析知识库文档（触发切块处理）
 *
 * 对标 Java KnowledgeFilesController:
 *   POST /datasets/{id}/chunks  → POST /api/knowledge/datasets/[id]/chunks
 *
 * 请求体：{ documentIds: string[] }
 * 调用 RAGFlow API 对指定文档进行解析切块。
 *
 * @module knowledge/datasets/[id]/chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';
import { createRAGFlowClient } from '@/lib/ragflow-factory';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { documentIds } = body;
  if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json({ code: 400, msg: '请选择要解析的文档' });
  }

  // 权限校验
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }

  // 调用 RAGFlow 解析
  let result: any = null;
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    // RAGFlow 内部会自动处理 document_ids 对应的文档
    for (const docId of documentIds) {
      const doc = await prisma.document.findUnique({ where: { id: BigInt(docId) } });
      if (doc) {
        result = await client.parseDocument(kb.datasetId, doc.documentId);
        // 更新文档状态为 RUNNING
        await prisma.document.update({
          where: { id: BigInt(docId) },
          data: { status: 'RUNNING' },
        });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `解析请求失败: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ code: 0, data: result });
}
