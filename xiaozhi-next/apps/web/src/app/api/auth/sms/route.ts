import { NextRequest, NextResponse } from 'next/server';
import { verifyCaptcha } from '@/lib/captcha';
import { sendSmsCode } from '@/lib/sms';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { phone, captcha, captchaId } = body;

  // 1. 验证图形验证码
  if (!captchaId || !captcha) {
    return NextResponse.json({ code: 400, msg: '请完成图形验证' });
  }
  const captchaValid = await verifyCaptcha(captchaId, captcha);
  if (!captchaValid) {
    return NextResponse.json({ code: 400, msg: '图形验证码错误' });
  }

  // 2. 发送短信
  const result = await sendSmsCode(phone);
  if (!result.success) {
    return NextResponse.json({ code: 400, msg: result.message });
  }

  return NextResponse.json({ code: 0, msg: '验证码已发送' });
}
