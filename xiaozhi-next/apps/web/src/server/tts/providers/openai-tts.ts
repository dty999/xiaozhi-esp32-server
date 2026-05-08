/**
 * ============================================================
 * OpenAI TTS 提供者
 * 对标旧Python: core/providers/tts/openai.py
 *
 * 使用 OpenAI TTS API (tts-1 / tts-1-hd) 进行语音合成
 * API: POST /v1/audio/speech
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';

/**
 * OpenAI TTS 提供者
 *
 * 对标旧Python: class TTSProvider(TTSProviderBase) — OpenAI TTS
 *
 * 支持模型：tts-1（标准）、tts-1-hd（高清）
 * 支持格式：mp3、opus、aac、flac、wav、pcm
 */
export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'OpenAITTS';

  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private defaultVoice: string;
  private responseFormat: string;

  constructor(config: TTSConfig) {
    this.baseUrl = config.api_url || process.env.TTS_API_URL || 'https://api.openai.com';
    this.apiKey = config.api_key || process.env.TTS_API_KEY || '';
    this.model = config.model_name || 'tts-1';
    this.defaultVoice = config.voice || config.voiceName || 'alloy';
    this.responseFormat = config.format || 'pcm';

    this.baseUrl = this.baseUrl.replace(/\/+$/, '');
  }

  /**
   * 流式文本转语音
   *
   * 注意：OpenAI TTS API 目前不支持真正的流式输出（stream=true），
   * 返回的是完整音频文件。此处以非流式方式模拟流式返回。
   *
   * @param text 要合成的文本
   * @param voice 语音名称（alloy, echo, fable, onyx, nova, shimmer）
   * @param config TTS参数
   * @returns 异步迭代器，逐个返回PCM Float32Array音频块
   */
  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!text.trim()) return;

    const voiceName = voice || this.defaultVoice;
    const speed = config.rate ?? 1.0;

    const requestBody: Record<string, any> = {
      model: this.model,
      input: text,
      voice: voiceName,
      response_format: this.responseFormat,
      speed,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error(`[OpenAITTS] API错误 ${response.status}`);
        yield new Float32Array(960);
        return;
      }

      const audioBuffer = await response.arrayBuffer();
      const audioData = new Uint8Array(audioBuffer);

      // 将PCM字节转换为Float32数组
      const numSamples = Math.floor(audioData.length / 2);
      if (numSamples <= 0) {
        yield new Float32Array(960);
        return;
      }

      const result = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const lo = audioData[i * 2]!;
        const hi = audioData[i * 2 + 1]!;
        let int16 = (hi << 8) | lo;
        if (int16 >= 0x8000) int16 -= 0x10000;
        result[i] = int16 / 32768.0;
      }

      yield result;
    } catch (e: any) {
      console.error(`[OpenAITTS] 合成失败: ${e.message}`);
      yield new Float32Array(960);
    }
  }
}
