/**
 * 下载替换词文件内容
 *
 * 对标 Java CorrectWordController:
 *   GET /correct-word/files/{id}/download  → GET /api/correct-word/files/[id]/download
 *
 * @module correct-word/files/[id]/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;

  const file = await prisma.agentCorrectWordFile.findUnique({
    where: { id: BigInt(id) },
  });

  if (!file) {
    return NextResponse.json({ code: 404, msg: '文件不存在' });
  }

  // 返回文本内容
  return new NextResponse(file.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Content-Disposition': `attachment;filename=${encodeURIComponent(file.fileName)}`,
    },
  });
}
