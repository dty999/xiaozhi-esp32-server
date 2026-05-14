import { cache } from './redis';
import { prisma } from './db';

/**
 * 短信发送（阿里云 SMS HTTP API 封装）
 * 此处仅定义接口，实际实现需调用阿里云 SDK 或 HTTP API
 */
export async function sendSmsCode(phone: string): Promise<{
  success: boolean;
  message: string;
}> {
  // 1. 检查发送频率（60秒间隔）
  const lastSend = await cache.get(`sms:Validate:Code:${phone}:last_send_time`);
  if (lastSend) {
    return { success: false, message: '发送过于频繁，请60秒后再试' };
  }

  // 2. 检查日上限（默认 5 次）
  const todayCount = await cache.incr(`sms:Validate:Code:${phone}:today_count`);
  if (todayCount > 5) {
    return { success: false, message: '今日发送次数已达上限' };
  }

  // 3. 生成 6 位验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 4. 发送短信（此处接入阿里云短信 API）
  // const aliyunResult = await aliyunSms.send(phone, code);

  // 5. 缓存验证码（5 分钟）
  await cache.set(`sms:Validate:Code:${phone}`, code, 300);
  await cache.set(`sms:Validate:Code:${phone}:last_send_time`, Date.now().toString(), 60);

  return { success: true, message: '验证码已发送' };
}

/**
 * 验证短信验证码
 */
export async function verifySmsCode(phone: string, code: string): Promise<boolean> {
  const stored = await cache.get(`sms:Validate:Code:${phone}`);
  if (!stored) return false;
  if (stored !== code) return false;
  await cache.del(`sms:Validate:Code:${phone}`);
  return true;
}
