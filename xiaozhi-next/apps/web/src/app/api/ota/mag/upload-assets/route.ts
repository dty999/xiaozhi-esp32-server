/**
 * 上传资源固件（≤20MB，限50次/日）
 *
 * 对标 Java OTAMagController.java:
 *   POST /ota/mag/upload-assets  → POST /api/ota/mag/upload-assets
 *
 * 用于上传资源文件（如字体、图片资源包等），文件大小限制 20MB。
 * 每日上传次数限制 50 次（按 IP 或用户）。
 *
 * @module ota/mag/upload-assets
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { generateSnowflakeId } from '@/lib/snowflake';
import { prisma } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { cache } from '@/lib/redis';

// 最大文件大小：20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// 每日上传限制：50 次
const DAILY_LIMIT = 50;

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 每日上传限制检查
  const todayKey = `ota:upload_count:${new Date().toISOString().slice(0, 10)}`;
  const todayCount = parseInt(await cache.get(todayKey) || '0');
  if (todayCount >= DAILY_LIMIT) {
    return NextResponse.json({ code: 429, msg: `当日上传次数已达上限（${DAILY_LIMIT}次）` }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const firmwareName = formData.get('firmwareName') as string;

    if (!file || (!(file instanceof File) && !file?.name)) {
      return NextResponse.json({ code: 400, msg: '请选择资源文件' });
    }

    // 文件大小限制
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ code: 400, msg: '资源文件大小不能超过 20MB' });
    }

    // 保存文件
    const fileName = file.name || 'assets.bin';
    const uniqueName = `${Date.now()}_${fileName}`;
    const uploadDir = join(process.cwd(), 'uploads', 'firmware');
    await mkdir(uploadDir, { recursive: true });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(uploadDir, uniqueName);
    await writeFile(filePath, fileBuffer);

    const md5 = createHash('md5').update(fileBuffer).digest('hex');

    // 保存记录
    const firmware = await prisma.aiOta.create({
      data: {
        id: generateSnowflakeId(),
        firmwareName: firmwareName || fileName,
        firmwarePath: uniqueName,
        type: 'assets',
        version: '',
        fileSize: BigInt(fileBuffer.length),
        md5,
        creator: auth.payload!.userId,
      },
    });

    // 增加上传计数
    await cache.set(todayKey, String(todayCount + 1), 86400);

    return NextResponse.json({ code: 0, data: firmware });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `资源上传失败: ${e.message}` }, { status: 500 });
  }
}
