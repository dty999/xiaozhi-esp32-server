/**
 * ============================================================
 * Google Gemini LLM 提供者
 * 对标旧Python: core/providers/llm/gemini/
 *
 * 使用 Google Gemini API (generativeLanguage)
 * 支持流式生成和 Function Calling
 * ============================================================
 */

import type { LLMProvider, LLMResponse, ChatMessage, ToolDefinition, TokenCallback } from '../../types';

export class GeminiLLMProvider implements LLMProvider {
  readonly name = 'GeminiLLM';

  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private topP: number;

  constructor(config: any) {
    this.apiUrl = config.api_url || 'https://generativelanguage.googleapis.com';
    this.apiKey = config.api_key || process.env.GEMINI_API_KEY || '';
    this.model = config.model_name || 'gemini-2.0-flash';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.max_tokens || 2048;
    this.topP = config.top_p ?? 0.9;
  }

  async responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Gemini API Key 未配置');
    }

    // 将 OpenAI 格式消息转为 Gemini 格式
    const contents = this._convertMessages(messages);
    const systemInstruction = this._extractSystemInstruction(messages);

    // 转换工具定义
    const toolDeclarations = tools.length > 0
      ? [{ functionDeclarations: tools.map(t => this._convertTool(t)) }]
      : undefined;

    try {
      const requestBody: any = {
        contents,
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          topP: this.topP,
        },
      };

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      if (toolDeclarations) {
        requestBody.tools = toolDeclarations;
      }

      const response = await fetch(
        `${this.apiUrl}/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      let fullText = '';
      let fullToolCalls: any[] = [];
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
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const candidates = parsed.candidates || [];
            for (const candidate of candidates) {
              const content = candidate.content;
              if (!content) continue;
              // 文本部分
              const parts = content.parts || [];
              for (const part of parts) {
                if (part.text) {
                  fullText += part.text;
                  await onToken(part.text);
                }
                if (part.functionCall) {
                  fullToolCalls.push({
                    functionName: part.functionCall.name,
                    args: part.functionCall.args,
                  });
                }
              }
            }
          } catch {}
        }
      }

      // 转换工具调用为 OpenAI 格式
      const toolCalls = fullToolCalls.map((tc, i) => ({
        id: `gemini_call_${i}`,
        type: 'function' as const,
        function: {
          name: tc.functionName,
          arguments: JSON.stringify(tc.args),
        },
      }));

      return {
        text: fullText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.error(`[GeminiLLM] 错误: ${e.message}`);
      throw e;
    }
  }

  private _convertMessages(messages: ChatMessage[]): any[] {
    const contents: any[] = [];
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      if (role === 'system') continue; // system 在 systemInstruction 单独处理
      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      // 工具调用
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
            },
          });
        }
      }

      // 工具响应
      if (msg.role === 'tool' && msg.tool_call_id) {
        parts.push({
          functionResponse: {
            name: msg.tool_call_id,
            response: { result: msg.content },
          },
        });
      }

      if (parts.length === 0) continue;

      // 合并连续的相同角色
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }
    return contents;
  }

  private _extractSystemInstruction(messages: ChatMessage[]): string {
    const systemMsgs = messages.filter(m => m.role === 'system');
    return systemMsgs.map(m => m.content).join('\n\n');
  }

  private _convertTool(tool: ToolDefinition): any {
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    };
  }
}
