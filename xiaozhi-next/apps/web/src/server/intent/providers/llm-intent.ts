/**
 * ============================================================
 * LLM 意图识别提供者 — 独立调用 LLM 判断意图
 * 对标旧Python: core/providers/intent/intent_llm/
 *
 * 策略：
 * 1. 每次收到用户消息时，调用轻量LLM快速判断意图
 * 2. 意图类型：继续聊天 / 退出对话 / 特定功能触发
 * 3. 使用短 prompt 和低延迟模型，减少额外开销
 * ============================================================
 */

import type { IntentProvider, IntentResult, ChatMessage } from '../../types';

/** 意图分类 */
type IntentCategory = 'chat' | 'exit' | 'weather' | 'time' | 'news';

/**
 * LLMIntentProvider
 *
 * 对标旧Python: IntentLLM 类
 * 使用独立 LLM 调用判断用户意图
 */
export class LLMIntentProvider implements IntentProvider {
  readonly name = 'LLMIntent';

  private llmApiUrl: string;
  private llmApiKey: string;
  private llmModel: string;

  constructor(config?: { api_url?: string; api_key?: string; model?: string }) {
    this.llmApiUrl = config?.api_url || process.env.LLM_API_URL || 'https://api.openai.com';
    this.llmApiKey = config?.api_key || process.env.LLM_API_KEY || '';
    this.llmModel = config?.model || 'gpt-4o-mini';
  }

  /**
   * 检测用户意图
   *
   * 对标旧Python: intent_handler.detect()
   */
  async detect(
    text: string,
    context?: ChatMessage[],
  ): Promise<IntentResult> {
    // ---- 快速规则校验（无需调用 LLM） ----
    const quickResult = this._quickCheck(text);
    if (quickResult) return quickResult;

    // ---- 调用 LLM 判断 ----
    const systemPrompt = `你是一个意图分类助手。分析用户输入，将意图归为以下之一：
- chat: 普通聊天、问答、闲聊（默认）
- exit: 用户明确要结束对话、说再见

请仅回复意图标签（如 "chat" 或 "exit"），不要回复其他内容。`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    // 添加上一轮对话上下文（最多 2 条，排除 tool 消息）
    if (context && context.length > 0) {
      const recent = context
        .filter(m => !m.is_temporary && (m.role === 'user' || m.role === 'assistant'))
        .slice(-2);
      for (const m of recent) {
        messages.splice(1, 0, { role: m.role, content: m.content });
      }
    }

    try {
      const response = await fetch(`${this.llmApiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.llmApiKey}`,
        },
        body: JSON.stringify({
          model: this.llmModel,
          messages,
          max_tokens: 10,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`[Intent] LLM意图识别失败: HTTP ${response.status}`);
        return { exit: false };
      }

      const data = await response.json();
      const intent = (data.choices?.[0]?.message?.content?.trim().toLowerCase() || 'chat') as IntentCategory;

      if (intent === 'exit') {
        console.log(`[Intent] LLM检测到退出意图: "${text}"`);
        return {
          exit: true,
          intentName: 'exit',
          metadata: { method: 'llm', text },
        };
      }

      if (intent === 'weather') {
        return {
          exit: false,
          intentName: 'weather',
          metadata: { method: 'llm', text },
        };
      }

      return { exit: false };
    } catch (e: any) {
      console.warn(`[Intent] LLM意图识别超时或异常: ${e.message}`);
      return { exit: false };
    }
  }

  /**
   * 快速规则校验
   * 对标旧Python: check_direct_exit()
   */
  private _quickCheck(text: string): IntentResult | null {
    const cleaned = text.replace(/[，,。\.！!？?；;：:、\s]/g, '').trim().toLowerCase();

    // 精确匹配退出命令
    const exitPhrases = [
      '再见', '拜拜', 'bye', 'goodbye', '退出', '告辞',
      '别了', '晚安', '再见啦', '休息吧', '退下',
    ];

    if (exitPhrases.includes(cleaned)) {
      return {
        exit: true,
        intentName: 'exit',
        metadata: { method: 'rule', text },
      };
    }

    return null;
  }
}
