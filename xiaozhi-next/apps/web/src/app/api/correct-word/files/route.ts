/**
 * 替换词文件管理 —— 创建 / 分页列表 / 批量删除 / 全部文件查询
 *
 * 对标 Java CorrectWordController:
 *   POST   /correct-word/files              → POST   /api/correct-word/files （创建）
 *   GET    /correct-word/files              → GET    /api/correct-word/files （分页）
 *   DELETE /correct-word/files/batch-delete → DELETE /api/correct-word/files?ids=... （批量删除）
 *   GET    /correct-word/files/select       → GET    /api/correct-word/files/select （全部文件）
 *
 * @module correct-word/files
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';
import { serializeBigInt } from '@/lib/serialize';

// ─────────────────────────────────────────────
// GET /api/correct-word/files — 分页获取文件列表
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const fileName = searchParams.get('fileName') || '';

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const where: any = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (fileName) where.fileName = { contains: fileName };

  const [total, list] = await Promise.all([
    prisma.agentCorrectWordFile.count({ where }),
    prisma.agentCorrectWordFile.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: serializeBigInt(list) },
  });
}

// ─────────────────────────────────────────────
// POST /api/correct-word/files — 创建替换词文件
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

  const { fileName, content, wordCount } = body;

  if (!fileName || !content) {
    return NextResponse.json({ code: 400, msg: '文件名和内容不能为空' });
  }

  const file = await prisma.agentCorrectWordFile.create({
    data: {
      id: generateSnowflakeId(),
      fileName,
      content,
      wordCount: wordCount || 0,
      userId: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(file) });
}

// ─────────────────────────────────────────────
// DELETE /api/correct-word/files — 批量删除
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
    return NextResponse.json({ code: 400, msg: '请提供文件ID列表' });
  }

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));

  // 先删除关联映射，再删除文件
  await prisma.$transaction([
    prisma.agentCorrectWordMapping.deleteMany({ where: { fileId: { in: ids } } }),
    prisma.agentCorrectWordItem.deleteMany({ where: { fileId: { in: ids } } }),
    prisma.agentCorrectWordFile.deleteMany({ where: { id: { in: ids } } }),
  ]);

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 个文件` });
}
