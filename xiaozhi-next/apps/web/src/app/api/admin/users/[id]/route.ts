import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/admin/users/[id] — 用户详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.sysUser.findUnique({
    where: { id: BigInt(id) },
    include: {
      agents: { select: { id: true, agentName: true, agentCode: true } },
      devices: { select: { id: true, macAddress: true, alias: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ code: 404, msg: '用户不存在' });
  }

  return NextResponse.json({ code: 0, data: serializeBigInt(user) });
}

// PUT /api/admin/users/[id] — 重置密码
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  // 生成随机密码
  const newPassword = Math.random().toString(36).slice(-8);

  await prisma.sysUser.update({
    where: { id: BigInt(id) },
    data: { password: hashPassword(newPassword) },
  });

  return NextResponse.json({ code: 0, data: { password: newPassword } });
}

// DELETE /api/admin/users/[id] — 删除用户
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  await prisma.sysUser.delete({
    where: { id: BigInt(id) },
  });

  return NextResponse.json({ code: 0, msg: '用户已删除' });
}
