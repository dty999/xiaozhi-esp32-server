import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';

// GET /api/admin/dict/types — 字典类型分页
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const dictType = searchParams.get('dictType') || '';

  const where: any = {};
  if (dictType) where.dictType = { contains: dictType };

  const [total, list] = await Promise.all([
    prisma.sysDictType.count({ where }),
    prisma.sysDictType.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { id: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// POST /api/admin/dict/types — 新增字典类型
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json();
  const dictType = await prisma.sysDictType.create({
    data: {
      id: generateSnowflakeId(),
      dictType: body.dictType,
      dictName: body.dictName,
      remark: body.remark,
      sort: body.sort || 0,
    },
  });

  return NextResponse.json({ code: 0, data: dictType });
}

// PUT /api/admin/dict/types — 修改字典类型
export async function PUT(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json();
  const dictType = await prisma.sysDictType.update({
    where: { id: BigInt(body.id) },
    data: {
      dictType: body.dictType,
      dictName: body.dictName,
      remark: body.remark,
      sort: body.sort,
    },
  });

  return NextResponse.json({ code: 0, data: dictType });
}

// DELETE /api/admin/dict/types — 删除字典类型（含子数据）
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ code: 400, msg: '缺少 id 参数' });
  }

  // 先删除关联的字典数据
  await prisma.sysDictData.deleteMany({ where: { dictTypeId: BigInt(id) } });
  await prisma.sysDictType.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '字典类型已删除' });
}
