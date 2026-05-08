import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { hashPassword } from '@/lib/password';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const mobile = searchParams.get('mobile') || '';

  const where: any = {};
  if (mobile) where.mobile = { contains: mobile };

  const [total, list] = await Promise.all([
    prisma.sysUser.count({ where }),
    prisma.sysUser.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// POST /api/admin/users — 管理员创建用户
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) {
    return NextResponse.json({ code: 400, msg: '用户名和密码不能为空' });
  }

  // 检查用户名是否已存在
  const existing = await prisma.sysUser.findUnique({ where: { username: body.username } });
  if (existing) {
    return NextResponse.json({ code: 409, msg: '用户名已存在' });
  }

  const user = await prisma.sysUser.create({
    data: {
      id: generateSnowflakeId(),
      username: body.username,
      password: hashPassword(body.password),
      realName: body.realName || null,
      email: body.email || null,
      mobile: body.mobile || null,
      gender: body.gender ?? null,
      superAdmin: body.superAdmin ?? 0,
      status: body.status ?? 1,
      creator: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, msg: '用户创建成功', data: { id: user.id.toString() } });
}
