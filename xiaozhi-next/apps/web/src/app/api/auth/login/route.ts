import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { decryptoLoginData } from '@/lib/sm2';
import { issueUserToken } from '@/lib/jwt';
import { verifyCaptcha } from '@/lib/captcha';
import { cache } from '@/lib/redis';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password, captchaId } = body;

  // 1. SM2 解密 password 字段 -> 获得 "captcha:password" 格式
  const privateKey = (await cache.hget('sys:params', 'server.private_key'))
    || (await prisma.sysParams.findFirst({ where: { paramCode: 'server.private_key' } }))?.paramValue;

  if (!privateKey) {
    return NextResponse.json({ code: 500, msg: '系统配置错误：缺少SM2私钥' });
  }

  const decrypted = decryptoLoginData(password, privateKey);
  if (!decrypted) {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 2. 验证 captcha
  if (captchaId) {
    const captchaValid = await verifyCaptcha(captchaId, decrypted.captcha);
    if (!captchaValid) {
      return NextResponse.json({ code: 400, msg: '验证码错误' });
    }
  }

  // 3. 查找用户（支持用户名或手机号）
  const user = await prisma.sysUser.findFirst({
    where: {
      OR: [
        { username: username },
        { mobile: username },
      ],
      status: 1,
    },
  });

  if (!user) {
    return NextResponse.json({ code: 400, msg: '用户名或密码错误' });
  }

  // 4. BCrypt 密码校验
  if (!verifyPassword(decrypted.password, user.password)) {
    return NextResponse.json({ code: 400, msg: '用户名或密码错误' });
  }

  // 5. 签发 Token
  const token = await issueUserToken({
    id: user.id,
    username: user.username,
    superAdmin: user.superAdmin,
  });

  return NextResponse.json({
    code: 0,
    msg: 'success',
    data: {
      token,
      userInfo: {
        id: user.id.toString(),
        username: user.username,
        realName: user.realName,
        email: user.email,
        mobile: user.mobile,
        superAdmin: user.superAdmin,
        status: user.status,
        headUrl: user.headUrl,
      },
    },
  });
}
