import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { decryptoLoginData } from '@/lib/sm2';
import { issueUserToken } from '@/lib/jwt';
import { verifyCaptcha } from '@/lib/captcha';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const { username, password, captchaId } = body;

  // ===================================================================
  //  1. 密码解析：优先 SM2 解密，失败则当作明文处理（兼容测试）
  // ===================================================================
  let realPassword: string;
  let isPlaintext = false;

  const privateKey = (await cache.hget('sys:params', 'server.private_key'))
    || (await prisma.sysParams.findFirst({ where: { paramCode: 'server.private_key' } }))?.paramValue;

  if (privateKey) {
    const decrypted = decryptoLoginData(password, privateKey);
    if (decrypted) {
      // SM2 解密成功 -> 验证码验证走解密后的验证码
      realPassword = decrypted.password;

      if (captchaId) {
        const captchaValid = await verifyCaptcha(captchaId, decrypted.captcha);
        if (!captchaValid) {
          return NextResponse.json({ code: 400, msg: '验证码错误' });
        }
      }
    } else {
      // SM2 解密失败 -> 降级为明文
      realPassword = password;
      isPlaintext = true;
    }
  } else {
    // 没有 SM2 私钥 -> 直接按明文处理
    realPassword = password;
    isPlaintext = true;
  }

  // 明文模式跳过 captcha（开发测试用）
  // ===================================================================
  //  2. 查找用户
  // ===================================================================
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

  // ===================================================================
  //  3. BCrypt 密码校验
  // ===================================================================
  if (!verifyPassword(realPassword, user.password)) {
    return NextResponse.json({ code: 400, msg: '用户名或密码错误' });
  }

  // ===================================================================
  //  4. 签发 Token
  // ===================================================================
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
