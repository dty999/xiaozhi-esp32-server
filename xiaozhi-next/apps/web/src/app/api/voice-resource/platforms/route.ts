/**
 * 获取 TTS 平台列表
 *
 * 对标 Java VoiceResourceController:
 *   GET /voice-resource/platforms  → GET /api/voice-resource/platforms
 *
 * 返回系统中所有 TTS 类型的模型供应商列表。
 *
 * @module voice-resource/platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  // 查询 TTS 类型的模型配置
  const platforms = await prisma.modelConfig.findMany({
    where: { modelType: 'TTS', isEnabled: 1 },
    select: {
      id: true,
      modelCode: true,
      modelName: true,
    },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(platforms) });
}
