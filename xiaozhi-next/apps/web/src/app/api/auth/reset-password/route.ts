import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { sm2Decrypt } from '@/lib/sm2';
import { verifySmsCode } from '@/lib/sms';
import { safeParseBody } from '@/lib/request-body';

export async function PUT(request: NextRequest) {
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const { phone, password, code, captchaId } = body;

  // 验证短信验证码
  const valid = await verifySmsCode(phone, code);
  if (!valid) {
    return NextResponse.json({ code: 400, msg: '验证码错误或已过期' });
  }

  // SM2解密新密码
  const privateKeyParam = await prisma.sysParams.findFirst({
    where: { paramCode: 'server.private_key' },
  });
  if (!privateKeyParam) {
    return NextResponse.json({ code: 500, msg: '系统配置错误：缺少SM2私钥' });
  }

  let plainPassword: string;
  try {
    plainPassword = sm2Decrypt(password, privateKeyParam.paramValue);
  } catch {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 查找用户
  const user = await prisma.sysUser.findFirst({ where: { mobile: phone } });
  if (!user) {
    return NextResponse.json({ code: 400, msg: '该手机号未注册' });
  }

  // 更新密码
  await prisma.sysUser.update({
    where: { id: user.id },
    data: { password: hashPassword(plainPassword) },
  });

  return NextResponse.json({ code: 0, msg: '密码已重置' });
}
