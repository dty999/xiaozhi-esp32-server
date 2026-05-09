/**
 * 设备管理 — 管理端分页 / 新增 / 设备列表
 *
 * 对标 Java DeviceController.java 中:
 *   GET  /device/list       → GET  /api/devices （分页查询）
 *   POST /device             → POST /api/devices （新增设备 / 手动添加）
 *
 * @module devices
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';

// GET /api/devices — 分页查询设备
//   ?page=1&limit=10&keyword=&agentId=
//   管理员查看全部，普通用户只看自己
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const keyword = searchParams.get('keyword') || '';
  const agentId = searchParams.get('agentId') || '';
  const isBound = searchParams.get('isBound');

  const userId = auth.payload!.userId;
  const isAdmin = auth.payload!.superAdmin === 1;

  const where: any = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (keyword) {
    where.macAddress = { contains: keyword };
  }
  if (agentId) {
    where.agentId = BigInt(agentId);
  }
  if (isBound !== null && isBound !== undefined && isBound !== '') {
    where.isBound = parseInt(isBound);
  }

  const [total, list] = await Promise.all([
    prisma.aiDevice.count({ where }),
    prisma.aiDevice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
      include: {
        agent: { select: { id: true, agentName: true, agentCode: true } },
        user: { select: { id: true, username: true, realName: true } },
      },
    }),
  ]);

  const mappedList = list.map(d => ({
    id: d.id.toString(),
    macAddress: d.macAddress,
    alias: d.alias,
    board: d.board,
    appVersion: d.appVersion,
    deviceType: d.deviceType,
    isBound: d.isBound,
    activationCode: d.activationCode,
    lastConnectedAt: d.lastConnectedAt,
    otaAutoUpdate: d.otaAutoUpdate,
    firmwareType: d.firmwareType,
    createDate: d.createDate,
    updateDate: d.updateDate,
    agentName: d.agent?.agentName || '',
    agentCode: d.agent?.agentCode || '',
    username: d.user?.username || '',
    realName: d.user?.realName || '',
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: mappedList },
  });
}

// POST /api/devices — 手动添加设备
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.macAddress) {
    return NextResponse.json({ code: 400, msg: 'MAC地址不能为空' });
  }

  // 检查MAC是否已存在
  const existing = await prisma.aiDevice.findFirst({
    where: { macAddress: body.macAddress },
  });
  if (existing) {
    return NextResponse.json({ code: 409, msg: '设备MAC地址已存在' });
  }

  const userId = auth.payload!.userId;

  const device = await prisma.aiDevice.create({
    data: {
      id: generateSnowflakeId(),
      macAddress: body.macAddress,
      ...(body.agentId ? { agentId: BigInt(body.agentId) } : {}),
      userId,
      alias: body.alias || null,
      board: body.board || null,
      appVersion: body.appVersion || null,
      deviceType: body.deviceType || null,
      isBound: body.isBound ?? 0,
      activationCode: body.activationCode || null,
      firmwareType: body.firmwareType || null,
      otaAutoUpdate: body.otaAutoUpdate ?? 0,
      chipInfo: body.chipInfo || null,
      partitionTable: body.partitionTable || null,
      creator: userId,
    },
  });

  return NextResponse.json({
    code: 0,
    msg: '设备添加成功',
    data: { id: device.id.toString() },
  });
}
