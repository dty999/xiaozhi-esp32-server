/**
 * 设备详情 / 更新 / 删除
 *
 * 对标 Java DeviceController.java 中:
 *   GET    /device/update/{id}  → GET    /api/devices/[id] （设备详情）
 *   PUT    /device/update/{id}  → PUT    /api/devices/[id] （更新设备）
 *   DELETE /device/{id}         → DELETE /api/devices/[id] （删除设备）
 *
 * @module devices/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// GET /api/devices/[id] — 设备详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const device = await prisma.aiDevice.findUnique({
    where: { id: BigInt(id) },
    include: {
      agent: { select: { id: true, agentName: true, agentCode: true } },
      user: { select: { id: true, username: true, realName: true } },
    },
  });

  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }
  if (device.userId !== userId && !isAdmin) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  return NextResponse.json({
    code: 0,
    data: {
      id: device.id.toString(),
      macAddress: device.macAddress,
      alias: device.alias,
      board: device.board,
      appVersion: device.appVersion,
      deviceType: device.deviceType,
      isBound: device.isBound,
      activationCode: device.activationCode,
      lastConnectedAt: device.lastConnectedAt,
      otaAutoUpdate: device.otaAutoUpdate,
      firmwareType: device.firmwareType,
      chipInfo: device.chipInfo,
      partitionTable: device.partitionTable,
      createDate: device.createDate,
      updateDate: device.updateDate,
      agent: device.agent ? {
        id: device.agent.id.toString(),
        agentName: device.agent.agentName,
        agentCode: device.agent.agentCode,
      } : null,
      user: device.user ? {
        id: device.user.id.toString(),
        username: device.user.username,
        realName: device.user.realName,
      } : null,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const userId = auth.payload!.userId;
  const deviceId = BigInt(id);

  // 校验设备存在且归属当前用户
  const device = await prisma.aiDevice.findUnique({ where: { id: deviceId } });
  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }
  if (device.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 更新设备信息
  await prisma.aiDevice.update({
    where: { id: deviceId },
    data: {
      alias: body.alias !== undefined ? body.alias : undefined,
      deviceType: body.deviceType !== undefined ? body.deviceType : undefined,
      otaAutoUpdate: body.otaAutoUpdate !== undefined ? body.otaAutoUpdate : undefined,
      firmwareType: body.firmwareType !== undefined ? body.firmwareType : undefined,
      board: body.board !== undefined ? body.board : undefined,
      updater: userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, msg: '设备信息已更新' });
}

// DELETE /api/devices/[id] — 删除设备
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const device = await prisma.aiDevice.findUnique({ where: { id: BigInt(id) } });
  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }
  if (device.userId !== userId && !isAdmin) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  await prisma.aiDevice.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '设备已删除' });
}
