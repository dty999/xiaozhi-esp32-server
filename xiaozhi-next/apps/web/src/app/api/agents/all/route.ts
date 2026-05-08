/**
 * 管理员智能体分页查询
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/all  → GET /api/agents/all
 *
 * 仅超级管理员可用。
 *
 * @module agents/all
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const agentName = searchParams.get('agentName') || '';

  // 构建查询条件
  const where: any = {};
  if (agentName) where.agentName = { contains: agentName };

  // 并行查询总数与分页数据
  const [total, list] = await Promise.all([
    prisma.aiAgent.count({ where }),
    prisma.aiAgent.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, realName: true },
        },
      },
    }),
  ]);

  // 转换为前端友好格式
  const mappedList = list.map(a => ({
    id: a.id.toString(),
    agentCode: a.agentCode,
    agentName: a.agentName,
    systemPrompt: a.systemPrompt,
    sort: a.sort,
    createDate: a.createDate,
    updateDate: a.updateDate,
    userId: a.userId.toString(),
    username: a.user?.username || '',
    realName: a.user?.realName || '',
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: mappedList },
  });
}
