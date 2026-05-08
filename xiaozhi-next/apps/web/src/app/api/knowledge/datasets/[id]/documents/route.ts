/**
 * 文档管理 —— 列表 / 上传 / 解析 / 切片 / 召回测试
 *
 * 对标 Java KnowledgeFilesController.java:
 *   GET  /datasets/{id}/documents               → GET  /api/knowledge/datasets/[id]/documents（列表）
 *   GET  /datasets/{id}/documents/status/{status} → GET  /api/knowledge/datasets/[id]/documents/status/[status]（按状态筛选）
 *   POST /datasets/{id}/documents               → POST /api/knowledge/datasets/[id]/documents（上传）
 *   POST /datasets/{id}/chunks                  → POST /api/knowledge/datasets/[id]/chunks（解析切块）
 *   GET  /datasets/{id}/retrieval-test           → POST /api/knowledge/datasets/[id]/retrieval-test（召回测试）
 *
 * @module knowledge/datasets/[id]/documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { createRAGFlowClient } from '@/lib/ragflow-factory';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/knowledge/datasets/[id]/documents — 文档列表
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
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const keywords = searchParams.get('keywords') || '';

  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const where: any = { knowledgeBaseId: BigInt(id) };
  if (keywords) where.name = { contains: keywords };

  const [total, list] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({ code: 0, data: { total, page, limit, list } });
}

// ─────────────────────────────────────────────
// POST /api/knowledge/datasets/[id]/documents — 上传文档
// ─────────────────────────────────────────────
export async function POST(
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

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file || (!(file instanceof File) && !file?.name)) {
      return NextResponse.json({ code: 400, msg: '请选择文件' });
    }

    const client = await createRAGFlowClient(kb.ragModelId);

    let remoteDocId = '';
    let status = 'pending';

    // 上传至 RAGFlow
    try {
      const result = await client.uploadDocument(kb.datasetId, file);
      remoteDocId = result.data?.id || '';
      status = 'RUNNING';
    } catch {
      // RAGFlow 不可用时的 fallback 状态
      status = 'FAILED';
    }

    // 保存文档记录
    const document = await prisma.document.create({
      data: {
        id: generateSnowflakeId(),
        knowledgeBaseId: BigInt(id),
        documentId: remoteDocId || `local_${generateSnowflakeId().toString()}`,
        name: file.name || 'unknown',
        fileSize: BigInt(file.size),
        fileType: file.type || 'unknown',
        status,
        creator: auth.payload!.userId,
      },
    });

    return NextResponse.json({ code: 0, data: document });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `文档上传失败: ${e.message}` }, { status: 500 });
  }
}
