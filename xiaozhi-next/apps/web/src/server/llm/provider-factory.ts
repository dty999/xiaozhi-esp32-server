/**
 * ============================================================
 * LLM 提供者工厂
 * 对标旧Python: core/utils/llm.py → create_instance()
 *
 * 根据配置创建对应的 LLM 提供者实例
 * ============================================================
 */

import type { LLMProvider, LLMConfig } from '../types';
import { OpenAICompatibleLLM } from './providers/openai-compatible';
import { GeminiLLMProvider } from './providers/gemini-llm';
import { DifyLLMProvider } from './providers/dify-llm';
import { CozeLLMProvider } from './providers/coze-llm';

/**
 * LLM提供者工厂
 *
 * @param config LLM配置（从管理端API获取）
 * @returns LLM提供者实例
 */
export async function createLLMProvider(config: LLMConfig): Promise<LLMProvider> {
  const type = (config.type || 'openai').toLowerCase();

  switch (type) {
    case 'openai':
    case 'groq':
    case 'deepseek':
    case 'qwen':
    case 'glm':
    case 'moonshot':
    case 'doubao':
    case 'ollama':
      // 所有 OpenAI 兼容接口统一处理
      return new OpenAICompatibleLLM(config);

    case 'gemini':
      // Google Gemini API
      return new GeminiLLMProvider(config);

    case 'dify':
      // Dify 平台 API
      return new DifyLLMProvider(config);

    case 'coze':
      // Coze 扣子 API
      return new CozeLLMProvider(config);

    default:
      console.warn(`[LLM] 未知类型 "${type}"，回退到 OpenAI 兼容实现`);
      return new OpenAICompatibleLLM(config);
  }
}
