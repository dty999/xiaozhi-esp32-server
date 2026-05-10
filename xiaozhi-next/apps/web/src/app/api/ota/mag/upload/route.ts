/**
 * 固件文件上传（.bin / .apk）
 *
 * 对标 Java OTAMagController.java:
 *   POST /ota/mag/upload  → POST /api/ota/mag/upload
 *
 * 支持 multipart/form-data 上传固件文件。
 * 文件保存至 uploads/firmware/ 目录。
 *
 * @module ota/mag/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { generateSnowflakeId } from '@/lib/snowflake';
import { prisma } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { serializeBigInt } from '@/lib/serialize';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const firmwareName = formData.get('firmwareName') as string;
    const type = formData.get('type') as string || 'default';
    const version = formData.get('version') as string || '';

    if (!file || (!(file instanceof File) && !file?.name)) {
      return NextResponse.json({ code: 400, msg: '请选择固件文件' });
    }

    // 只允许 .bin 和 .apk 格式
    const fileName = file.name || 'firmware.bin';
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext !== 'bin' && ext !== 'apk') {
      return NextResponse.json({ code: 400, msg: '仅支持 .bin 和 .apk 格式固件' });
    }

    // 生成唯一文件名
    const uniqueName = `${Date.now()}_${fileName}`;
    const uploadDir = join(process.cwd(), 'uploads', 'firmware');
    await mkdir(uploadDir, { recursive: true });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(uploadDir, uniqueName);
    await writeFile(filePath, fileBuffer);

    // 计算 MD5
    const md5 = createHash('md5').update(fileBuffer).digest('hex');

    // 保存固件记录
    const firmware = await prisma.aiOta.create({
      data: {
        id: generateSnowflakeId(),
        firmwareName: firmwareName || fileName,
        firmwarePath: uniqueName,
        type,
        version,
        fileSize: BigInt(fileBuffer.length),
        md5,
        creator: auth.payload!.userId,
      },
    });

    return NextResponse.json({ code: 0, data: serializeBigInt(firmware) });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `固件上传失败: ${e.message}` }, { status: 500 });
  }
}
