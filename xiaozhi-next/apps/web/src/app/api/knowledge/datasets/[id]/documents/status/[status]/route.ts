/**
 * 按状态筛选知识库文档列表
 *
 * 对标 Java KnowledgeFilesController:
 *   GET /datasets/{id}/documents/status/{status}  → GET /api/knowledge/datasets/[id]/documents/status/[status]
 *
 * status 取值：PENDING / RUNNING / SUCCESS / FAILED / UNSTART
 *
 * @module knowledge/datasets/[id]/documents/status/[status]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; status: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id, status } = await params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  // 权限校验
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: BigInt(id) } });
  if (!kb) {
    return NextResponse.json({ code: 404, msg: '知识库不存在' });
  }
  if (kb.creator !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const [total, list] = await Promise.all([
    prisma.document.count({ where: { knowledgeBaseId: BigInt(id), status } }),
    prisma.document.findMany({
      where: { knowledgeBaseId: BigInt(id), status },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}
