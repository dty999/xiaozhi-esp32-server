/**
 * ============================================================
 * 阿里云流式 TTS — CosyVoice 语音合成
 * 对标旧Python: core/providers/tts/aliyun_stream.py
 *
 * 使用阿里云智能语音交互（NLS）流式语音合成
 * 支持多种音色和 SSML 标记
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';
import { Buffer } from 'buffer';

export class AliyunStreamTTSProvider implements TTSProvider {
  readonly name = 'AliyunStreamTTS';

  private apiUrl: string;
  private accessToken: string;
  private appKey: string;

  constructor(config: TTSConfig) {
    this.apiUrl = config.api_url || 'https://nls-gateway-cn-shanghai.aliyuncs.com';
    this.accessToken = config.api_key || process.env.ALIYUN_TTS_TOKEN || '';
    this.appKey = (config as any).appid || process.env.ALIYUN_TTS_APP_KEY || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.accessToken) {
      console.warn('[AliyunTTS] 未配置 AccessToken');
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('appkey', this.appKey);
      params.set('text', text);
      params.set('token', this.accessToken);
      params.set('format', 'pcm');
      params.set('sample_rate', '16000');
      params.set('voice', voice || 'xiaoyun');
      params.set('volume', String(config.volume || 50));
      params.set('speech_rate', String(Math.round((config.rate || 1.0) * 1000 - 1000)));
      params.set('pitch_rate', String(config.pitch || 0));

      const response = await fetch(`${this.apiUrl}/stream/v1/tts?${params.toString()}`, {
        method: 'GET',
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok || !response.body) {
        console.error(`[AliyunTTS] 请求失败: HTTP ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const newBuf = new Uint8Array(buffer.length + value.length);
        newBuf.set(buffer);
        newBuf.set(value, buffer.length);
        buffer = newBuf;

        // 每 1920 字节（960 samples × 2 bytes）一帧
        const frameSize = 1920;
        while (buffer.length >= frameSize) {
          const frame = buffer.slice(0, frameSize);
          buffer = buffer.slice(frameSize);
          yield this._int16ToFloat32(Buffer.from(frame));
        }
      }

      if (buffer.length > 0) {
        yield this._int16ToFloat32(Buffer.from(buffer));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[AliyunTTS] 合成失败: ${e.message}`);
      }
    }
  }

  private _int16ToFloat32(buf: Buffer): Float32Array {
    const result = new Float32Array(Math.floor(buf.length / 2));
    for (let i = 0; i < result.length; i++) {
      result[i] = buf.readInt16LE(i * 2) / 32768.0;
    }
    return result;
  }
}
