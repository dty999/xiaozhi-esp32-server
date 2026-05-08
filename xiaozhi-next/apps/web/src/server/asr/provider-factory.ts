/**
 * ============================================================
 * ASR 提供者工厂
 * 对标旧Python: core/utils/asr.py → create_instance()
 *
 * 根据配置创建对应的ASR提供者实例
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../types';
import { OpenAIASRProvider } from './providers/openai-asr';
import { DoubaoStreamASRProvider } from './providers/doubao-stream-asr';
import { AliyunStreamASRProvider } from './providers/aliyun-stream-asr';
import { XunfeiStreamASRProvider } from './providers/xunfei-stream-asr';
import { TencentASRProvider } from './providers/tencent-asr';
import { BaiduASRProvider } from './providers/baidu-asr';

/**
 * ASR提供者工厂
 * 对标旧Python之工厂模式：根据 type 字段动态创建实例
 *
 * @param config ASR配置（从管理端API获取）
 * @returns ASR提供者实例
 */
export async function createASRProvider(config: ASRConfig): Promise<ASRProvider> {
  const type = (config.type || 'openai').toLowerCase();

  switch (type) {
    case 'openai':
    case 'groq':
      return new OpenAIASRProvider(config);

    case 'doubao':
    case 'doubao_stream':
      return new DoubaoStreamASRProvider(config);

    case 'aliyun':
    case 'ali_bl':
      return new AliyunStreamASRProvider(config);

    case 'xunfei':
      return new XunfeiStreamASRProvider(config);

    case 'tencent':
      return new TencentASRProvider(config);

    case 'baidu':
      return new BaiduASRProvider(config);

    case 'qwen3':
    case 'qwen3_asr_flash':
      // 通义千问 ASR Flash — 使用 DashScope API，兼容 OpenAI 模式
      return new OpenAIASRProvider({ ...config, api_url: 'https://dashscope.aliyuncs.com/compatible-mode' });

    default:
      console.warn(`[ASR] 未知类型 "${type}"，回退到 OpenAI 实现`);
      return new OpenAIASRProvider(config);
  }
}
