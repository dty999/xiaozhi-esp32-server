/**
 * ============================================================
 * Coze LLM 提供者
 * 对标旧Python: core/providers/llm/coze/
 *
 * 使用 Coze 扣子 API（v3 chat）
 * Coze 提供 Bot 对话、工作流等功能
 * ============================================================
 */

import type { LLMProvider, LLMResponse, ChatMessage, ToolDefinition, TokenCallback } from '../../types';

export class CozeLLMProvider implements LLMProvider {
  readonly name = 'CozeLLM';

  private apiUrl: string;
  private apiKey: string;
  private botId: string;

  constructor(config: any) {
    this.apiUrl = config.api_url || 'https://api.coze.cn';
    this.apiKey = config.api_key || process.env.COZE_API_KEY || '';
    this.botId = config.bot_id || process.env.COZE_BOT_ID || '';
  }

  async responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    if (!this.apiKey || !this.botId) {
      throw new Error('Coze API Key 或 Bot ID 未配置');
    }

    try {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) {
        throw new Error('消息中无用户输入');
      }

      // 构建 Coze 请求
      const requestBody: any = {
        bot_id: this.botId,
        user_id: 'xiaozhi-esp32',
        stream: true,
        additional_messages: [
          {
            role: 'user',
            content: lastUserMsg.content,
            content_type: 'text',
          },
        ],
      };

      // 添加上下文（前几轮对话）
      const historyMessages = messages.filter(
        m => m.role !== 'system' && m !== lastUserMsg,
      ).slice(-6);

      if (historyMessages.length > 0) {
        requestBody.chat_history = historyMessages.map(m => ({
          role: m.role,
          content: m.content,
          content_type: 'text',
        }));
      }

      const response = await fetch(`${this.apiUrl}/v3/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Coze API error: ${response.status}`);
      }

      let fullText = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'answer' && parsed.content) {
              fullText += parsed.content;
              await onToken(parsed.content);
            }
          } catch {}
        }
      }

      return {
        text: fullText,
        finishReason: 'stop',
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.error(`[CozeLLM] 错误: ${e.message}`);
      throw e;
    }
  }
}
