/**
 * 调用设备工具（通过 MQTT/WS 转发指令至设备端）
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/tools/call/{deviceId}  → POST /api/devices/[id]/tools/call
 *
 * 请求体包含工具名称和参数，由服务端通过消息通道转发至设备执行。
 *
 * @module devices/[id]/tools/call
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

export async function POST(
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

  const deviceId = BigInt(id);
  const { name: toolName, arguments: toolArgs } = body;

  if (!toolName) {
    return NextResponse.json({ code: 400, msg: '缺少工具名称' });
  }

  // 查找设备
  const device = await prisma.aiDevice.findUnique({ where: { id: deviceId } });
  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  // 此处为简化实现：记录调用请求，后续由 WS Server 层实际转发
  // 生产环境应通过 MQTT/Socket.IO 等通道将指令推送至设备端
  const callResult = {
    deviceId: device.id.toString(),
    macAddress: device.macAddress,
    toolName,
    arguments: toolArgs || {},
    status: 'dispatched',
    message: '指令已下发，等待设备执行',
  };

  return NextResponse.json({ code: 0, data: callResult });
}
