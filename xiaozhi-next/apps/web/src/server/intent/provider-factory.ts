/**
 * ============================================================
 * Intent 意图识别工厂
 *
 * 根据配置创建对应的 Intent 提供者实例
 * ============================================================
 */

import type { IntentProvider, IntentConfig } from '../types';
import { NoIntentProvider } from './providers/no-intent';
import { FunctionCallIntentProvider } from './providers/function-call-intent';
import { LLMIntentProvider } from './providers/llm-intent';

/**
 * Intent提供者工厂
 */
export async function createIntentProvider(config: IntentConfig): Promise<IntentProvider> {
  const type = (config.type || 'nointent').toLowerCase();

  switch (type) {
    case 'nointent':
      return new NoIntentProvider();

    case 'function_call':
      return new FunctionCallIntentProvider();

    case 'intent_llm':
      // 独立LLM判断意图
      console.log(`[Intent] 使用LLM意图识别`);
      return new LLMIntentProvider({
        api_url: config.api_url,
        api_key: config.api_key,
        model: config.llm,
      });

    default:
      return new NoIntentProvider();
  }
}
