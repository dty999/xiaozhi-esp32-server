import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/admin/params/[id] — 参数详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  const param = await prisma.sysParams.findUnique({ where: { id: BigInt(id) } });
  if (!param) {
    return NextResponse.json({ code: 404, msg: '参数不存在' });
  }

  return NextResponse.json({ code: 0, data: serializeBigInt(param) });
}

// PUT /api/admin/params/[id] — 更新参数
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const old = await prisma.sysParams.findUnique({ where: { id: BigInt(id) } });
  if (!old) {
    return NextResponse.json({ code: 404, msg: '参数不存在' });
  }

  const updated = await prisma.sysParams.update({
    where: { id: BigInt(id) },
    data: {
      paramValue: body.paramValue ?? old.paramValue,
      remark: body.remark ?? old.remark,
      valueType: body.valueType ?? old.valueType,
    },
  });

  // 同步 Redis 缓存
  await cache.hset('sys:params', updated.paramCode, updated.paramValue);

  return NextResponse.json({ code: 0, data: serializeBigInt(updated) });
}

// DELETE /api/admin/params/[id] — 删除参数
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  const old = await prisma.sysParams.findUnique({ where: { id: BigInt(id) } });
  if (old) {
    await cache.hdel('sys:params', old.paramCode);
  }

  await prisma.sysParams.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '参数已删除' });
}
