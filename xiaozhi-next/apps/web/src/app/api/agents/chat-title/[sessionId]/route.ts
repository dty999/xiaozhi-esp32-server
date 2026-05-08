/**
 * 生成会话标题
 *
 * 对标 Java AgentController.java 中:
 *   POST /agent/chat-title/{sessionId}/generate  → POST /api/agents/chat-title/[sessionId]
 *
 * 获取会话第一条用户消息前50字作为标题，或通过 LLM 生成。
 *
 * @module agents/chat-title/[sessionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ code: 400, msg: '缺少 agentId 参数' });
  }

  // 获取该会话第一条用户消息（chatType=1）作为标题基础
  const firstUserMessage = await prisma.agentChatHistory.findFirst({
    where: {
      agentId: BigInt(agentId),
      sessionId,
      chatType: 1, // 用户消息
    },
    orderBy: { createdAt: 'asc' },
  });

  // 取用户消息前50字作为标题
  const title = firstUserMessage?.content?.slice(0, 50) || '新对话';

  // 检查是否已有标题记录，有则更新，无则创建
  const existing = await prisma.agentChatTitle.findFirst({
    where: { agentId: BigInt(agentId), sessionId },
  });

  if (existing) {
    await prisma.agentChatTitle.update({
      where: { id: existing.id },
      data: { title },
    });
  } else {
    await prisma.agentChatTitle.create({
      data: {
        id: generateSnowflakeId(),
        agentId: BigInt(agentId),
        sessionId,
        title,
      },
    });
  }

  return NextResponse.json({ code: 0, data: { title } });
}
