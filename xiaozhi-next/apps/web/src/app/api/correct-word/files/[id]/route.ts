/**
 * 替换词文件 — 修改 / 查询详情 / 删除单个 / 下载
 *
 * 对标 Java CorrectWordController:
 *   PUT  /correct-word/files/{id}           → PUT  /api/correct-word/files/[id] （修改）
 *   GET  /correct-word/files/{id}/download  → GET  /api/correct-word/files/[id]/download （下载）
 *   DELETE /correct-word/files/{id}         → DELETE /api/correct-word/files/[id] （删除单个）
 *
 * @module correct-word/files/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// PUT /api/correct-word/files/[id] — 修改替换词文件
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

  const file = await prisma.agentCorrectWordFile.findUnique({
    where: { id: BigInt(id) },
  });

  if (!file) {
    return NextResponse.json({ code: 404, msg: '文件不存在' });
  }

  if (file.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const updated = await prisma.agentCorrectWordFile.update({
    where: { id: BigInt(id) },
    data: {
      fileName: body.fileName !== undefined ? body.fileName : undefined,
      content: body.content !== undefined ? body.content : undefined,
      wordCount: body.wordCount !== undefined ? body.wordCount : undefined,
    },
  });

  return NextResponse.json({ code: 0, data: updated });
}

// ─────────────────────────────────────────────
// DELETE /api/correct-word/files/[id] — 删除单个文件
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
  const fileId = BigInt(id);

  // 级联删除映射和条目
  await prisma.$transaction([
    prisma.agentCorrectWordMapping.deleteMany({ where: { fileId } }),
    prisma.agentCorrectWordItem.deleteMany({ where: { fileId } }),
    prisma.agentCorrectWordFile.delete({ where: { id: fileId } }),
  ]);

  return NextResponse.json({ code: 0, msg: '文件已删除' });
}
