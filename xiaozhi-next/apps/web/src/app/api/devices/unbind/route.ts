/**
 * 解绑设备
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/unbind  → POST /api/devices/unbind
 *
 * @module devices/unbind
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
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

  const userId = auth.payload!.userId;
  const deviceId = body.deviceId;

  if (!deviceId) {
    return NextResponse.json({ code: 400, msg: '缺少设备ID' });
  }

  // 校验设备归属
  const device = await prisma.aiDevice.findUnique({
    where: { id: BigInt(deviceId) },
  });

  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  if (device.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限解绑该设备' }, { status: 403 });
  }

  // 解绑设备：清除 agentId 和用户ID，置 isBound=0
  await prisma.aiDevice.update({
    where: { id: BigInt(deviceId) },
    data: {
      agentId: null,
      userId: null,
      isBound: 0,
    },
  });

  return NextResponse.json({ code: 0, msg: '设备已解绑' });
}
