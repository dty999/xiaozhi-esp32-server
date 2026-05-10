/**
 * 文档管理 —— 列表 / 上传 / 批量删除
 *
 * 对标 Java KnowledgeFilesController.java:
 *   GET    /datasets/{id}/documents               → GET    /api/knowledge/datasets/[id]/documents（列表）
 *   POST   /datasets/{id}/documents               → POST   /api/knowledge/datasets/[id]/documents（上传）
 *   DELETE /datasets/{id}/documents               → DELETE /api/knowledge/datasets/[id]/documents（批量删除）
 *
 * @module knowledge/datasets/[id]/documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { createRAGFlowClient } from '@/lib/ragflow-factory';
import { safeParseBody } from '@/lib/request-body';
import { serializeBigInt } from '@/lib/serialize';

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

  // 对 RUNNING 状态的文档做轻量级状态同步
  const client = await createRAGFlowClient(kb.ragModelId).catch(() => null);
  if (client) {
    for (const doc of list) {
      if (doc.status === 'RUNNING' && doc.documentId && !doc.documentId.startsWith('local_')) {
        try {
          const statusRes = await client.getDocumentStatus(kb.datasetId, doc.documentId);
          if (statusRes?.data?.status && statusRes.data.status !== doc.status) {
            const newStatus = statusRes.data.status;
            await prisma.document.update({
              where: { id: doc.id },
              data: {
                status: newStatus,
                chunkCount: statusRes.data.chunk_count ?? undefined,
                tokenCount: statusRes.data.token_count ?? undefined,
                progress: statusRes.data.progress ?? undefined,
                error: newStatus === 'FAILED' ? (statusRes.data.error || '解析失败') : null,
                lastSyncAt: new Date(),
              },
            });
            doc.status = newStatus;
            if (statusRes.data.chunk_count !== undefined) doc.chunkCount = statusRes.data.chunk_count;
            if (statusRes.data.token_count !== undefined) doc.tokenCount = statusRes.data.token_count;
          }
        } catch { /* 单条同步失败不影响其他 */ }
      }
    }
  }

  return NextResponse.json({ code: 0, data: { total, page, limit, list: serializeBigInt(list) } });
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
    const rawFile = formData.get('file');

    // FormDataEntryValue 可以是 string 或 File
    if (!rawFile || typeof rawFile === 'string') {
      return NextResponse.json({ code: 400, msg: '请选择文件' });
    }

    const fileName = rawFile.name || 'unknown';
    const fileSize = rawFile.size || 0;
    const fileType = rawFile.type || 'unknown';

    let remoteDocId = '';
    let status = 'PENDING';
    let errorMsg: string | null = null;

    // 上传至 RAGFlow（容错：RAGFlow 不可用时仍创建本地记录）
    try {
      const client = await createRAGFlowClient(kb.ragModelId);
      const result = await client.uploadDocument(kb.datasetId, rawFile as File);
      remoteDocId = result.data?.id || '';
      status = 'RUNNING';
    } catch (ragErr: any) {
      console.warn('RAGFlow 上传失败，使用本地模式:', ragErr.message);
      status = 'FAILED';
      errorMsg = ragErr.message || '上传至 RAGFlow 失败';
    }

    // 保存文档记录
    const document = await prisma.document.create({
      data: {
        id: generateSnowflakeId(),
        knowledgeBaseId: BigInt(id),
        documentId: remoteDocId || `local_${generateSnowflakeId().toString()}`,
        name: fileName || 'unknown',
        fileSize: BigInt(fileSize),
        fileType: fileType,
        status,
        error: errorMsg,
        lastSyncAt: new Date(),
        creator: auth.payload!.userId,
      },
    });

    return NextResponse.json({ code: 0, data: serializeBigInt(document) });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `文档上传失败: ${e.message}` }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/knowledge/datasets/[id]/documents — 批量删除文档
//   请求体：{ ids: string[] }
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
  const body = await safeParseBody(request);
  if (!body || !body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ code: 400, msg: '请提供要删除的文档ID列表' });
  }

  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const ids = body.ids.map((id: string) => BigInt(id));

  // 过滤出非 RUNNING 状态的文档才允许删除
  const docs = await prisma.document.findMany({
    where: { id: { in: ids } },
  });

  const runningDocs = docs.filter((d) => d.status === 'RUNNING');
  if (runningDocs.length > 0) {
    return NextResponse.json(
      { code: 400, msg: `文档 ${runningDocs.length} 个正在解析中，无法删除` },
      { status: 400 }
    );
  }

  // 尝试调用 RAGFlow 删除远程文档
  try {
    const client = await createRAGFlowClient(kb.ragModelId);
    for (const doc of docs) {
      if (doc.documentId && !doc.documentId.startsWith('local_')) {
        await client.deleteDocument(kb.datasetId, doc.documentId);
      }
    }
  } catch {
    // 容错：RAGFlow 不可用时仍删除本地记录
  }

  // 级联删除本地文档记录
  await prisma.document.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 个文档` });
}
