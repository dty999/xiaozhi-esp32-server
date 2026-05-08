/**
 * 播放/下载音频文件（一次性令牌，用后即焚）
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/play/{uuid}  → GET /api/agents/play/[uuid]
 *
 * 流程：
 *   1. 从 Redis 中按 UUID 取出 audioId
 *   2. 根据 audioId 从数据库读取音频二进制数据
 *   3. 删除 Redis 中的 UUID（一次性使用）
 *   4. 返回 application/octet-stream 文件流
 *
 * @module agents/play/[uuid]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // 从 Redis 获取 UUID 对应的 audioId
  const audioId = await cache.get(`agent:audio:id:${uuid}`);
  if (!audioId) {
    return NextResponse.json({ code: 404, msg: '音频链接不存在或已过期' }, { status: 404 });
  }

  // 获取音频数据
  const audio = await prisma.agentChatAudio.findUnique({
    where: { audioId },
  });

  if (!audio) {
    return NextResponse.json({ code: 404, msg: '音频不存在' }, { status: 404 });
  }

  // 删除 Redis 中的临时令牌（一次性使用，防止盗链）
  await cache.del(`agent:audio:id:${uuid}`);

  // 返回二进制音频流
  return new NextResponse(audio.audioData, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="play.wav"`,
      'Content-Length': audio.audioData.length.toString(),
    },
  });
}
