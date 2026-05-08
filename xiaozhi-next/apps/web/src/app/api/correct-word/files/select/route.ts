/**
 * 获取所有替换词文件（下拉选择用）
 *
 * 对标 Java CorrectWordController:
 *   GET /correct-word/files/select  → GET /api/correct-word/files/select
 *
 * 返回 id + fileName 的轻量列表供下拉选择。
 *
 * @module correct-word/files/select
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const where: any = isAdmin ? {} : { userId };

  const files = await prisma.agentCorrectWordFile.findMany({
    where,
    select: {
      id: true,
      fileName: true,
      wordCount: true,
    },
    orderBy: { createDate: 'desc' },
  });

  return NextResponse.json({ code: 0, data: files });
}
