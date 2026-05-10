/**
 * 获取指定会话的聊天记录
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/{id}/chat-history/{sessionId}  → GET /api/agents/[id]/chat-history/[sessionId]
 *
 * @module agents/[id]/chat-history/[sessionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id, sessionId } = await params;
  const agentId = BigInt(id);
  const userId = auth.payload!.userId;

  // 检查权限：当前用户是否为该智能体的所有者
  const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '没有权限查看该智能体的聊天记录' }, { status: 403 });
  }

  // 查询该会话的全部聊天记录，按时间升序
  const messages = await prisma.agentChatHistory.findMany({
    where: { agentId, sessionId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      chatType: true,
      content: true,
      audioId: true,
      macAddress: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(messages) });
}
