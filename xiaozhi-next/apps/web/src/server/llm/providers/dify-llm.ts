/**
 * ============================================================
 * Dify LLM 提供者
 * 对标旧Python: core/providers/llm/dify/
 *
 * 使用 Dify 平台 API（chat-messages / workflows / completion）
 * Dify 自带知识库、工具调用、工作流等能力
 * ============================================================
 */

import type { LLMProvider, LLMResponse, ChatMessage, ToolDefinition, TokenCallback } from '../../types';

export class DifyLLMProvider implements LLMProvider {
  readonly name = 'DifyLLM';

  private apiUrl: string;
  private apiKey: string;
  /** Dify API 端点类型: chat-messages / workflows / completion */
  private endpoint: string;

  constructor(config: any) {
    this.apiUrl = config.api_url || process.env.DIFY_API_URL || '';
    this.apiKey = config.api_key || process.env.DIFY_API_KEY || '';
    this.endpoint = config.mode || 'chat-messages';
  }

  async responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error('Dify API 未配置');
    }

    try {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) {
        throw new Error('消息中无用户输入');
      }

      const requestBody: any = {
        inputs: {},
        query: lastUserMsg.content,
        response_mode: 'streaming',
        user: 'xiaozhi-esp32',
      };

      // 传入对话历史（Dify 的 conversation_id 机制）
      const history = messages
        .filter(m => m.role !== 'system' && m !== lastUserMsg)
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));
      if (history.length > 0) {
        requestBody.conversation_history = history;
      }

      const response = await fetch(`${this.apiUrl}/${this.endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Dify API error: ${response.status}`);
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
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            // Dify 的 SSE 事件类型
            switch (parsed.event) {
              case 'message':
                if (parsed.answer) {
                  fullText += parsed.answer;
                  await onToken(parsed.answer);
                }
                break;
              case 'message_end':
                // 结束标记
                break;
              case 'error':
                console.error(`[DifyLLM] 错误: ${parsed.message}`);
                break;
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
      console.error(`[DifyLLM] 错误: ${e.message}`);
      throw e;
    }
  }
}
