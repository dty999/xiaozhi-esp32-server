/**
 * 修改克隆名称 / 获取音频播放UUID / 播放音频 / 执行训练
 *
 * 对标 Java VoiceCloneController:
 *   POST /voice-clone/{id}/name     → POST /api/voice-clone/[id]/name （修改名称）
 *   POST /voice-clone/audio/{id}    → POST /api/voice-clone/audio/[id] （获取音频UUID）
 *   GET  /voice-clone/play/{uuid}   → GET  /api/voice-clone/play/[uuid] （播放音频）
 *   POST /voice-clone/train         → POST /api/voice-clone/train （执行训练）
 *
 * @module voice-clone
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';
import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ─────────────────────────────────────────────
// POST /api/voice-clone/[id]/name — 修改克隆名称
// ─────────────────────────────────────────────
export async function POST__name(
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

  const clone = await prisma.voiceClone.findUnique({ where: { id: BigInt(id) } });
  if (!clone) {
    return NextResponse.json({ code: 404, msg: '克隆记录不存在' });
  }

  const updated = await prisma.voiceClone.update({
    where: { id: BigInt(id) },
    data: { name: body.name },
  });

  return NextResponse.json({ code: 0, data: updated });
}
