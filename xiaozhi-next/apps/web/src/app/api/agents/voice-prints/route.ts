/**
 * 声纹管理 —— 获取声纹列表 / 创建声纹
 *
 * 对标 Java AgentVoicePrintController:
 *   GET  /agent/{id}/voice-prints       → GET  /api/agents/[id]/voice-prints
 *   POST /agent/voice-prints             → POST /api/agents/voice-prints
 *
 * @module agents/voice-prints
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// POST /api/agents/voice-prints — 创建声纹
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { agentId, sourceName, audioId, introduce } = body;
  if (!agentId) {
    return NextResponse.json({ code: 400, msg: '缺少 agentId' });
  }

  const userId = auth.payload!.userId;

  // 权限校验：只能为自己的智能体创建声纹
  const agent = await prisma.aiAgent.findUnique({ where: { id: BigInt(agentId) } });
  if (!agent || agent.userId !== userId) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const voicePrint = await prisma.agentVoicePrint.create({
    data: {
      id: generateSnowflakeId(),
      agentId: BigInt(agentId),
      userId,
      sourceName: sourceName || null,
      audioId: audioId || null,
      introduce: introduce || null,
    },
  });

  return NextResponse.json({ code: 0, data: voicePrint });
}
