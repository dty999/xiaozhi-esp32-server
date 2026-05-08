import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/password';

export async function PUT(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { oldPassword, newPassword } = await request.json();

  const user = await prisma.sysUser.findUnique({ where: { id: auth.payload!.userId } });
  if (!user || !verifyPassword(oldPassword, user.password)) {
    return NextResponse.json({ code: 400, msg: '原密码错误' });
  }

  await prisma.sysUser.update({
    where: { id: user.id },
    data: { password: hashPassword(newPassword) },
  });

  return NextResponse.json({ code: 0, msg: '密码修改成功' });
}
