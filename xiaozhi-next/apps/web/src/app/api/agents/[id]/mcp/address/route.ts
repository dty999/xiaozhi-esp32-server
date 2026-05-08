/**
 * MCP 接入点地址查询
 *
 * 对标 Java MCP 控制器:
 *   GET /api/agents/{id}/mcp/address  → GET /api/agents/[id]/mcp/address
 *
 * 返回智能体对应的 MCP 接入点 URL。
 *
 * @module agents/[id]/mcp/address
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

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

  // 从系统参数中获取 MCP 接入地址
  const mcpAddress = await cache.hget('sys:params', 'server.mcp_address');
  const mcpPort = await cache.hget('sys:params', 'server.mcp_port');

  const address = mcpAddress || process.env.MCP_ADDRESS || 'ws://localhost';
  const port = mcpPort || process.env.MCP_PORT || '8002';

  return NextResponse.json({
    code: 0,
    data: { address: `${address}:${port}`, agentId: id },
  });
}
