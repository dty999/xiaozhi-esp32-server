/**
 * 声纹详情 / 更新 / 删除
 *
 * 对标 Java AgentVoicePrintController:
 *   PUT    /agent/voice-prints/{id}  → PUT    /api/agents/voice-prints/[id]
 *   DELETE /agent/voice-prints/{id}  → DELETE /api/agents/voice-prints/[id]
 *
 * @module agents/voice-prints/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// PUT /api/agents/voice-prints/[id] — 更新声纹
// ─────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const voicePrint = await prisma.agentVoicePrint.findUnique({
    where: { id: BigInt(id) },
  });

  if (!voicePrint) {
    return NextResponse.json({ code: 404, msg: '声纹不存在' });
  }

  if (voicePrint.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const updated = await prisma.agentVoicePrint.update({
    where: { id: BigInt(id) },
    data: {
      sourceName: body.sourceName !== undefined ? body.sourceName : undefined,
      audioId: body.audioId !== undefined ? body.audioId : undefined,
      introduce: body.introduce !== undefined ? body.introduce : undefined,
    },
  });

  return NextResponse.json({ code: 0, data: updated });
}

// ─────────────────────────────────────────────
// DELETE /api/agents/voice-prints/[id] — 删除声纹
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const voicePrint = await prisma.agentVoicePrint.findUnique({
    where: { id: BigInt(id) },
  });

  if (!voicePrint) {
    return NextResponse.json({ code: 404, msg: '声纹不存在' });
  }

  if (voicePrint.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  await prisma.agentVoicePrint.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '声纹已删除' });
}
