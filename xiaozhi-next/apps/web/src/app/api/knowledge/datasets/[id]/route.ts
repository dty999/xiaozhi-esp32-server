/**
 * 知识库详情 / 更新 / 单个删除
 *
 * 对标 Java KnowledgeBaseController.java:
 *   GET    /datasets/{dataset_id}  → GET    /api/knowledge/datasets/[id]
 *   PUT    /datasets/{dataset_id}  → PUT    /api/knowledge/datasets/[id]
 *   DELETE /datasets/{dataset_id}  → DELETE /api/knowledge/datasets/[id]
 *
 * @module knowledge/datasets/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';
import { createRAGFlowClient } from '@/lib/ragflow-factory';

// ─────────────────────────────────────────────
// GET /api/knowledge/datasets/[id] — 知识库详情
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: BigInt(id) },
    include: {
      documents: {
        orderBy: { createDate: 'desc' },
      },
    },
  });

  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }

  // 权限校验：只有创建者和管理员可查看
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  return NextResponse.json({ code: 0, data: kb });
}

// ─────────────────────────────────────────────
// PUT /api/knowledge/datasets/[id] — 更新知识库
// ─────────────────────────────────────────────
export async function PUT(
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

  const existing = await prisma.knowledgeBase.findUnique({
    where: { id: BigInt(id) },
  });

  if (!existing) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }

  if (existing.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const updated = await prisma.knowledgeBase.update({
    where: { id: BigInt(id) },
    data: {
      name: body.name !== undefined ? body.name : undefined,
      description: body.description !== undefined ? body.description : undefined,
      embeddingModel: body.embeddingModel !== undefined ? body.embeddingModel : undefined,
      chunkMethod: body.chunkMethod !== undefined ? body.chunkMethod : undefined,
      parserConfig: body.parserConfig !== undefined ? body.parserConfig : undefined,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: updated });
}

// ─────────────────────────────────────────────
// DELETE /api/knowledge/datasets/[id] — 删除单个知识库（级联删除）
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: BigInt(id) },
  });

  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }

  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 删除 RAGFlow 远程 dataset
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    await client.deleteDataset(kb.datasetId);
  } catch {
    // 容错
  }

  // 级联删除（文档→知识库）
  await prisma.$transaction(async (tx) => {
    await tx.document.deleteMany({ where: { knowledgeBaseId: BigInt(id) } });
    await tx.knowledgeBase.delete({ where: { id: BigInt(id) } });
  });

  return NextResponse.json({ code: 0, msg: '知识库已删除' });
}
