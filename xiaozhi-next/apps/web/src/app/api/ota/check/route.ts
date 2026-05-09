/**
 * OTA 版本检查与设备激活状态检查
 *
 * 对标 Java OTAController.java 中:
 *   POST /ota/  → POST /api/ota/check
 *
 * 设备端上报 chipInfo 与 application 信息，服务端返回：
 *   - 激活状态 active
 *   - WebSocket 连接地址与 Token
 *   - 最新固件信息（版本/URL/大小/MD5）
 *
 * 请求头：Device-Id（MAC地址）、Client-Id（设备标识）
 *
 * @module ota/check
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { cache } from '@/lib/redis';
import { issueDeviceToken } from '@/lib/jwt';
import { safeParseBody } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const deviceId = request.headers.get('Device-Id') || '';
  const clientId = request.headers.get('Client-Id') || '';

  if (!deviceId) {
    return NextResponse.json({ code: 400, msg: '缺少 Device-Id 头' });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { chipInfo, application } = body;

  // 查找设备
  let device = await prisma.aiDevice.findFirst({
    where: { macAddress: deviceId },
  });

  // 自动注册未识别的设备
  if (!device) {
    device = await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress: deviceId,
        isBound: 0,
        appVersion: application?.version || null,
        chipInfo: chipInfo ? JSON.stringify(chipInfo) : null,
      },
    });
  }

  // 生成 WebSocket Token（用于后续 WS 连接认证）
  const wsToken = await issueDeviceToken(deviceId);

  // 获取最新固件信息
  const firmwareType = device.firmwareType || 'default';
  const latestFirmware = await prisma.aiOta.findFirst({
    where: { type: firmwareType },
    orderBy: { createDate: 'desc' },
  });

  // 获取 WS / MQTT 地址配置
  const wsHost = (await cache.hget('sys:params', 'server.ws_host')) || process.env.WS_HOST || 'ws://localhost:8000';
  const mqttHost = (await cache.hget('sys:params', 'server.mqtt_gateway')) || '';

  // 更新最后连接时间
  await prisma.aiDevice.update({
    where: { id: device.id },
    data: { lastConnectedAt: new Date() },
  });

  return NextResponse.json({
    code: 0,
    data: {
      active: device.isBound === 1,
      deviceId: device.id.toString(),
      wsAddress: `${wsHost}/xiaozhi/v1/`,
      mqttAddress: mqttHost,
      wsToken,
      firmware: latestFirmware && latestFirmware.firmwarePath
        ? {
            version: latestFirmware.version,
            url: `/api/ota/mag/download/${latestFirmware.id}`,
            size: latestFirmware.fileSize?.toString(),
            md5: latestFirmware.md5,
          }
        : null,
    },
  });
}
