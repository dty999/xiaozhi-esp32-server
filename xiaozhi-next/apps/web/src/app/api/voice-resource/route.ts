/**
 * 音色资源管理 —— 管理员分页 / 新增 / 批量删除 / 按用户查询 / 平台列表
 *
 * 对标 Java VoiceResourceController:
 *   GET  /voice-resource                → GET  /api/voice-resource （管理员分页）
 *   GET  /voice-resource/{id}           → GET  /api/voice-resource/[id] （详情）
 *   POST /voice-resource                → POST /api/voice-resource （新增）
 *   DELETE /voice-resource/{id}         → DELETE /api/voice-resource/[id] （批量删除，?ids=）
 *   GET  /voice-resource/user/{userId}  → GET  /api/voice-resource/user/[userId] （按用户查询）
 *   GET  /voice-resource/platforms      → GET  /api/voice-resource/platforms （TTS平台列表）
 *
 * 注：音色资源表在 Prisma Schema 中通过 ai_voice_clone 表体现，
 *     此处提供管理端接口，admin 查询返回所有用户的克隆记录。
 *
 * @module voice-resource
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

// ─────────────────────────────────────────────
// GET /api/voice-resource — 管理员分页
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const name = searchParams.get('name') || '';

  const where: any = {};
  if (name) where.name = { contains: name };

  const [total, list] = await Promise.all([
    prisma.voiceClone.count({ where }),
    prisma.voiceClone.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
      include: {
        user: { select: { id: true, username: true, realName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: serializeBigInt(list) },
  });
}

// ─────────────────────────────────────────────
// POST /api/voice-resource — 新增音色资源
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const vc = await prisma.voiceClone.create({
    data: {
      id: BigInt(Date.now()),
      name: body.name,
      modelId: BigInt(body.modelId),
      voiceId: body.voiceId || `vc_${Date.now()}`,
      userId: BigInt(body.userId || auth.payload!.userId),
      languages: body.languages || null,
      trainStatus: body.trainStatus ?? 2, // 管理端直接添加，默认完成
      creator: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(vc) });
}

// ─────────────────────────────────────────────
// DELETE /api/voice-resource — 批量删除(?ids=)
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idsStr = searchParams.get('ids') || '';
  if (!idsStr) {
    return NextResponse.json({ code: 400, msg: '请提供ID列表' });
  }

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));
  await prisma.voiceClone.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 条记录` });
}
