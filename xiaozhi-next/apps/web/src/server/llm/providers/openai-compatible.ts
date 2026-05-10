import type {
  LLMProvider,
  LLMResponse,
  LLMConfig,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  TokenCallback,
} from '../../types';

const THINK_START_TAG = '<think>';
const THINK_END_TAG = '</think>';

export class OpenAICompatibleLLM implements LLMProvider {
  readonly name = 'OpenAICompatibleLLM';

  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private topP: number;

  private static readonly NO_THINK_PREFIXES = [
    'qwen-',
    'glm-4',
    'glm-',
    'moonshot',
    'doubao',
    'deepseek',
  ];

  constructor(config: LLMConfig) {
    this.baseUrl = config.api_url || process.env.LLM_API_URL || 'https://api.openai.com';
    this.apiKey = config.api_key || process.env.LLM_API_KEY || '';
    this.model = config.model_name || 'gpt-4o-mini';
    this.maxTokens = config.max_tokens || 2048;
    this.temperature = config.temperature ?? 0.7;
    this.topP = config.top_p ?? 1.0;

    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
    if (!this.baseUrl.endsWith('/v1')) {
      this.baseUrl += '/v1';
    }
  }

  async responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    const requestBody: Record<string, any> = {
      model: this.model,
      messages: this._normalizeMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    if (this._shouldDisableThinking()) {
      const modelLower = this.model.toLowerCase();
      if (modelLower.includes('qwen')) {
        requestBody.enable_thinking = false;
      } else {
        requestBody.thinking = { type: 'disabled' };
      }
    }

    const url = `${this.baseUrl}/chat/completions`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM] API错误 ${response.status}: ${errorText}`);
        throw new Error(`LLM API返回 ${response.status}`);
      }

      if (!response.body) {
        throw new Error('LLM API无响应体');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { text: '', finishReason: 'error' };
      }
      throw e;
    }

    return this._parseSSEStream(response.body, onToken);
  }

  private _normalizeMessages(messages: ChatMessage[]): Record<string, any>[] {
    return messages.map((msg) => {
      const normalized: Record<string, any> = {
        role: msg.role,
        content: msg.content || null,
      };

      if (msg.tool_call_id) {
        normalized.tool_call_id = msg.tool_call_id;
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        normalized.tool_calls = msg.tool_calls;
      }

      return normalized;
    });
  }

  private _shouldDisableThinking(): boolean {
    const modelLower = this.model.toLowerCase();
    return OpenAICompatibleLLM.NO_THINK_PREFIXES.some(
      (prefix) => modelLower.includes(prefix),
    );
  }

  private async _parseSSEStream(
    body: ReadableStream<Uint8Array>,
    onToken: TokenCallback,
  ): Promise<LLMResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let isThinking = false;
    const toolCallsMap = new Map<number, ToolCall>();

    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              let content = delta.content as string;

              if (!this._shouldDisableThinking()) {
                const filtered = this._filterThinking(content, isThinking);
                content = filtered.content;
                isThinking = filtered.isThinking;
              }

              if (content) {
                fullText += content;
                await onToken(content);
              }
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index: number = tc.index ?? 0;
                if (!toolCallsMap.has(index)) {
                  toolCallsMap.set(index, {
                    id: tc.id || '',
                    type: 'function',
                    index,
                    function: {
                      name: tc.function?.name || '',
                      arguments: '',
                    },
                  });
                }

                const entry = toolCallsMap.get(index)!;
                if (tc.function?.name) {
                  entry.function.name = tc.function.name;
                }
                if (tc.id) {
                  entry.id = tc.id;
                }
                if (tc.function?.arguments) {
                  entry.function.arguments += tc.function.arguments;
                }
              }
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls = toolCallsMap.size > 0
      ? Array.from(toolCallsMap.values())
      : undefined;

    return {
      text: fullText,
      toolCalls,
      finishReason: toolCalls ? 'tool_calls' : 'stop',
    };
  }

  private _filterThinking(
    content: string,
    isThinking: boolean,
  ): { content: string; isThinking: boolean } {
    let result = '';
    let i = 0;
    let currentThinking = isThinking;

    while (i < content.length) {
      if (!currentThinking && content.startsWith(THINK_START_TAG, i)) {
        currentThinking = true;
        i += THINK_START_TAG.length;
        continue;
      }

      if (currentThinking && content.startsWith(THINK_END_TAG, i)) {
        currentThinking = false;
        i += THINK_END_TAG.length;
        continue;
      }

      if (!currentThinking) {
        result += content[i];
      }
      i++;
    }

    return { content: result, isThinking: currentThinking };
  }
}
