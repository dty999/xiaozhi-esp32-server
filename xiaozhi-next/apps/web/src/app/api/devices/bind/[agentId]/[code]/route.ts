/**
 * 设备绑定（使用激活码）
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/bind/{agentId}/{deviceCode}  → POST /api/devices/bind/[agentId]/[code]
 *
 * 流程：
 *   1. 校验用户权限
 *   2. 从 Redis 按激活码查找对应的 MAC 地址
 *   3. 验证设备存在且未绑定
 *   4. 将设备绑定到指定智能体
 *   5. 清除 Redis 中的激活码
 *
 * @module devices/bind/[agentId]/[code]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; code: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { agentId, code } = await params;
  const userId = auth.payload!.userId;

  // 验证智能体归属
  const agent = await prisma.aiAgent.findUnique({ where: { id: BigInt(agentId) } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 验证激活码
  const macAddress = await cache.get(`sys:device:captcha:${code}`);
  if (!macAddress) {
    return NextResponse.json({ code: 400, msg: '激活码无效或已过期' });
  }

  // 查找设备
  const device = await prisma.aiDevice.findFirst({ where: { macAddress } });
  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  if (device.isBound === 1) {
    return NextResponse.json({ code: 400, msg: '设备已绑定到其他智能体' });
  }

  // 绑定设备
  await prisma.aiDevice.update({
    where: { id: device.id },
    data: {
      agentId: BigInt(agentId),
      userId,
      isBound: 1,
    },
  });

  // 清除激活码
  await cache.del(`sys:device:captcha:${code}`);

  return NextResponse.json({ code: 0, msg: '绑定成功' });
}
