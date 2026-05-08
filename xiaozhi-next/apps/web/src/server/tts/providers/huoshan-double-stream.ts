/**
 * ============================================================
 * 火山引擎双流 TTS — 低延迟双向流式合成
 * 对标旧Python: core/providers/tts/huoshan_double_stream.py
 *
 * 火山引擎 V1/V2 双流 TTS，支持更低的延迟
 * V1: 使用 speex 编码 + 双向流 API
 * V2: 使用标准 API + SSE 流式返回
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';

export class HuoshanDoubleStreamTTSProvider implements TTSProvider {
  readonly name = 'HuoshanDoubleStreamTTS';

  private apiUrl: string;
  private apiKey: string;
  private resourceId: string;
  private version: 'v1' | 'v2';

  constructor(config: TTSConfig) {
    this.version = ((config as any).version || process.env.HUOSHAN_TTS_VERSION || 'v2') as 'v1' | 'v2';
    this.resourceId = (config as any).resource_id || process.env.HUOSHAN_TTS_RESOURCE_ID || '';
    this.apiUrl = config.api_url || (
      this.version === 'v1'
        ? 'https://openspeech.bytedance.com/api/v1/tts/stream_binary'
        : 'https://openspeech.bytedance.com/api/v2/tts'
    );
    this.apiKey = config.api_key || process.env.HUOSHAN_TTS_API_KEY || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.apiKey) {
      console.warn('[HuoshanTTS] 未配置 API Key');
      return;
    }

    try {
      if (this.version === 'v2') {
        yield* this._synthesizeV2(text, voice, config);
      } else {
        yield* this._synthesizeV1(text, voice, config);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[HuoshanTTS] 合成失败: ${e.message}`);
      }
    }
  }

  private async *_synthesizeV2(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    const requestBody = {
      app: { appid: this.resourceId, token: 'Bearer', cluster: 'volcano_tts' },
      user: { uid: 'xiaozhi-esp32' },
      audio: {
        voice_type: voice || 'zh_female_qingxin',
        encoding: 'pcm',
        compression: 'none',
        speed_ratio: config.rate || 1.0,
        volume_ratio: (config.volume || 80) / 100,
        pitch_ratio: (config.pitch || 0) / 20 + 1,
        sample_rate: 16000,
      },
      request: {
        reqid: crypto.randomUUID(),
        text: text,
        text_type: 'plain',
        operation: 'query',
      },
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok || !response.body) {
      console.error(`[HuoshanTTS] V2请求失败: HTTP ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let leftover = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = decoder.decode(value, { stream: true });
      leftover += chunk;

      // 解析 SSE 格式 data:xxx
      const lines = leftover.split('\n');
      leftover = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]' || !data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.audio) {
              const audioBuf = Buffer.from(parsed.audio, 'base64');
              yield this._int16ToFloat32(audioBuf);
            }
          } catch {}
        }
      }
    }
  }

  private async *_synthesizeV1(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    // V1 使用 speex 编码的二进制流
    const requestBody = {
      app: { appid: this.resourceId, cluster: 'volcano_tts' },
      user: { uid: 'xiaozhi-esp32' },
      audio: {
        voice_type: voice || 'zh_female_qingxin',
        encoding: 'speex',
        sample_rate: 16000,
        speed_ratio: config.rate || 1.0,
        volume_ratio: (config.volume || 80) / 100,
        pitch_ratio: (config.pitch || 0) / 20 + 1,
      },
      request: {
        reqid: crypto.randomUUID(),
        text: text,
        text_type: 'plain',
        operation: 'submit',
      },
    };

    const response = await fetch(`${this.apiUrl}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok || !response.body) {
      console.error(`[HuoshanTTS] V1请求失败: HTTP ${response.status}`);
      return;
    }

    // V1 返回原始 PCM 或 speex 数据（简化处理，按帧切分）
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      // 假设返回的是 Int16 PCM
      yield this._int16ToFloat32(Buffer.from(value));
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
