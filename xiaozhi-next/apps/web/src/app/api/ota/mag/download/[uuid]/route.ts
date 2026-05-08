/**
 * 固件文件下载（限 3 次下载）
 *
 * 对标 Java OTAMagController.java:
 *   GET /ota/mag/download/{uuid}  → GET /api/ota/mag/download/[uuid]
 *
 * 流程：
 *   1. 从 Redis 获取 UUID 对应的固件 ID
 *   2. 检查下载次数（最多 3 次）
 *   3. 从文件系统读取固件文件
 *   4. 返回 application/octet-stream
 *
 * @module ota/mag/download/[uuid]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // 从 Redis 获取固件 ID
  const firmwareId = await cache.get(`ota:id:${uuid}`);
  if (!firmwareId) {
    return NextResponse.json({ code: 404, msg: '下载链接已过期' }, { status: 404 });
  }

  // 检查下载次数（最多 3 次）
  const currentCount = parseInt(await cache.get(`ota:download:count:${uuid}`) || '0');
  if (currentCount >= 3) {
    return NextResponse.json({ code: 429, msg: '下载次数已达上限（3次）' }, { status: 429 });
  }

  // 下载计数 +1
  await cache.set(`ota:download:count:${uuid}`, String(currentCount + 1), 1800);

  // 查找固件记录并读取文件
  const firmware = await prisma.aiOta.findUnique({
    where: { id: BigInt(firmwareId) },
  });

  if (!firmware || !firmware.firmwarePath) {
    return NextResponse.json({ code: 404, msg: '固件不存在或路径为空' });
  }

  try {
    // 从文件系统读取固件文件
    const filePath = join(process.cwd(), 'uploads', 'firmware', firmware.firmwarePath);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${firmware.firmwareName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch {
    return NextResponse.json({ code: 404, msg: '固件文件不存在' }, { status: 404 });
  }
}
