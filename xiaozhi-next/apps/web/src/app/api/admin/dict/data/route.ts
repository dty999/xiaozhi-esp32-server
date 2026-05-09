import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// GET /api/admin/dict/data — 字典数据分页
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const dictTypeId = searchParams.get('dictTypeId') || '';
  const dictLabel = searchParams.get('dictLabel') || '';

  const where: any = {};
  if (dictTypeId) where.dictTypeId = BigInt(dictTypeId);
  if (dictLabel) where.dictLabel = { contains: dictLabel };

  const [total, list] = await Promise.all([
    prisma.sysDictData.count({ where }),
    prisma.sysDictData.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { sort: 'asc' },
      include: { dictType: true },
    }),
  ]);

  const serialized = list.map(d => ({
    ...d,
    id: d.id.toString(),
    dictTypeId: d.dictTypeId.toString(),
    dictType: d.dictType ? { ...d.dictType, id: d.dictType.id.toString() } : null,
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: serialized },
  });
}

// POST /api/admin/dict/data — 新增字典数据
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const data = await prisma.sysDictData.create({
    data: {
      id: generateSnowflakeId(),
      dictTypeId: BigInt(body.dictTypeId),
      dictLabel: body.dictLabel,
      dictValue: body.dictValue,
      remark: body.remark,
      sort: body.sort || 0,
    },
  });

  // 清除字典缓存
  const dictType = await prisma.sysDictType.findUnique({ where: { id: BigInt(body.dictTypeId) } });
  if (dictType) {
    await cache.del(`sys:dict:data:${dictType.dictType}`);
  }

  return NextResponse.json({ code: 0, data: serializeData(data) });
}

// PUT /api/admin/dict/data — 修改字典数据
export async function PUT(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const data = await prisma.sysDictData.update({
    where: { id: BigInt(body.id) },
    data: {
      dictLabel: body.dictLabel,
      dictValue: body.dictValue,
      remark: body.remark,
      sort: body.sort,
    },
  });

  // 清除字典缓存
  const dictType = await prisma.sysDictType.findUnique({ where: { id: data.dictTypeId } });
  if (dictType) {
    await cache.del(`sys:dict:data:${dictType.dictType}`);
  }

  return NextResponse.json({ code: 0, data: serializeData(data) });
}

function serializeData(d: any) { return { ...d, id: d.id.toString(), dictTypeId: d.dictTypeId.toString() }; }

// DELETE /api/admin/dict/data — 删除字典数据
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

  const data = await prisma.sysDictData.findUnique({ where: { id: BigInt(id) } });
  if (data) {
    const dictType = await prisma.sysDictType.findUnique({ where: { id: data.dictTypeId } });
    if (dictType) {
      await cache.del(`sys:dict:data:${dictType.dictType}`);
    }
  }

  await prisma.sysDictData.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '字典数据已删除' });
}
