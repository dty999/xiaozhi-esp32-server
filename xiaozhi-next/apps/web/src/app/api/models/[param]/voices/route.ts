import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// GET /api/models/[param]/voices — 获取某 TTS 模型下的音色列表（param 为模型 ID）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;

  const voices = await prisma.aiTtsVoice.findMany({
    where: { ttsModelId: BigInt(param) },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: voices });
}
