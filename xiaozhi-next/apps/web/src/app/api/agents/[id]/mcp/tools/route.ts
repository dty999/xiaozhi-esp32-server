/**
 * MCP 工具列表查询
 *
 * 对标 Java MCP 控制器:
 *   GET /api/agents/{id}/mcp/tools  → GET /api/agents/[id]/mcp/tools
 *
 * 返回智能体已配置的插件/工具列表。
 *
 * @module agents/[id]/mcp/tools
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

  // 权限校验
  const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 查询智能体已配置的插件映射
  const plugins = await prisma.agentPluginMapping.findMany({
    where: { agentId },
    select: {
      id: true,
      pluginId: true,
      targetId: true,
    },
  });

  const tools = plugins.map(p => ({
    id: p.id.toString(),
    pluginId: p.pluginId.toString(),
    targetId: p.targetId?.toString() || null,
  }));

  return NextResponse.json({ code: 0, data: tools });
}
