/**
 * 获取音频下载 UUID（Redis 一次性令牌）
 *
 * 对标 Java AgentController.java 中:
 *   POST /agent/audio/{audioId}  → POST /api/agents/audio/[audioId]
 *
 * 原理：根据 audioId 查库获取音频数据，生成 UUID 存入 Redis，
 *       返回 UUID 供前端通过 /api/agents/play/[uuid] 下载。
 *       播放后 UUID 即焚，防止盗链。
 *
 * @module agents/audio/[audioId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ audioId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { audioId } = await params;

  // 验证音频是否存在
  const audio = await prisma.agentChatAudio.findUnique({
    where: { audioId },
  });

  if (!audio) {
    return NextResponse.json({ code: 404, msg: '音频不存在' });
  }

  // 生成 UUID 并存入 Redis（使用 agent:audio:id 键前缀）
  const uuid = uuidv4();
  await cache.set(`agent:audio:id:${uuid}`, audioId, 300); // 5分钟有效期

  return NextResponse.json({ code: 0, data: uuid });
}
