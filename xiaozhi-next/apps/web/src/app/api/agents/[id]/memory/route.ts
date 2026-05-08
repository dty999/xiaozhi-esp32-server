/**
 * 更新智能体记忆（由设备端通过 MAC 地址调用）
 *
 * 对标 Java AgentController.java 中:
 *   PUT /agent/saveMemory/{macAddress}  → PUT /api/agents/[id]/memory
 *
 * 此处 [id] 使用 macAddress（设备 MAC 地址）。
 *
 * @module agents/[id]/memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: macAddress } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  // 根据 MAC 地址查找设备
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress },
  });

  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  if (!device.agentId || device.isBound !== 1) {
    return NextResponse.json({ code: 400, msg: '设备未绑定智能体' });
  }

  // 更新智能体记忆摘要
  await prisma.aiAgent.update({
    where: { id: device.agentId },
    data: {
      summaryMemory: body.summaryMemory || null,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, msg: '记忆保存成功' });
}
