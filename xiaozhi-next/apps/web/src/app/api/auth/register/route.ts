import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { sm2Decrypt } from '@/lib/sm2';
import { verifySmsCode } from '@/lib/sms';
import { generateSnowflakeId } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password, captchaId, mobileCaptcha, phone, areaCode } = body;

  // 获取 SM2 私钥
  const param = await prisma.sysParams.findFirst({
    where: { paramCode: 'server.private_key' },
  });
  const privateKey = param?.paramValue;
  if (!privateKey) {
    return NextResponse.json({ code: 500, msg: '系统配置错误' });
  }

  // 解密密码
  let plainPassword: string;
  try {
    plainPassword = sm2Decrypt(password, privateKey);
  } catch {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 短信验证码校验
  if (phone && mobileCaptcha) {
    const valid = await verifySmsCode(phone, mobileCaptcha);
    if (!valid) {
      return NextResponse.json({ code: 400, msg: '短信验证码错误或已过期' });
    }
  }

  // 检查用户名是否已存在
  if (username) {
    const existing = await prisma.sysUser.findFirst({ where: { username } });
    if (existing) {
      return NextResponse.json({ code: 400, msg: '用户名已被注册' });
    }
  }

  // 检查手机号是否已注册
  if (phone) {
    const existing = await prisma.sysUser.findFirst({ where: { mobile: phone } });
    if (existing) {
      return NextResponse.json({ code: 400, msg: '手机号已被注册' });
    }
  }

  // 创建用户
  const user = await prisma.sysUser.create({
    data: {
      id: generateSnowflakeId(),
      username: username || `user_${phone}`,
      password: hashPassword(plainPassword),
      mobile: phone,
      status: 1,
      superAdmin: 0,
    },
  });

  return NextResponse.json({
    code: 0,
    msg: '注册成功',
    data: { userId: user.id.toString(), username: user.username },
  });
}
