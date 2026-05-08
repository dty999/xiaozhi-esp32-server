/**
 * 设备更新（按 MAC 地址）— uni-app 兼容层
 *
 * uni-app 的 device/update/:macAddress 使用 MAC 地址作为设备标识，
 * 而 Next.js 使用数据库 BigInt ID。此路由完成 MAC→ID 转换。
 *
 * @module devices/by-mac/update
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// PUT /api/devices/by-mac/update — 按 MAC 更新设备
export async function PUT(
  request: NextRequest,
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body || !body.macAddress) {
    return NextResponse.json({ code: 400, msg: 'MAC地址不能为空' });
  }

  // 按 MAC 查找设备
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress: body.macAddress },
  });

  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  // 更新
  await prisma.aiDevice.update({
    where: { id: device.id },
    data: {
      alias: body.alias !== undefined ? body.alias : undefined,
      deviceType: body.deviceType !== undefined ? body.deviceType : undefined,
      otaAutoUpdate: body.otaAutoUpdate !== undefined ? body.otaAutoUpdate : undefined,
      firmwareType: body.firmwareType !== undefined ? body.firmwareType : undefined,
      board: body.board !== undefined ? body.board : undefined,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, msg: '设备已更新' });
}
