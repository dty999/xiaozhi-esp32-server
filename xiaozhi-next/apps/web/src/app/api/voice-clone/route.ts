/**
 * 声音克隆管理 —— 用户克隆记录分页 / 创建 / 删除
 *
 * 对标 Java VoiceCloneController:
 *   GET    /voice-clone            → GET    /api/voice-clone （分页）
 *   POST   /voice-clone            → POST   /api/voice-clone （创建）
 *   DELETE /voice-clone?ids=       → DELETE /api/voice-clone （批量删除）
 *   POST   /voice-clone/audio/{id} → POST   /api/voice-clone/audio/[id] （获取音频播放UUID）
 *   GET    /voice-clone/play/{uuid} → GET   /api/voice-clone/play/[uuid] （播放音频）
 *
 * @module voice-clone
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { cache } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// GET /api/voice-clone — 用户克隆记录分页
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const where: any = isAdmin ? {} : { userId };

  const [total, list] = await Promise.all([
    prisma.voiceClone.count({ where }),
    prisma.voiceClone.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
      include: {
        user: { select: { id: true, username: true } },
      },
    }),
  ]);

  const mappedList = list.map(vc => ({
    id: vc.id.toString(),
    name: vc.name,
    voiceId: vc.voiceId,
    modelId: vc.modelId.toString(),
    languages: vc.languages,
    trainStatus: vc.trainStatus,
    trainError: vc.trainError,
    audioPath: vc.audioPath ? 'has_audio' : null, // 不暴露真实路径，仅标识有无
    userId: vc.userId.toString(),
    username: vc.user?.username || '',
    createDate: vc.createDate,
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: mappedList },
  });
}

// POST /api/voice-clone — 创建声音克隆任务
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.name || !body.modelId) {
    return NextResponse.json({ code: 400, msg: '名称和模型ID不能为空' });
  }

  const userId = auth.payload!.userId;

  const clone = await prisma.voiceClone.create({
    data: {
      id: generateSnowflakeId(),
      name: body.name,
      modelId: BigInt(body.modelId),
      voiceId: body.voiceId || `vc_${Date.now()}`,
      userId,
      languages: body.languages || 'zh-CN',
      trainStatus: 0, // 待训练
      creator: userId,
    },
  });

  return NextResponse.json({
    code: 0,
    msg: '声音克隆任务已创建',
    data: { id: clone.id.toString() },
  });
}

// DELETE /api/voice-clone — 批量删除
//   ?ids=1,2,3
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsStr = searchParams.get('ids') || '';
  if (!idsStr) {
    return NextResponse.json({ code: 400, msg: '请提供ID列表' });
  }

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));

  // 权限校验：非管理员只能删除自己的
  if (!isAdmin) {
    const clones = await prisma.voiceClone.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    for (const c of clones) {
      if (c.userId !== userId) {
        return NextResponse.json({ code: 403, msg: '无权限删除他人的克隆记录' }, { status: 403 });
      }
    }
  }

  await prisma.voiceClone.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 条记录` });
}
