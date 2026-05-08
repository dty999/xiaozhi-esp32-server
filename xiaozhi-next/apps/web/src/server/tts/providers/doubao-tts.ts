/**
 * ============================================================
 * 豆包 TTS — 火山引擎语音合成
 * 对标旧Python: core/providers/tts/doubao.py
 *
 * 使用火山引擎语音合成 API（HTTP 流式）
 * 支持多种音色和参数调节
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';

export class DoubaoTTSProvider implements TTSProvider {
  readonly name = 'DoubaoTTS';

  private apiUrl: string;
  private apiKey: string;
  private appId: string;

  constructor(config: TTSConfig) {
    this.apiUrl = config.api_url || 'https://openspeech.bytedance.com';
    this.apiKey = config.api_key || process.env.DOUBAO_TTS_API_KEY || '';
    this.appId = (config as any).appid || process.env.DOUBAO_TTS_APP_ID || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.apiKey) {
      console.warn('[DoubaoTTS] 未配置 API Key');
      return;
    }

    try {
      const requestBody = {
        app: { appid: this.appId, token: 'placeholder', cluster: 'volcano_tts' },
        user: { uid: 'xiaozhi-esp32' },
        audio: {
          voice_type: voice || 'zh_female_qingxin',
          encoding: 'pcm',
          speed_ratio: config.rate || 1.0,
          volume_ratio: (config.volume || 80) / 100,
          pitch_ratio: (config.pitch || 0) / 20 + 1,
        },
        request: {
          reqid: crypto.randomUUID(),
          text: text,
          text_type: 'plain',
          operation: 'query',
          silence_duration: 200,
        },
      };

      const response = await fetch(`${this.apiUrl}/api/v1/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok || !response.body) {
        console.error(`[DoubaoTTS] 请求失败: HTTP ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        // 累积数据
        const newBuf = new Uint8Array(buffer.length + value.length);
        newBuf.set(buffer);
        newBuf.set(value, buffer.length);
        buffer = newBuf;

        // 按 960 samples * 2 bytes = 1920 字节切分
        const frameSize = 1920;
        while (buffer.length >= frameSize) {
          const frame = buffer.slice(0, frameSize);
          buffer = buffer.slice(frameSize);
          // Int16 Buffer → Float32Array
          yield this._int16ToFloat32(Buffer.from(frame));
        }
      }

      // 发送剩余数据
      if (buffer.length > 0) {
        yield this._int16ToFloat32(Buffer.from(buffer));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[DoubaoTTS] 合成失败: ${e.message}`);
      }
    }
  }

  private _int16ToFloat32(buf: Buffer): Float32Array {
    const result = new Float32Array(Math.floor(buf.length / 2));
    for (let i = 0; i < result.length; i++) {
      const int16 = buf.readInt16LE(i * 2);
      result[i] = int16 / 32768.0;
    }
    return result;
  }
}
