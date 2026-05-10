import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { hashPassword } from '@/lib/password';
import { serializeBigInt } from '@/lib/serialize';

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
      include: {
        _count: { select: { devices: true, agents: true } },
      },
    }),
  ]);

  const mapped = list.map(u => {
    const { _count, ...user } = u;
    return {
      ...serializeBigInt(user),
      deviceCount: _count.devices,
      agentCount: _count.agents,
    };
  });

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: mapped },
  });
}

// PUT /api/admin/users/change-status — 批量启用/禁用用户
export async function PUT(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.status === undefined || !Array.isArray(body.userIds)) {
    return NextResponse.json({ code: 400, msg: '参数错误' });
  }

  const status = body.status === 0 ? 0 : 1;
  const userIds = body.userIds.map((id: any) => BigInt(id));

  await prisma.sysUser.updateMany({
    where: { id: { in: userIds } },
    data: { status },
  });

  return NextResponse.json({ code: 0, msg: `已${status === 1 ? '启用' : '禁用'} ${userIds.length} 个用户` });
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
