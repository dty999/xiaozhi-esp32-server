/**
 * 获取已绑定设备列表 / 设备在线状态
 *
 * 对标 Java DeviceController.java 中:
 *   GET  /device/bind/{agentId}  → GET  /api/devices/bind/[agentId] （已绑列表）
 *   POST /device/bind/{agentId}  → POST /api/devices/bind/[agentId] （设备在线数据）
 *
 * @module devices/bind/[agentId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// ─────────────────────────────────────────────
// GET /api/devices/bind/[agentId] — 获取已绑定设备列表
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { agentId } = await params;
  const userId = auth.payload!.userId;

  // 权限校验
  const agent = await prisma.aiAgent.findUnique({ where: { id: BigInt(agentId) } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 查询该智能体已绑定的设备
  const devices = await prisma.aiDevice.findMany({
    where: {
      agentId: BigInt(agentId),
      isBound: 1,
    },
    orderBy: { createDate: 'desc' },
  });

  // 转换为前端友好格式
  const list = devices.map(d => ({
    id: d.id.toString(),
    macAddress: d.macAddress,
    alias: d.alias,
    board: d.board,
    appVersion: d.appVersion,
    deviceType: d.deviceType,
    lastConnectedAt: d.lastConnectedAt,
    otaAutoUpdate: d.otaAutoUpdate,
    firmwareType: d.firmwareType,
    createDate: d.createDate,
  }));

  return NextResponse.json({ code: 0, data: list });
}

// ─────────────────────────────────────────────
// POST /api/devices/bind/[agentId] — 查询设备在线状态
// ─────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { agentId } = await params;
  const userId = auth.payload!.userId;

  // 权限校验
  const agent = await prisma.aiAgent.findUnique({ where: { id: BigInt(agentId) } });
  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (agent.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 查询设备在线状态（通过 lastConnectedAt 判断，5分钟内在线）
  const devices = await prisma.aiDevice.findMany({
    where: {
      agentId: BigInt(agentId),
      isBound: 1,
    },
    select: {
      id: true,
      macAddress: true,
      alias: true,
      lastConnectedAt: true,
    },
  });

  const onlineThreshold = Date.now() - 5 * 60 * 1000; // 5分钟
  const list = devices.map(d => ({
    deviceId: d.id.toString(),
    macAddress: d.macAddress,
    alias: d.alias,
    online: d.lastConnectedAt ? d.lastConnectedAt.getTime() > onlineThreshold : false,
    lastConnectedAt: d.lastConnectedAt,
  }));

  return NextResponse.json({ code: 0, data: list });
}
