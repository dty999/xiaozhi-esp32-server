/**
 * 根据音频ID获取对应的聊天文本内容
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/{id}/chat-history/audio  → GET /api/agents/[id]/chat-history/audio
 *
 * 注意：Java 端此接口的 {id} 实际是 audioId（非 agentId）。
 *       此处保持路径兼容，id 指 audioId。
 *
 * @module agents/[id]/chat-history/audio
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

  const { id: audioId } = await params;

  // 按 audioId 查找关联的聊天记录文本内容
  const chatHistory = await prisma.agentChatHistory.findFirst({
    where: { audioId },
    select: { content: true },
  });

  if (!chatHistory) {
    return NextResponse.json({ code: 0, data: null });
  }

  return NextResponse.json({ code: 0, data: chatHistory.content });
}
