import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

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
