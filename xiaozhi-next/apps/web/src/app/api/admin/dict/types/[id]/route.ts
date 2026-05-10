/**
 * 字典类型详情 / 更新
 *
 * @module admin/dict/types/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/admin/dict/types/[id] — 字典类型详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  const dictType = await prisma.sysDictType.findUnique({
    where: { id: BigInt(id) },
    include: { dictDatas: { orderBy: { sort: 'asc' } } },
  });

  if (!dictType) {
    return NextResponse.json({ code: 404, msg: '字典类型不存在' });
  }

  return NextResponse.json({ code: 0, data: serializeBigInt(dictType) });
}

// PUT /api/admin/dict/types/[id] — 更新字典类型
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  await prisma.sysDictType.update({
    where: { id: BigInt(id) },
    data: {
      dictType: body.dictType,
      dictName: body.dictName,
      remark: body.remark,
      sort: body.sort ?? 0,
    },
  });

  return NextResponse.json({ code: 0, msg: '字典类型已更新' });
}

// DELETE /api/admin/dict/types/[id] — 删除字典类型
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  await prisma.sysDictType.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '字典类型已删除' });
}
