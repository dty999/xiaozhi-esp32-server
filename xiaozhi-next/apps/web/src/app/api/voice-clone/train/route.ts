/**
 * 执行声音克隆训练
 *
 * 对标 Java VoiceCloneServiceImpl.cloneAudio / huoshanClone:
 *   POST /voice-clone/train  → POST /api/voice-clone/train
 *
 * 根据模型配置的 type 字段选择克隆方式：
 *   - huoshan_double_stream: 火山引擎双流克隆
 *
 * API 地址从模型配置 configJson 中读取，支持自定义：
 *   configJson.api_url  或  configJson.apiUrl  （可选，有默认值）
 *   configJson.appid
 *   configJson.access_token
 *
 * 状态机: 0(未训练) → 1(训练中) → 2(训练成功) / 3(训练失败)
 *
 * @module voice-clone/train
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';
import { serializeBigInt } from '@/lib/serialize';
import { readFile } from 'fs/promises';

/** 火山引擎声音克隆 API 默认地址 */
const DEFAULT_CLONE_API = 'https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { cloneId } = body;
  if (!cloneId) {
    return NextResponse.json({ code: 400, msg: '请指定克隆记录ID' });
  }

  const clone = await prisma.voiceClone.findUnique({
    where: { id: BigInt(cloneId) },
  });

  if (!clone) {
    return NextResponse.json({ code: 404, msg: '克隆记录不存在' });
  }

  if (clone.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 校验音频文件
  if (!clone.audioPath) {
    return NextResponse.json({ code: 400, msg: '请先上传音频文件' });
  }

  // 获取模型配置
  const modelConfig = await prisma.modelConfig.findUnique({
    where: { id: clone.modelId },
  });

  if (!modelConfig || !modelConfig.configJson) {
    await prisma.voiceClone.update({
      where: { id: BigInt(cloneId) },
      data: { trainStatus: 3, trainError: '模型配置未找到' },
    });
    return NextResponse.json({ code: 400, msg: '模型配置未找到' });
  }

  const config = modelConfig.configJson as Record<string, any>;
  const type = config.type;

  if (!type) {
    await prisma.voiceClone.update({
      where: { id: BigInt(cloneId) },
      data: { trainStatus: 3, trainError: '模型配置缺少 type 字段' },
    });
    return NextResponse.json({ code: 400, msg: '模型类型未配置' });
  }

  // 更新状态为训练中
  await prisma.voiceClone.update({
    where: { id: BigInt(cloneId) },
    data: { trainStatus: 1, trainError: null },
  });

  try {
    if (type === 'huoshan_double_stream') {
      await huoshanClone(config, clone);
    } else {
      throw new Error(`不支持的克隆类型: ${type}`);
    }

    return NextResponse.json({ code: 0, msg: '训练完成', data: serializeBigInt(clone) });
  } catch (e: any) {
    const errorMsg = e.message || '训练失败';
    await prisma.voiceClone.update({
      where: { id: BigInt(cloneId) },
      data: { trainStatus: 3, trainError: errorMsg },
    });
    return NextResponse.json({ code: 500, msg: `训练失败: ${errorMsg}` }, { status: 500 });
  }
}

/**
 * 火山引擎双流克隆
 * 对标 Java VoiceCloneServiceImpl.huoshanClone
 *
 * API 地址优先从 config.api_url / config.apiUrl 读取，缺省使用默认值。
 */
async function huoshanClone(config: Record<string, any>, clone: any): Promise<void> {
  const appid = config.appid || config.app_id;
  const accessToken = config.access_token || config.accessToken;
  const apiUrl = config.api_url || config.apiUrl || DEFAULT_CLONE_API;

  if (!appid || !accessToken) {
    throw new Error('火山引擎配置缺少 appid 或 access_token');
  }

  // 读取音频文件转 Base64
  const audioBuffer = await readFile(clone.audioPath);
  const audioBase64 = audioBuffer.toString('base64');

  // 构建请求体（与旧项目格式一致）
  const reqBody = {
    appid,
    audios: [{ audio_bytes: audioBase64, audio_format: 'wav' }],
    source: 2,
    language: 0,
    model_type: 1,
    speaker_id: clone.voiceId,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer;${accessToken}`,
      'Resource-Id': 'seed-icl-1.0',
    },
    body: JSON.stringify(reqBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`火山引擎 API 返回 ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  // 解析响应（与旧项目格式一致）
  const baseResp = result.BaseResp;
  if (baseResp) {
    const statusCode = baseResp.StatusCode;
    const statusMessage = baseResp.StatusMessage || '';
    const speakerId = result.speaker_id;

    if (statusCode === 0 && speakerId) {
      // 训练成功
      await prisma.voiceClone.update({
        where: { id: clone.id },
        data: { trainStatus: 2, trainError: null, voiceId: speakerId },
      });
    } else {
      // 训练失败
      throw new Error(statusMessage || '训练失败');
    }
  } else {
    const errorMsg = result.message || '火山引擎响应格式异常';
    throw new Error(errorMsg);
  }
}
