/**
 * 下载当前会话的聊天记录 TXT 文件（一次性令牌，下载后即焚）
 *
 * 对标 Java AgentChatHistoryController.java 中:
 *   GET /agent/chat-history/download/{uuid}/current
 *       → GET /api/chat/download/[uuid]/current
 *
 * 输出格式（每行）：
 *   [角色]-[时间]>>或<<:内容
 *   其中 >> 为用户消息，<< 为 AI 回复
 *
 * @module chat/download/[uuid]/current
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

/** 格式化日期为 "yyyy-MM-dd HH:mm:ss" */
function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${mi}:${s}`;
}

/** 生成一段会话的文本内容 */
function buildChatText(
  messages: { chatType: number; content: string | null; createdAt: Date | null }[],
  sessionTimeHeader?: string
): string {
  const lines: string[] = [];

  if (sessionTimeHeader) {
    lines.push(sessionTimeHeader);
  }

  for (const msg of messages) {
    const role = msg.chatType === 1 ? '用户' : 'AI';
    const direction = msg.chatType === 1 ? '>>' : '<<';
    const timeStr = msg.createdAt ? formatDateTime(msg.createdAt) : '';
    const content = msg.content || '';
    lines.push(`[${role}]-[${timeStr}]${direction}:${content}`);
  }

  return lines.join('\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // 从 Redis 获取 agentId 和 sessionId
  const stored = await cache.get(`agent:chat:history:${uuid}`);
  if (!stored) {
    return NextResponse.json({ code: 404, msg: '下载链接已过期或不存在' }, { status: 404 });
  }

  const parts = stored.split(':');
  if (parts.length !== 2) {
    return NextResponse.json({ code: 400, msg: '下载链接无效' }, { status: 400 });
  }

  const agentId = BigInt(parts[0]);
  const sessionId = parts[1];

  try {
    // 查询当前会话所有消息
    const messages = await prisma.agentChatHistory.findMany({
      where: { agentId, sessionId },
      orderBy: { createdAt: 'asc' },
      select: { chatType: true, content: true, createdAt: true },
    });

    // 组装文本
    let sessionTimeHeader = '';
    if (messages.length > 0 && messages[0].createdAt) {
      sessionTimeHeader = formatDateTime(messages[0].createdAt);
    }

    const text = buildChatText(messages, sessionTimeHeader);

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Disposition': 'attachment;filename=history.txt',
      },
    });
  } finally {
    // 下载完成后删除 Redis Key（一次性令牌，防止盗刷）
    await cache.del(`agent:chat:history:${uuid}`);
  }
}
