/**
 * 知识库管理 —— 分页查询 / 创建 / 批量删除
 *
 * 对标 Java KnowledgeBaseController.java:
 *   GET    /datasets         → GET    /api/knowledge/datasets （分页）
 *   POST   /datasets         → POST   /api/knowledge/datasets （创建）
 *   DELETE /datasets/batch   → DELETE /api/knowledge/datasets （批量删除）
 *
 * @module knowledge/datasets
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';
import { createRAGFlowClient } from '@/lib/ragflow-factory';

// ─────────────────────────────────────────────
// GET /api/knowledge/datasets — 分页查询知识库
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const name = searchParams.get('name') || '';

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  // 管理员的超级管理员可看全部，普通用户仅看自己的
  const where: any = {};
  if (!isAdmin) {
    where.creator = userId;
  }
  if (name) {
    where.name = { contains: name };
  }

  const [total, list] = await Promise.all([
    prisma.knowledgeBase.count({ where }),
    prisma.knowledgeBase.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
      include: {
        documents: {
          select: { id: true, status: true },
        },
      },
    }),
  ]);

  const mappedList = list.map(kb => ({
    id: kb.id.toString(),
    datasetId: kb.datasetId,
    name: kb.name,
    description: kb.description,
    embeddingModel: kb.embeddingModel,
    chunkMethod: kb.chunkMethod,
    documentCount: kb.documents.length,
    createDate: kb.createDate,
    updateDate: kb.updateDate,
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: mappedList },
  });
}

// ─────────────────────────────────────────────
// POST /api/knowledge/datasets — 创建知识库
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const userId = auth.payload!.userId;
  const { name, description, ragModelId, embeddingModel, chunkMethod, parserConfig } = body;

  if (!name) {
    return NextResponse.json({ code: 400, msg: '知识库名称不能为空' });
  }

  if (!ragModelId) {
    return NextResponse.json({ code: 400, msg: '请选择RAG模型' });
  }

  // 尝试调用 RAGFlow API 创建远程 dataset
  let datasetId = '';
  try {
    const client = await createRAGFlowClient(BigInt(ragModelId));
    const result = await client.createDataset(name, description);
    datasetId = result.data?.id || '';
  } catch {
    // RAGFlow 不可用时使用本地 UUID
    datasetId = `local_${generateSnowflakeId().toString()}`;
  }

  const knowledgeBase = await prisma.knowledgeBase.create({
    data: {
      id: generateSnowflakeId(),
      datasetId,
      ragModelId: BigInt(ragModelId),
      name,
      description: description || null,
      embeddingModel: embeddingModel || null,
      chunkMethod: chunkMethod || null,
      parserConfig: parserConfig || null,
      creator: userId,
    },
  });

  return NextResponse.json({ code: 0, data: knowledgeBase });
}

// ─────────────────────────────────────────────
// DELETE /api/knowledge/datasets — 批量删除知识库
//   ?ids=1,2,3
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsStr = searchParams.get('ids') || '';
  if (!idsStr) {
    return NextResponse.json({ code: 400, msg: '请提供知识库ID列表' });
  }

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));
  const userId = auth.payload!.userId;

  for (const id of ids) {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: { documents: true },
    });

    if (!kb) continue;

    // 权限校验
    if (kb.creator !== userId && auth.payload!.superAdmin !== 1) {
      return NextResponse.json({ code: 403, msg: `无权限删除知识库 ${id}` }, { status: 403 });
    }

    // 尝试同步删除 RAGFlow 远程资源
    try {
      const client = await createRAGFlowClient(kb.ragModelId);
      await client.deleteDataset(kb.datasetId);
    } catch {
      // 容错
    }

    // 级联删除文档
    await prisma.document.deleteMany({ where: { knowledgeBaseId: id } });

    // 删除知识库自身
    await prisma.knowledgeBase.delete({ where: { id } });
  }

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 个知识库` });
}
