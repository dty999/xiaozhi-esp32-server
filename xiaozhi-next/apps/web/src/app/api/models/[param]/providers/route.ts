import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// GET /api/models/[param]/providers — 获取某类型下的供应商列表（param 为模型类型如 LLM/ASR/TTS）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;

  const providers = await prisma.modelProvider.findMany({
    where: { modelType: param },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: providers });
}
