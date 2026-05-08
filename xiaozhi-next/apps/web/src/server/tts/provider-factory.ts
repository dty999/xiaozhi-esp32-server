/**
 * ============================================================
 * TTS 提供者工厂
 * 对标旧Python: core/utils/tts.py → create_instance()
 *
 * 根据配置创建对应的 TTS 提供者实例
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../types';
import { EdgeTTSProvider } from './providers/edge-tts';
import { OpenAITTSProvider } from './providers/openai-tts';
import { DoubaoTTSProvider } from './providers/doubao-tts';
import { HuoshanDoubleStreamTTSProvider } from './providers/huoshan-double-stream';
import { AliyunStreamTTSProvider } from './providers/aliyun-stream-tts';
import { MinimaxHTTPStreamTTSProvider } from './providers/minimax-stream-tts';
import { XunfeiStreamTTSProvider } from './providers/xunfei-stream-tts';
import { SiliconFlowTTSProvider } from './providers/siliconflow-tts';

/**
 * TTS提供者工厂
 *
 * @param config TTS配置（从管理端API获取）
 * @returns TTS提供者实例
 */
export async function createTTSProvider(config: TTSConfig): Promise<TTSProvider> {
  const type = (config.type || 'edge').toLowerCase();

  switch (type) {
    case 'edge':
    case 'edge_tts':
      return new EdgeTTSProvider(config);

    case 'openai':
      return new OpenAITTSProvider(config);

    case 'doubao':
      return new DoubaoTTSProvider(config);

    case 'huoshan':
    case 'huoshan_double_stream':
      return new HuoshanDoubleStreamTTSProvider(config);

    case 'siliconflow':
      return new SiliconFlowTTSProvider(config);

    case 'aliyun':
    case 'ali_bl':
      return new AliyunStreamTTSProvider(config);

    case 'minimax':
      return new MinimaxHTTPStreamTTSProvider(config);

    case 'xunfei':
      return new XunfeiStreamTTSProvider(config);

    case 'coze':
      // Coze TTS 当前回退到 Edge TTS
      console.warn(`[TTS] Coze TTS 暂未实现，使用 Edge TTS 替代`);
      return new EdgeTTSProvider(config);

    default:
      console.warn(`[TTS] 未知类型 "${type}"，回退到 Edge TTS`);
      return new EdgeTTSProvider(config);
  }
}
