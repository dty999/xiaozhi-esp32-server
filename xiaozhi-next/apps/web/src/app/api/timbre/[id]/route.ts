/**
 * 音色详情
 *
 * 对标 Java TimbreController:
 *   GET /timbre/{id} → GET /api/timbre/[id]
 *
 * @module timbre/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// GET /api/timbre/[id] — 音色详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  const voice = await prisma.aiTtsVoice.findUnique({
    where: { id: BigInt(id) },
  });

  if (!voice) {
    return NextResponse.json({ code: 404, msg: '音色不存在' });
  }

  return NextResponse.json({ code: 0, data: voice });
}

// PUT /api/timbre/[id] — 更新音色（如已有则复用 PUT）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  await prisma.aiTtsVoice.update({
    where: { id: BigInt(id) },
    data: {
      name: body.name !== undefined ? body.name : undefined,
      languages: body.languages !== undefined ? body.languages : undefined,
      ttsVoice: body.ttsVoice !== undefined ? body.ttsVoice : undefined,
      voiceDemo: body.voiceDemo !== undefined ? body.voiceDemo : undefined,
      referenceAudio: body.referenceAudio !== undefined ? body.referenceAudio : undefined,
      referenceText: body.referenceText !== undefined ? body.referenceText : undefined,
      remark: body.remark !== undefined ? body.remark : undefined,
      sort: body.sort !== undefined ? body.sort : undefined,
      ttsModelId: body.ttsModelId ? BigInt(body.ttsModelId) : undefined,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, msg: '音色已更新' });
}
