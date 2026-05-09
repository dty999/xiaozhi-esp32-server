/**
 * 设备注册 —— ESP32 设备提交 MAC 地址，生成 6 位激活码
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/register  → POST /api/devices/register
 *
 * 流程：
 *   1. 接收设备 MAC 地址
 *   2. 若设备已绑定，拒绝注册
 *   3. 生成 6 位随机激活码（不重复）
 *   4. 将 code→mac 映射存入 Redis（24 小时有效期）
 *   5. 若设备不存在则新建，已存在则更新
 *   6. 返回激活码给设备端（设备端可在显示屏上展示）
 *
 * @module devices/register
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { macAddress, board, appVersion, chipInfo } = body;

  if (!macAddress) {
    return NextResponse.json({ code: 400, msg: 'MAC地址不能为空' });
  }

  // 检查设备是否已绑定
  const existingDevice = await prisma.aiDevice.findFirst({
    where: { macAddress },
  });

  if (existingDevice && existingDevice.isBound === 1) {
    return NextResponse.json({ code: 400, msg: '设备已绑定' });
  }

  // 生成不重复的6位激活码
  let activationCode: string;
  let existsCode: string | null;
  do {
    activationCode = String(Math.random()).substring(2, 8);
    existsCode = await cache.get(`sys:device:captcha:${activationCode}`);
  } while (existsCode);

  // 存入 Redis，24 小时有效期
  await cache.set(`sys:device:captcha:${activationCode}`, macAddress, 86400);

  let device;
  if (!existingDevice) {
    // 新建设备记录
    device = await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress,
        board: board || null,
        appVersion: appVersion || null,
        chipInfo: chipInfo ? JSON.stringify(chipInfo) : null,
        activationCode,
        isBound: 0,
      },
    });
  } else {
    // 更新已有设备信息
    device = await prisma.aiDevice.update({
      where: { id: existingDevice.id },
      data: {
        activationCode,
        board: board || undefined,
        appVersion: appVersion || undefined,
        chipInfo: chipInfo ? JSON.stringify(chipInfo) : undefined,
      },
    });
  }

  return NextResponse.json({
    code: 0,
    data: {
      activationCode,
      deviceId: device.id.toString(),
      macAddress: device.macAddress,
    },
  });
}
