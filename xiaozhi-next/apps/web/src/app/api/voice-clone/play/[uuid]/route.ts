/**
 * 播放声音克隆的音频文件
 *
 * 对标 Java VoiceCloneController:
 *   GET /voice-clone/play/{uuid}  → GET /api/voice-clone/play/[uuid]
 *
 * @module voice-clone/play/[uuid]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // 从 Redis 获取克隆 ID
  const cloneId = await cache.get(`voiceClone:audio:id:${uuid}`);
  if (!cloneId) {
    return NextResponse.json({ code: 404, msg: '音频链接不存在或已过期' }, { status: 404 });
  }

  const clone = await prisma.voiceClone.findUnique({ where: { id: BigInt(cloneId) } });
  if (!clone) {
    return NextResponse.json({ code: 404, msg: '克隆记录不存在' }, { status: 404 });
  }

  // 删除 Redis 令牌（一次性）
  await cache.del(`voiceClone:audio:id:${uuid}`);

  // 尝试返回音频文件
  try {
    // 假设音频存储在 uploads/voice-clone/ 下，按 voiceId 或名称查找
    const audioDir = join(process.cwd(), 'uploads', 'voice-clone');
    const fileBuffer = await readFile(join(audioDir, `${clone.name}`));
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="play.mp3"`,
      },
    });
  } catch {
    return NextResponse.json({ code: 404, msg: '音频文件不存在' }, { status: 404 });
  }
}
