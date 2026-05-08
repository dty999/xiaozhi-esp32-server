/**
 * 获取声音克隆音频的播放 UUID
 *
 * 对标 Java VoiceCloneController:
 *   POST /voice-clone/audio/{id}  → POST /api/voice-clone/audio/[id]
 *
 * @module voice-clone/audio/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;

  const clone = await prisma.voiceClone.findUnique({ where: { id: BigInt(id) } });
  if (!clone) {
    return NextResponse.json({ code: 404, msg: '克隆记录不存在' });
  }

  // 生成播放 UUID
  const uuid = uuidv4();
  await cache.set(`voiceClone:audio:id:${uuid}`, id, 300); // 5分钟

  return NextResponse.json({ code: 0, data: uuid });
}
