/**
 * OTA 快速激活检查
 *
 * 对标 Java OTAController.java 中:
 *   POST /ota/activate  → POST /api/ota/activate
 *
 * 仅根据 Device-Id 头查询设备是否已激活。
 * 返回 202（未激活）或 200 "success"（已激活）。
 *
 * @module ota/activate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const deviceId = request.headers.get('Device-Id') || '';

  if (!deviceId) {
    return NextResponse.json({ code: 400, msg: '缺少 Device-Id 头' });
  }

  const device = await prisma.aiDevice.findFirst({
    where: { macAddress: deviceId },
  });

  if (!device || device.isBound !== 1) {
    return NextResponse.json({ code: 202, msg: '设备未激活' }, { status: 202 });
  }

  return NextResponse.json({ code: 0, msg: 'success' });
}
