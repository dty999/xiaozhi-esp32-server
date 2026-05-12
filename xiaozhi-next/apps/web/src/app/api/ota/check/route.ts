/**
 * OTA 版本检查与设备激活状态检查
 *
 * 对标固件规范: POST {ota_url}
 *
 * 设备端上报 chipInfo 与 application 信息，服务端返回固件规范格式：
 *   - firmware: 固件信息
 *   - activation: 激活信息
 *   - mqtt: MQTT 配置
 *   - websocket: WebSocket 配置
 *   - server_time: 服务器时间
 *
 * 请求头：Activation-Version, Device-Id, Client-Id, Serial-Number, User-Agent, Accept-Language
 *
 * @module ota/check
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { cache } from '@/lib/redis';
import { issueDeviceToken } from '@/lib/jwt';
import { safeParseBody } from '@/lib/request-body';
import { createHash, randomBytes } from 'crypto';

/** 激活超时时间（毫秒） */
const ACTIVATION_TIMEOUT_MS = 30000;

export async function POST(request: NextRequest) {
  // ---- 1. 解析请求头 ----
  const activationVersion = request.headers.get('Activation-Version') || '1';
  const deviceId = request.headers.get('Device-Id') || '';
  const clientId = request.headers.get('Client-Id') || '';
  const serialNumber = request.headers.get('Serial-Number') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptLanguage = request.headers.get('Accept-Language') || 'zh';

  if (!deviceId) {
    return NextResponse.json(
      { error: 'Missing Device-Id header' },
      { status: 400 }
    );
  }

  // ---- 2. 解析请求体 ----
  const body = await safeParseBody(request);
  const { chipInfo, application } = body || {};

  // ---- 3. 查找或创建设备 ----
  let device = await prisma.aiDevice.findFirst({
    where: { macAddress: deviceId },
  });

  if (!device) {
    device = await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress: deviceId,
        isBound: 0,
        appVersion: application?.version || null,
        chipInfo: chipInfo ? JSON.stringify(chipInfo) : null,
        board: application?.name || null,
      },
    });
  } else {
    // 更新设备信息
    await prisma.aiDevice.update({
      where: { id: device.id },
      data: {
        lastConnectedAt: new Date(),
        appVersion: application?.version || device.appVersion,
        chipInfo: chipInfo ? JSON.stringify(chipInfo) : device.chipInfo,
      },
    });
  }

  // ---- 4. 获取最新固件信息 ----
  const firmwareType = device.firmwareType || 'default';
  const latestFirmware = await prisma.aiOta.findFirst({
    where: { type: firmwareType },
    orderBy: { createDate: 'desc' },
  });

  // ---- 5. 生成 WebSocket Token ----
  const wsToken = await issueDeviceToken(deviceId);

  // ---- 6. 获取配置地址 ----
  const wsHost =
    (await cache.hget('sys:params', 'server.ws_host')) ||
    process.env.WS_HOST ||
    `ws://localhost:${process.env.WS_PORT || 8000}`;

  const mqttEndpoint =
    (await cache.hget('sys:params', 'server.mqtt_gateway')) ||
    process.env.MQTT_ENDPOINT ||
    '';

  // ---- 7. 构建 MQTT 配置 ----
  let mqttConfig = null;
  if (mqttEndpoint) {
    const [host, portStr] = mqttEndpoint.split(':');
    const port = parseInt(portStr || '8883');
    mqttConfig = {
      endpoint: `${host}:${port}`,
      client_id: `xiaozhi_${deviceId.replace(/:/g, '')}`,
      username: `device_${deviceId.replace(/:/g, '')}`,
      password: wsToken,
      publish_topic: `device/${deviceId.replace(/:/g, '')}`,
      keepalive: 240,
    };
  }

  // ---- 8. 构建 WebSocket 配置 ----
  const wsConfig = {
    url: `${wsHost}/xiaozhi/v1/`,
    token: wsToken,
    version: 1,
  };

  // ---- 9. 处理激活逻辑 ----
  let activationConfig = null;
  if (device.isBound !== 1) {
    // 生成激活码和挑战
    const activationCode = device.activationCode || generateActivationCode();
    const challenge = randomBytes(32).toString('hex');

    // 更新设备激活码和挑战
    if (!device.activationCode) {
      await prisma.aiDevice.update({
        where: { id: device.id },
        data: { activationCode },
      });
    }

    // 缓存挑战到 Redis（5分钟有效）
    await cache.set(
      `ota:challenge:${deviceId}`,
      JSON.stringify({ challenge, activationCode, serialNumber }),
      300
    );

    activationConfig = {
      message:
        acceptLanguage === 'en'
          ? 'Please activate your device'
          : acceptLanguage === 'ja'
            ? 'デバイスを有効化してください'
            : '请激活设备',
      code: activationCode,
      challenge,
      timeout_ms: ACTIVATION_TIMEOUT_MS,
    };
  }

  // ---- 10. 构建固件规范响应 ----
  const response: Record<string, any> = {};

  // 固件信息
  if (latestFirmware && latestFirmware.firmwarePath) {
    const firmwareUrl = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/ota/mag/download/${latestFirmware.id}`;
    response.firmware = {
      version: latestFirmware.version || '1.0.0',
      url: firmwareUrl,
      force: 0,
    };
  }

  // 激活信息
  if (activationConfig) {
    response.activation = activationConfig;
  }

  // MQTT 配置（存在则优先使用）
  if (mqttConfig) {
    response.mqtt = mqttConfig;
  }

  // WebSocket 配置
  response.websocket = wsConfig;

  // 服务器时间
  const now = new Date();
  response.server_time = {
    timestamp: now.getTime(),
    timezone_offset: -now.getTimezoneOffset(),
  };

  return NextResponse.json(response);
}

/** 生成6位数字激活码 */
function generateActivationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
