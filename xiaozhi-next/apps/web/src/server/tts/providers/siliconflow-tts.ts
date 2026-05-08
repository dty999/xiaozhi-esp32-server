/**
 * ============================================================
 * 硅基流动 TTS — CosyVoice2 语音合成
 * 对标旧Python: core/providers/tts/siliconflow.py
 *
 * 使用硅基流动 SiliconFlow CosyVoice2 API
 * 支持少量字数的语音克隆
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';
import { Buffer } from 'buffer';

export class SiliconFlowTTSProvider implements TTSProvider {
  readonly name = 'SiliconFlowTTS';

  private apiUrl: string;
  private apiKey: string;

  constructor(config: TTSConfig) {
    this.apiUrl = config.api_url || 'https://api.siliconflow.cn/v1';
    this.apiKey = config.api_key || process.env.SILICONFLOW_TTS_API_KEY || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.apiKey) {
      console.warn('[SiliconFlowTTS] 未配置 API Key');
      return;
    }

    try {
      const requestBody = {
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        input: text,
        voice: voice || 'FunAudioLLM/CosyVoice2-0.5B:alex',
        response_format: 'pcm',
        sample_rate: 16000,
        stream: true,
        speed: config.rate || 1.0,
        gain: (config.volume || 80) / 100,
      };

      const response = await fetch(`${this.apiUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok || !response.body) {
        console.error(`[SiliconFlowTTS] 请求失败: HTTP ${response.status}`);
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

        // 每帧 1920 字节
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
        console.error(`[SiliconFlowTTS] 合成失败: ${e.message}`);
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
