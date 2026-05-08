/**
 * ============================================================
 * OpenAI 兼容 LLM 提供者（统一处理所有 type:openai 的LLM）
 * 对标旧Python: core/providers/llm/openai/openai.py
 *
 * 支持：OpenAI、DeepSeek、通义千问、智谱GLM、月之暗面、豆包等
 * 所有 OpenAI Chat Completions API 兼容的大模型
 *
 * 核心特性：
 * 1. 流式 SSE 输出
 * 2. Function Calling（tools 定义 + 参数解析）
 * 3. 思考模式自动禁用（阿里/智谱/月之暗面/火山引擎）
 * 4. AbortSignal 中断支持
 * ============================================================
 */

import type {
  LLMProvider,
  LLMResponse,
  LLMConfig,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  TokenCallback,
} from '../../types';

/**
 * OpenAI兼容LLM实现
 *
 * 对标旧Python: class LLMProvider(LLMProviderBase)
 * 统一处理所有遵循 OpenAI Chat Completions API 的大模型
 */
export class OpenAICompatibleLLM implements LLMProvider {
  readonly name = 'OpenAICompatibleLLM';

  /** API 基础 URL */
  private baseUrl: string;
  /** API Key */
  private apiKey: string;
  /** 模型名称 */
  private model: string;
  /** 最大 token 数 */
  private maxTokens: number;
  /** 温度参数 */
  private temperature: number;
  /** Top-P 采样 */
  private topP: number;

  /**
   * 需禁用思考模式的模型前缀列表
   * 对标旧Python: noThinkModels
   *
   * 阿里云百炼、智谱、月之暗面、豆包 默认不开启思考模式，
   * 以免产生额外的 <think>...</think> 标记影响对话质量
   */
  private static readonly NO_THINK_PREFIXES = [
    'qwen-',       // 通义千问系列
    'glm-4',       // 智谱 GLM-4 系列
    'glm-',        // 智谱其他系列
    'moonshot',    // 月之暗面 Kimi
    'doubao',      // 火山引擎豆包
    'deepseek',    // DeepSeek（部分模型需禁用思考）
  ];

  constructor(config: LLMConfig) {
    this.baseUrl = config.api_url || process.env.LLM_API_URL || 'https://api.openai.com';
    this.apiKey = config.api_key || process.env.LLM_API_KEY || '';
    this.model = config.model_name || 'gpt-4o-mini';
    this.maxTokens = config.max_tokens || 2048;
    this.temperature = config.temperature ?? 0.7;
    this.topP = config.top_p ?? 1.0;

    // 确保 baseUrl 格式正确
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
    if (!this.baseUrl.endsWith('/v1')) {
      this.baseUrl += '/v1';
    }
  }

  /**
   * 流式对话（支持function calling）
   *
   * 对标旧Python:
   *   def response(self, session_id, dialogue) → generator
   *   def response_with_functions(self, session_id, dialogue, functions) → generator
   *
   * 实现要点：
   * 1. 发送 Chat Completions API 请求（stream=true）
   * 2. 解析 SSE 流（data: {...} 格式）
   * 3. 提取 delta.content 文本 token
   * 4. 提取 delta.tool_calls 工具调用
   * 5. 过滤 <think>...</think> 思考内容（若未禁用思考模式）
   * 6. 支持 AbortSignal 中断
   *
   * @param messages 对话消息列表
   * @param tools 可用工具定义列表
   * @param onToken 流式token回调（每个token调用一次）
   * @param signal 中断信号
   * @returns 完整响应（含工具调用信息）
   */
  async responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    // 构建请求体
    const requestBody: Record<string, any> = {
      model: this.model,
      messages: this._normalizeMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
    };

    // 添加工具定义
    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    // 禁用思考模式（对特定模型）
    if (this._shouldDisableThinking()) {
      // 各种模型禁用思考的方式不同：
      // 豆包: thinking: { type: 'disabled' }
      // 通义千问: enable_thinking: false
      // 其他大多数: thinking: { type: 'disabled' }
      const modelLower = this.model.toLowerCase();
      if (modelLower.includes('qwen')) {
        requestBody.enable_thinking = false;
      } else {
        requestBody.thinking = { type: 'disabled' };
      }
    }

    // 发送请求
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

    // 解析SSE流
    return this._parseSSEStream(response.body, onToken);
  }

  /**
   * 规范化消息列表
   * 对标旧Python: normalize_dialogue() —— 修复缺失 content 字段的消息
   */
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

  /**
   * 判断是否需要禁用思考模式
   * 对标旧Python: shouldDisableThinking 逻辑
   */
  private _shouldDisableThinking(): boolean {
    const modelLower = this.model.toLowerCase();
    return OpenAICompatibleLLM.NO_THINK_PREFIXES.some(
      (prefix) => modelLower.includes(prefix),
    );
  }

  /**
   * 解析 SSE (Server-Sent Events) 流
   *
   * 对标旧Python: response() 中的 for response in llm_responses 循环
   *
   * SSE 格式：
   * data: {"id":"...","choices":[{"delta":{"content":"你好"}}]}
   * data: {"id":"...","choices":[{"delta":{"tool_calls":[...]}}]}
   * data: [DONE]
   *
   * @param body ReadableStream 响应体
   * @param onToken token回调
   * @returns 完整响应
   */
  private async _parseSSEStream(
    body: ReadableStream<Uint8Array>,
    onToken: TokenCallback,
  ): Promise<LLMResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let isThinking = false; // 是否处于 <think> 标签内
    const toolCallsMap = new Map<number, ToolCall>();

    // 缓冲区：用于处理跨数据块的消息行
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 最后一个元素可能是不完整的行，保留在缓冲区
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

            // --- 处理文本内容 ---
            if (delta.content) {
              let content = delta.content as string;

              // 过滤思考标记 <think>...</think>
              if (this._shouldDisableThinking()) {
                // 若已禁用思考模式则直接取文本
              } else {
                // 手动过滤可能的思考标记
                const filtered = this._filterThinking(content, isThinking);
                content = filtered.content;
                isThinking = filtered.isThinking;
              }

              if (content) {
                fullText += content;
                await onToken(content);
              }
            }

            // --- 处理工具调用 ---
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

  /**
   * 过滤思考标记 <think>...</think>
   *
   * 对标旧Python: response() 中的过滤逻辑
   * 某些模型会输出思考过程，需过滤掉以保持对话质量
   */
  private _filterThinking(
    content: string,
    isThinking: boolean,
  ): { content: string; isThinking: boolean } {
    let result = '';
    let i = 0;
    let currentThinking = isThinking;

    while (i < content.length) {
      if (!currentThinking && content.startsWith('<｜end▁of▁thinking｜>', i)) {
        // 检测到思考开始标记
        currentThinking = true;
        // 跳过 '<think>' 标记
        const endTagIdx = content.indexOf('<｜end▁of▁thinking｜>', i);
        if (endTagIdx !== -1) {
          i = endTagIdx + '<｜end▁of▁thinking｜>'.length;
          continue;
        }
      }

      if (currentThinking && content.startsWith('<｜end▁of▁thinking｜>', i)) {
        // 检测到思考结束标记
        currentThinking = false;
        i += '<｜end▁of▁thinking｜>'.length;
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
