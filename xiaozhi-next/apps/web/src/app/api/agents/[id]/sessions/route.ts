/**
 * 获取智能体会话列表（分页）
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/{id}/sessions  → GET /api/agents/[id]/sessions
 *
 * @module agents/[id]/sessions
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

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  // 获取该智能体下所有 session 及最新消息时间（通过聚合查询）
  // 使用 Prisma groupBy 获取 session 列表
  const sessions = await prisma.agentChatHistory.groupBy({
    by: ['sessionId'],
    where: { agentId },
    _max: { createdAt: true },
    _count: { id: true },
  });

  // 按最新消息时间倒序排列
  sessions.sort((a, b) => {
    const ta = a._max.createdAt?.getTime() || 0;
    const tb = b._max.createdAt?.getTime() || 0;
    return tb - ta;
  });

  const total = sessions.length;
  const pagedSessions = sessions.slice((page - 1) * limit, page * limit);

  // 获取每个会话的标题
  const sessionIds = pagedSessions.map(s => s.sessionId);
  const titles = await prisma.agentChatTitle.findMany({
    where: { agentId, sessionId: { in: sessionIds } },
  });
  const titleMap = new Map(titles.map(t => [t.sessionId, t.title]));

  // 组装返回数据
  const list = pagedSessions.map(s => ({
    sessionId: s.sessionId,
    messageCount: s._count.id,
    lastMessageAt: s._max.createdAt,
    title: titleMap.get(s.sessionId) || '新对话',
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}
