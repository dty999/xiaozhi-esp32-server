/**
 * 上传音频文件用于声音克隆（≤10MB, mp3/wav）
 *
 * 对标 Java VoiceCloneController:
 *   POST /voice-clone/upload  → POST /api/voice-clone/upload
 *
 * @module voice-clone/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = (formData.get('name') as string) || '';
    const modelId = formData.get('modelId') as string;

    if (!file || (!(file instanceof File) && !file?.name)) {
      return NextResponse.json({ code: 400, msg: '请选择音频文件' });
    }

    if (!modelId) {
      return NextResponse.json({ code: 400, msg: '请选择模型' });
    }

    // 文件大小限制
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ code: 400, msg: '音频文件大小不能超过 10MB' });
    }

    // 文件格式限制
    const ext = file.name?.split('.').pop()?.toLowerCase();
    if (ext !== 'mp3' && ext !== 'wav') {
      return NextResponse.json({ code: 400, msg: '仅支持 mp3 和 wav 格式' });
    }

    // 保存文件
    const uniqueName = `${Date.now()}_${file.name}`;
    const uploadDir = join(process.cwd(), 'uploads', 'voice-clone');
    await mkdir(uploadDir, { recursive: true });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(uploadDir, uniqueName);
    await writeFile(filePath, fileBuffer);

    // 保存记录
    const clone = await prisma.voiceClone.create({
      data: {
        id: generateSnowflakeId(),
        name: name || file.name,
        modelId: BigInt(modelId),
        voiceId: `clone_${Date.now()}`,
        userId: auth.payload!.userId,
        trainStatus: 0, // 0=未训练
      },
    });

    return NextResponse.json({ code: 0, data: clone });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `上传失败: ${e.message}` });
  }
}
