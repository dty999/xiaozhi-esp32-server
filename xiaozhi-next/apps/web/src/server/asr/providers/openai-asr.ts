/**
 * ============================================================
 * OpenAI / Groq 兼容 ASR 提供者
 * 对标旧Python: core/providers/asr/openai.py
 *
 * 使用 OpenAI Whisper API (或 Groq 等兼容端点) 进行语音识别
 * 通过 multipart/form-data 发送 WAV 文件
 * ============================================================
 */

import type { ASRProvider } from '../../types';
import type { ASRConfig } from '../../types';
import { OpusCodec, SAMPLE_RATE } from '../../audio/opus-codec';

/**
 * OpenAI兼容ASR实现
 *
 * 对标旧Python: class ASRProvider(ASRProviderBase)
 * 支持 OpenAI Whisper、Groq、以及任何兼容 Whisper API 的端点
 */
export class OpenAIASRProvider implements ASRProvider {
  readonly name = 'OpenAIASR';

  /** API 基础 URL */
  private baseUrl: string;
  /** API Key */
  private apiKey: string;
  /** 模型名称 */
  private model: string;
  /** 语言（可选，如 'zh'） */
  private language: string;
  /** Opus编解码器（用于WAV生成） */
  private codec: OpusCodec;

  constructor(config: ASRConfig) {
    this.baseUrl = config.api_url || process.env.ASR_API_URL || 'https://api.openai.com';
    this.apiKey = config.api_key || process.env.ASR_API_KEY || '';
    this.model = config.model_name || 'whisper-1';
    this.language = config.language || 'zh';
    this.codec = new OpusCodec();

    // 确保 baseUrl 不包含结尾斜杠
    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
  }

  /**
   * 语音转文字（非流式）
   *
   * 对标旧Python: async def speech_to_text(self, opus_data, session_id, audio_format, artifacts)
   *
   * 步骤：
   *   1. Float32 PCM → WAV Buffer
   *   2. 构建 multipart/form-data 请求
   *   3. 调用 Whisper API
   *   4. 返回识别文本
   *
   * @param audioData PCM Float32Array 音频数据（16kHz单声道）
   * @param sampleRate 采样率（默认16000）
   * @returns 识别文本
   */
  async speechToText(audioData: Float32Array, sampleRate: number = SAMPLE_RATE): Promise<string> {
    // 1. 将 Float32 PCM 转换为 WAV 文件 Buffer
    const wavBuffer = this.codec.float32ToWav(audioData, sampleRate);

    // 2. 构建 multipart/form-data
    const formData = new FormData();
    // 将 Buffer 转为 Uint8Array（兼容 TypeScript 类型检查）
    const blob = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.model);

    if (this.language) {
      formData.append('language', this.language);
    }

    // 可选参数
    formData.append('response_format', 'json');

    // 3. 调用 Open AI Whisper API
    const url = `${this.baseUrl}/v1/audio/transcriptions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenAIASR] API错误 ${response.status}: ${errorText}`);
        throw new Error(`ASR API返回 ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      return result.text || '';
    } catch (e: any) {
      console.error(`[OpenAIASR] 识别失败: ${e.message}`);
      // 返回空字符串，由上层处理
      return '';
    }
  }
}
