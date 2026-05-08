/**
 * 手动添加设备（管理员/用户直接添加 MAC 地址）
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/manual-add  → POST /api/devices/manual-add
 *
 * @module devices/manual-add
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { macAddress, agentId, alias, board, appVersion, deviceType } = body;
  const userId = auth.payload!.userId;

  if (!macAddress) {
    return NextResponse.json({ code: 400, msg: 'MAC地址不能为空' });
  }

  if (!agentId) {
    return NextResponse.json({ code: 400, msg: '智能体ID不能为空' });
  }

  // 检查 MAC 地址是否已被绑定
  const existingDevice = await prisma.aiDevice.findFirst({
    where: { macAddress },
  });

  if (existingDevice && existingDevice.isBound === 1) {
    return NextResponse.json({ code: 400, msg: '该MAC地址已绑定其他智能体' });
  }

  if (existingDevice) {
    // 更新已有设备
    await prisma.aiDevice.update({
      where: { id: existingDevice.id },
      data: {
        agentId: BigInt(agentId),
        userId,
        isBound: 1,
        alias: alias || undefined,
        board: board || undefined,
        appVersion: appVersion || undefined,
        deviceType: deviceType || undefined,
      },
    });
  } else {
    // 创建设备
    await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress,
        agentId: BigInt(agentId),
        userId,
        isBound: 1,
        alias: alias || null,
        board: board || null,
        appVersion: appVersion || null,
        deviceType: deviceType || null,
      },
    });
  }

  return NextResponse.json({ code: 0, msg: '设备添加成功' });
}
