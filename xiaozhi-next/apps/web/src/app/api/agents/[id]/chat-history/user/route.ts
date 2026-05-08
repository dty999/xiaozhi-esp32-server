/**
 * 获取智能体最近50条用户聊天记录（用户视角）
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/{id}/chat-history/user  → GET /api/agents/[id]/chat-history/user
 *
 * @module agents/[id]/chat-history/user
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
    return NextResponse.json({ code: 403, msg: '没有权限查看该智能体的聊天记录' }, { status: 403 });
  }

  // 获取最近最多50条用户消息（chatType=1）
  const messages = await prisma.agentChatHistory.findMany({
    where: { agentId, chatType: 1 },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      sessionId: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ code: 0, data: messages });
}
