import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const user = await prisma.sysUser.findUnique({
    where: { id: auth.payload!.userId },
  });

  if (!user) {
    return NextResponse.json({ code: 401, msg: '用户不存在' });
  }

  return NextResponse.json({
    code: 0,
    data: {
      id: user.id.toString(),
      username: user.username,
      realName: user.realName,
      email: user.email,
      mobile: user.mobile,
      superAdmin: user.superAdmin,
      status: user.status,
      headUrl: user.headUrl,
      createDate: user.createDate,
    },
  });
}
