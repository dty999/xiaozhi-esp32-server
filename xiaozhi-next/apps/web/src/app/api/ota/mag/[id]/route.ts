/**
 * 固件详情 / 修改 / 删除
 *
 * 对标 Java OTAMagController.java:
 *   GET    /ota/mag/{id}  → GET    /api/ota/mag/[id] （详情）
 *   PUT    /ota/mag/{id}  → PUT    /api/ota/mag/[id] （修改）
 *   DELETE /ota/mag/{id}  → DELETE /api/ota/mag/[id] （删除）
 *
 * @module ota/mag/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';
import { serializeBigInt } from '@/lib/serialize';

// ─────────────────────────────────────────────
// GET /api/ota/mag/[id] — 固件详情
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const firmware = await prisma.aiOta.findUnique({
    where: { id: BigInt(id) },
  });

  if (!firmware) {
    return NextResponse.json({ code: 404, msg: '固件不存在' });
  }

  return NextResponse.json({ code: 0, data: serializeBigInt(firmware) });
}

// ─────────────────────────────────────────────
// PUT /api/ota/mag/[id] — 修改固件
// ─────────────────────────────────────────────
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

  const updated = await prisma.aiOta.update({
    where: { id: BigInt(id) },
    data: {
      firmwareName: body.firmwareName !== undefined ? body.firmwareName : undefined,
      firmwarePath: body.firmwarePath !== undefined ? body.firmwarePath : undefined,
      type: body.type !== undefined ? body.type : undefined,
      version: body.version !== undefined ? body.version : undefined,
      fileSize: body.fileSize !== undefined ? BigInt(body.fileSize) : undefined,
      md5: body.md5 !== undefined ? body.md5 : undefined,
      remark: body.remark !== undefined ? body.remark : undefined,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(updated) });
}

// ─────────────────────────────────────────────
// DELETE /api/ota/mag/[id] — 删除固件
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  await prisma.aiOta.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '固件已删除' });
}
