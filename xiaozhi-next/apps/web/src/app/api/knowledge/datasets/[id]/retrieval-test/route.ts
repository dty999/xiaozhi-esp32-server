/**
 * 知识库召回测试
 *
 * 对标 Java KnowledgeFilesController:
 *   POST /datasets/{id}/retrieval-test  → POST /api/knowledge/datasets/[id]/retrieval-test
 *
 * 请求体：{ query: string, topK?: number }
 *
 * @module knowledge/datasets/[id]/retrieval-test
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

  const { query, topK = 5 } = body;
  if (!query) {
    return NextResponse.json({ code: 400, msg: '请输入测试检索词' });
  }

  // 权限校验
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 调用 RAGFlow 召回测试
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    // result 已是 RAGFlow 完整响应 { code, data }，直接透传
    const result = await client.retrievalTest(kb.datasetId, query, topK);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `召回测试失败: ${e.message}` }, { status: 500 });
  }
}
