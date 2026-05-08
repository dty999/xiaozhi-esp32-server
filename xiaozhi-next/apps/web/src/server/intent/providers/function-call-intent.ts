/**
 * ============================================================
 * Function Calling 意图识别 — 让主LLM处理tools
 * 对标旧Python: Intent function_call 模式
 *
 * 此模式下，意图识别由LLM的function calling机制完成
 * 本提供者本身不做额外判断，只标记为非退出意图
 * ============================================================
 */

import type { IntentProvider, IntentResult, ChatMessage } from '../../types';

/**
 * FunctionCall意图提供者
 *
 * 实际意图判断由主LLM的tools机制完成，
 * 此提供者仅提供框架标记，不执行独立的意图检测
 */
export class FunctionCallIntentProvider implements IntentProvider {
  readonly name = 'FunctionCallIntent';

  async detect(text: string, _context?: ChatMessage[]): Promise<IntentResult> {
    // 对明显的退出语句做快速判断
    const exitPatterns = [
      '再见', '拜拜', 'bye', 'goodbye', '休息吧',
      '退下', '告辞', '别了', '晚安',
    ];

    const lowerText = text.toLowerCase();
    for (const pattern of exitPatterns) {
      if (lowerText.includes(pattern)) {
        return {
          exit: true,
          intentName: 'exit',
          metadata: { triggered_by: text },
        };
      }
    }

    // 其他情况交给LLM的function calling处理
    // 不做意图判断，让主LLM决定是否调用工具
    return { exit: false };
  }
}
