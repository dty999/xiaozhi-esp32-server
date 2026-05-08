/**
 * 小智服务聊天上报（含 Base64 音频解码入库）
 *
 * 对标 Java AgentChatHistoryController.java 中:
 *   POST /agent/chat-history/report  → POST /api/chat/report
 *
 * 流程：
 *   1. 接收聊天记录（含可选 Base64 编码的音频数据）
 *   2. 如果有音频，进行 MD5 去重并解码存入 ai_agent_chat_audio 表（ByteA 二进制）
 *   3. 保存聊天记录到 ai_agent_chat_history 表
 *
 * @module chat/report
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { agentId, sessionId, chatType, content, audio, macAddress } = body;

  if (!agentId || !sessionId) {
    return NextResponse.json({ code: 400, msg: '缺少必要参数 agentId 或 sessionId' });
  }

  let audioId: string | null = null;

  // 如果有音频数据（Base64 编码），解码并存入数据库
  if (audio && typeof audio === 'string' && audio.length > 0) {
    // 使用 MD5 去重：相同音频内容不重复存储
    audioId = createHash('md5').update(audio).digest('hex').slice(0, 32);

    // 检查音频是否已存储
    const existingAudio = await prisma.agentChatAudio.findUnique({
      where: { audioId },
    });

    if (!existingAudio) {
      try {
        const audioBuffer = Buffer.from(audio, 'base64');
        await prisma.agentChatAudio.create({
          data: {
            audioId,
            audioData: audioBuffer,
          },
        });
      } catch {
        // Base64 解码失败时不存音频，仅保存文本记录
        audioId = null;
      }
    }
  }

  // 保存聊天记录
  await prisma.agentChatHistory.create({
    data: {
      id: generateSnowflakeId(),
      agentId: BigInt(agentId),
      sessionId,
      chatType: chatType ?? 0, // 0=AI, 1=用户
      content: content || null,
      audioId,
      macAddress: macAddress || null,
    },
  });

  return NextResponse.json({ code: 0, msg: '上报成功' });
}
