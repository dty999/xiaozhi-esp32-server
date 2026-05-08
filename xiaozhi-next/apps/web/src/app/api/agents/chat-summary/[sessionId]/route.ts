/**
 * 异步生成并保存会话聊天总结
 *
 * 对标 Java AgentController.java 中:
 *   POST /agent/chat-summary/{sessionId}/save  → POST /api/agents/chat-summary/[sessionId]
 *
 * 流程：
 *   1. 根据 sessionId 查找聊天记录
 *   2. 获取智能体配置的 LLM 模型
 *   3. 调用 LLM 生成对话摘要
 *   4. 更新智能体的 summaryMemory 字段
 *
 * 注意：Java 端使用异步线程执行，此处简化同步处理（生产环境可改用队列）。
 *
 * @module agents/chat-summary/[sessionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ code: 400, msg: '缺少 agentId 参数' });
  }

  try {
    // 1. 获取会话最近50条聊天记录
    const messages = await prisma.agentChatHistory.findMany({
      where: { agentId: BigInt(agentId), sessionId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (messages.length === 0) {
      return NextResponse.json({ code: 0, data: { summary: '' } });
    }

    // 2. 拼接待总结的对话文本
    const conversationText = messages
      .map(m => {
        const role = m.chatType === 1 ? '用户' : 'AI';
        return `${role}: ${m.content || ''}`;
      })
      .join('\n');

    // 3. 获取智能体的 LLM 配置
    const agent = await prisma.aiAgent.findUnique({
      where: { id: BigInt(agentId) },
    });
    const llmConfig = agent?.llmModelId
      ? await prisma.modelConfig.findUnique({ where: { id: agent.llmModelId } })
      : null;

    let summary = '';

    if (llmConfig?.configJson) {
      const config = llmConfig.configJson as Record<string, any>;
      const apiUrl = config.api_url || config.base_url || config.baseUrl;

      if (apiUrl && config.api_key) {
        try {
          const response = await fetch(`${apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.api_key}`,
            },
            body: JSON.stringify({
              model: config.model || config.model_name || 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: '请用一段话总结以下对话内容。' },
                { role: 'user', content: conversationText },
              ],
              max_tokens: 200,
            }),
          });
          const result = await response.json();
          summary = result.choices?.[0]?.message?.content || '';
        } catch {
          // LLM 调用失败时返回空摘要，不阻塞接口
          console.error('LLM 总结生成失败');
        }
      }
    }

    // 4. 保存总结到智能体
    await prisma.aiAgent.update({
      where: { id: BigInt(agentId) },
      data: {
        summaryMemory: summary,
        updateDate: new Date(),
      },
    });

    return NextResponse.json({ code: 0, data: { summary } });
  } catch (e: any) {
    return NextResponse.json({ code: 500, msg: `总结生成失败: ${e.message}` }, { status: 500 });
  }
}
