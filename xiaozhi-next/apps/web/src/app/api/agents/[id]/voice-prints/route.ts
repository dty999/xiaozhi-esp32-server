/**
 * 获取指定智能体的声纹列表
 *
 * 对标 Java AgentVoicePrintController:
 *   GET /agent/{id}/voice-prints  → GET /api/agents/[id]/voice-prints
 *
 * @module agents/[id]/voice-prints
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const agentId = BigInt(id);
  const userId = auth.payload!.userId;

  // 权限校验
  const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const voicePrints = await prisma.agentVoicePrint.findMany({
    where: { agentId },
    orderBy: { createDate: 'desc' },
  });

  return NextResponse.json({ code: 0, data: voicePrints });
}
