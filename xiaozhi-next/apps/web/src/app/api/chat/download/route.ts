/**
 * 获取聊天记录下载 UUID（一次性令牌）
 *
 * 对标 Java AgentChatHistoryController.java 中:
 *   POST /agent/chat-history/getDownloadUrl/{agentId}/{sessionId}
 *       → 不再放在 agents 下，独立为 POST /api/chat/download
 *
 * 原理：校验智能体权限后生成 UUID 存入 Redis（agentId:sessionId），
 *       返回 UUID 供 /api/chat/download/[uuid]/current 或 previous 使用。
 *
 * @module chat/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { agentId, sessionId } = body;
  const userId = auth.payload!.userId;

  if (!agentId || !sessionId) {
    return NextResponse.json({ code: 400, msg: '缺少 agentId 或 sessionId' });
  }

  // 校验当前用户是否有该智能体的访问权限
  const agent = await prisma.aiAgent.findUnique({
    where: { id: BigInt(agentId) },
  });

  if (!agent || (agent.userId !== userId && auth.payload!.superAdmin !== 1)) {
    return NextResponse.json({ code: 403, msg: '没有权限下载该智能体的聊天记录' }, { status: 403 });
  }

  // 生成 UUID 并存入 Redis，值格式为 "agentId:sessionId"
  const uuid = uuidv4();
  await cache.set(`agent:chat:history:${uuid}`, `${agentId}:${sessionId}`, 300);

  return NextResponse.json({ code: 0, data: uuid });
}
