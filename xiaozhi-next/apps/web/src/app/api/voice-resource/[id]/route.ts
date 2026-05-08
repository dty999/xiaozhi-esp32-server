/**
 * 音色资源详情 / 更新
 *
 * 对标 Java VoiceResourceController:
 *   GET /voice-resource/{id}  → GET  /api/voice-resource/[id] （详情）
 *   PUT /voice-resource/{id}  → PUT  /api/voice-resource/[id] （更新）
 *
 * @module voice-resource/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// GET /api/voice-resource/[id] — 详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = auth.payload!.superAdmin === 1;
  const userId = auth.payload!.userId;

  const vc = await prisma.voiceClone.findUnique({
    where: { id: BigInt(id) },
    include: {
      user: { select: { id: true, username: true, realName: true } },
    },
  });

  if (!vc) {
    return NextResponse.json({ code: 404, msg: '音色资源不存在' });
  }
  if (vc.userId !== userId && !isAdmin) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  return NextResponse.json({ code: 0, data: vc });
}

// PUT /api/voice-resource/[id] — 更新音色资源
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = auth.payload!.superAdmin === 1;
  const userId = auth.payload!.userId;

  const existing = await prisma.voiceClone.findUnique({ where: { id: BigInt(id) } });
  if (!existing) {
    return NextResponse.json({ code: 404, msg: '音色资源不存在' });
  }
  if (existing.userId !== userId && !isAdmin) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.name) {
    return NextResponse.json({ code: 400, msg: '名称不能为空' });
  }

  await prisma.voiceClone.update({
    where: { id: BigInt(id) },
    data: {
      name: body.name,
      languages: body.languages !== undefined ? body.languages : undefined,
      modelId: body.modelId ? BigInt(body.modelId) : undefined,
      voiceId: body.voiceId || undefined,
      trainStatus: body.trainStatus !== undefined ? body.trainStatus : undefined,
    },
  });

  return NextResponse.json({ code: 0, msg: '音色资源已更新' });
}
