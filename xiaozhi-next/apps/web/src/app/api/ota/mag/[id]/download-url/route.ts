/**
 * 获取固件下载 UUID（一次性临时令牌）
 *
 * 对标 Java OTAMagController.java:
 *   GET /ota/mag/{id}/download-url  → GET /api/ota/mag/[id]/download-url
 *
 * 生成 UUID 存入 Redis（ota:id:{uuid}），下载限 3 次。
 *
 * @module ota/mag/[id]/download-url
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

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

  // 生成 UUID 存入 Redis，记录固件ID和下载计数限制
  const uuid = uuidv4();
  await cache.set(`ota:id:${uuid}`, id, 1800); // 30分钟
  await cache.set(`ota:download:count:${uuid}`, '0', 1800); // 下载计数

  return NextResponse.json({ code: 0, data: uuid });
}
