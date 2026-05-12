/**
 * OTA 设备激活确认
 *
 * 对标固件规范: POST {ota_url}/activate
 *
 * 设备显示激活码后，轮询此接口确认激活状态。
 * 支持 HMAC-SHA256 挑战验证。
 *
 * 请求头：Activation-Version, Device-Id, Client-Id, Serial-Number, User-Agent, Accept-Language
 * 请求体：{ algorithm, serial_number, challenge, hmac }
 *
 * 响应状态码：
 *   200 - 激活成功
 *   202 - 待确认（设备需继续轮询）
 *   其他 - 激活失败
 *
 * @module ota/activate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';
import { createHmac } from 'crypto';

/** HMAC 密钥（应与固件编译时的 CONFIG_HMAC_KEY 一致） */
const HMAC_KEY = process.env.DEVICE_HMAC_KEY || 'xiaozhi-default-hmac-key-change-in-production';

export async function POST(request: NextRequest) {
  // ---- 1. 解析请求头 ----
  const deviceId = request.headers.get('Device-Id') || '';
  const clientId = request.headers.get('Client-Id') || '';
  const serialNumber = request.headers.get('Serial-Number') || '';

  if (!deviceId) {
    return NextResponse.json(
      { error: 'Missing Device-Id header' },
      { status: 400 }
    );
  }

  // ---- 2. 查找设备 ----
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress: deviceId },
  });

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found' },
      { status: 404 }
    );
  }

  // ---- 3. 已绑定检查 ----
  if (device.isBound === 1) {
    return NextResponse.json({ message: 'success' }, { status: 200 });
  }

  // ---- 4. 解析请求体 ----
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { algorithm, serial_number, challenge, hmac: deviceHmac } = body;

  // ---- 5. 从 Redis 获取挑战记录 ----
  const challengeKey = `ota:challenge:${deviceId}`;
  const challengeData = await cache.get(challengeKey);

  if (!challengeData) {
    // 挑战已过期或不存在，返回 202 让设备继续轮询
    return NextResponse.json(
      { message: 'Challenge expired or not found' },
      { status: 202 }
    );
  }

  let storedChallenge: { challenge: string; activationCode: string; serialNumber?: string };
  try {
    storedChallenge = JSON.parse(challengeData);
  } catch {
    return NextResponse.json(
      { error: 'Invalid challenge data' },
      { status: 500 }
    );
  }

  // ---- 6. 验证 HMAC ----
  if (algorithm === 'hmac-sha256' && challenge && deviceHmac) {
    // 验证挑战是否匹配
    if (challenge !== storedChallenge.challenge) {
      return NextResponse.json(
        { error: 'Challenge mismatch' },
        { status: 400 }
      );
    }

    // 计算期望的 HMAC
    const expectedHmac = createHmac('sha256', HMAC_KEY)
      .update(challenge)
      .digest('hex');

    // 验证 HMAC（支持前后 16 字节匹配，兼容固件不同实现）
    const deviceHmacLower = String(deviceHmac).toLowerCase();
    const expectedHmacLower = expectedHmac.toLowerCase();

    // 完全匹配或前 16 字节匹配
    const isValid =
      deviceHmacLower === expectedHmacLower ||
      deviceHmacLower === expectedHmacLower.slice(0, 32);

    if (isValid) {
      // HMAC 验证通过，激活设备
      await prisma.aiDevice.update({
        where: { id: device.id },
        data: { isBound: 1 },
      });

      // 清理挑战缓存
      await cache.del(challengeKey);

      return NextResponse.json({ message: 'success' }, { status: 200 });
    } else {
      // HMAC 不匹配，返回 400
      return NextResponse.json(
        { error: 'HMAC verification failed' },
        { status: 400 }
      );
    }
  }

  // ---- 7. 无 HMAC 数据，检查是否已通过其他方式激活 ----
  // 如果设备有待确认的激活码，返回 202 让设备继续轮询
  if (device.activationCode) {
    return NextResponse.json(
      { message: 'Waiting for activation confirmation' },
      { status: 202 }
    );
  }

  return NextResponse.json(
    { error: 'Activation required' },
    { status: 400 }
  );
}
