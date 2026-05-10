/**
 * 按用户查询音色资源
 *
 * 对标 Java VoiceResourceController:
 *   GET /voice-resource/user/{userId}  → GET /api/voice-resource/user/[userId]
 *
 * @module voice-resource/user/[userId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { userId } = await params;

  const list = await prisma.voiceClone.findMany({
    where: { userId: BigInt(userId) },
    orderBy: { createDate: 'desc' },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(list) });
}
