/**
 * RAG 模型列表
 *
 * 对标 Java KnowledgeBaseController.getRAGModels:
 *   GET /datasets/rag-models → GET /api/knowledge/datasets/rag-models
 *
 * 返回 modelType 为 'rag' 的模型配置列表，
 * 供知识库创建/编辑表单下拉选择 RAG 后端。
 *
 * @module knowledge/datasets/rag-models
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const models = await prisma.modelConfig.findMany({
    where: {
      modelType: {
        in: ['RAG', 'rag', 'Rag'],
      },
      isEnabled: 1,
    },
    select: {
      id: true,
      modelCode: true,
      modelName: true,
      configJson: true,
      docLink: true,
      remark: true,
    },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: models });
}
