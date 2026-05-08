/**
 * 音色管理 —— 分页查询 / 新增 / 批量删除
 *
 * 对标 Java TimbreController:
 *   GET  /timbre              → GET  /api/timbre （管理员分页）
 *   POST /timbre              → POST /api/timbre （新增音色）
 *   POST /timbre/batch-delete → DELETE /api/timbre?ids=... （批量删除）
 *
 * @module timbre
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/timbre — 分页查询音色
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
    prisma.aiTtsVoice.count({ where }),
    prisma.aiTtsVoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { sort: 'asc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// ─────────────────────────────────────────────
// POST /api/timbre — 新增音色
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const voice = await prisma.aiTtsVoice.create({
    data: {
      id: generateSnowflakeId(),
      name: body.name,
      ttsModelId: BigInt(body.ttsModelId),
      languages: body.languages || null,
      ttsVoice: body.ttsVoice || null,
      voiceDemo: body.voiceDemo || null,
      referenceAudio: body.referenceAudio || null,
      referenceText: body.referenceText || null,
      remark: body.remark || null,
      sort: body.sort ?? 0,
      creator: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, data: voice });
}

// ─────────────────────────────────────────────
// DELETE /api/timbre — 批量删除音色
//   ?ids=1,2,3
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idsStr = searchParams.get('ids') || '';
  if (!idsStr) {
    return NextResponse.json({ code: 400, msg: '请提供音色ID列表' });
  }

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));
  await prisma.aiTtsVoice.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 个音色` });
}
