/**
 * 下载当前会话及之前最多 20 条会话的聊天记录 TXT 文件
 *
 * 对标 Java AgentChatHistoryController.java 中:
 *   GET /agent/chat-history/download/{uuid}/previous
 *       → GET /api/chat/download/[uuid]/previous
 *
 * 流程：
 *   1. 从 Redis 获取 agentId 和 sessionId
 *   2. 查询该智能体所有会话列表（最多 1000 条）
 *   3. 定位当前会话在列表中的位置
 *   4. 收集当前会话及之前最多 20 条会话
 *   5. 合并导出为 text/plain 文件
 *   6. 删除 Redis 令牌
 *
 * @module chat/download/[uuid]/previous
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${mi}:${s}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // 从 Redis 获取存储的 agentId:sessionId
  const stored = await cache.get(`agent:chat:history:${uuid}`);
  if (!stored) {
    return NextResponse.json({ code: 404, msg: '下载链接已过期或不存在' }, { status: 404 });
  }

  const parts = stored.split(':');
  if (parts.length !== 2) {
    return NextResponse.json({ code: 400, msg: '下载链接无效' }, { status: 400 });
  }

  const agentId = BigInt(parts[0]);
  const targetSessionId = parts[1];

  try {
    // 1. 获取该智能体所有会话列表（按最新消息排序）
    const sessions = await prisma.agentChatHistory.groupBy({
      by: ['sessionId'],
      where: { agentId },
      _max: { createdAt: true },
    });
    sessions.sort((a, b) => {
      const ta = a._max.createdAt?.getTime() || 0;
      const tb = b._max.createdAt?.getTime() || 0;
      return ta - tb; // 升序排列（最早 → 最新）
    });

    // 2. 定位当前会话
    let currentIndex = -1;
    for (let i = 0; i < sessions.length; i++) {
      if (sessions[i].sessionId === targetSessionId) {
        currentIndex = i;
        break;
      }
    }

    // 3. 收集要下载的会话 ID（当前 + 之前最多 20 条）
    const sessionIdsToDownload: string[] = [];
    if (currentIndex !== -1) {
      // 从当前会话向前取最多 20 条（含当前）
      const endIndex = Math.min(sessions.length - 1, currentIndex + 20);
      for (let i = currentIndex; i <= endIndex; i++) {
        sessionIdsToDownload.push(sessions[i].sessionId);
      }
    }

    if (sessionIdsToDownload.length === 0) {
      sessionIdsToDownload.push(targetSessionId);
    }

    // 4. 逐会话获取聊天记录并拼接文本
    const textParts: string[] = [];

    for (let idx = 0; idx < sessionIdsToDownload.length; idx++) {
      const sid = sessionIdsToDownload[idx];
      const messages = await prisma.agentChatHistory.findMany({
        where: { agentId, sessionId: sid },
        orderBy: { createdAt: 'asc' },
        select: { chatType: true, content: true, createdAt: true },
      });

      if (messages.length === 0) continue;

      // 会话时间头
      if (messages[0].createdAt) {
        textParts.push(formatDateTime(messages[0].createdAt));
      }

      for (const msg of messages) {
        const role = msg.chatType === 1 ? '用户' : 'AI';
        const direction = msg.chatType === 1 ? '>>' : '<<';
        const timeStr = msg.createdAt ? formatDateTime(msg.createdAt) : '';
        textParts.push(`[${role}]-[${timeStr}]${direction}:${msg.content || ''}`);
      }

      // 会话间空行分隔
      if (idx < sessionIdsToDownload.length - 1) {
        textParts.push('');
      }
    }

    const text = textParts.join('\n');

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Disposition': 'attachment;filename=history.txt',
      },
    });
  } finally {
    // 5. 删除 Redis 令牌
    await cache.del(`agent:chat:history:${uuid}`);
  }
}
