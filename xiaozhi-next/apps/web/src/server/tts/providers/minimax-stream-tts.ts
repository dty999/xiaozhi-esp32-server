/**
 * ============================================================
 * Minimax 流式 TTS — speech-01 模型
 * 对标旧Python: core/providers/tts/minimax_httpstream.py
 *
 * 使用 Minimax TTS API（SSE 流式）
 * 支持多种音色，延迟较低
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';
import { Buffer } from 'buffer';

export class MinimaxHTTPStreamTTSProvider implements TTSProvider {
  readonly name = 'MinimaxHTTPStreamTTS';

  private apiUrl: string;
  private apiKey: string;
  private groupId: string;

  constructor(config: TTSConfig) {
    this.apiUrl = config.api_url || 'https://api.minimax.chat/v1';
    this.apiKey = config.api_key || process.env.MINIMAX_TTS_API_KEY || '';
    this.groupId = (config as any).group_id || process.env.MINIMAX_TTS_GROUP_ID || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.apiKey) {
      console.warn('[MinimaxTTS] 未配置 API Key');
      return;
    }

    try {
      const requestBody = {
        model: 'speech-01',
        text: text,
        stream: true,
        voice_setting: {
          voice_id: voice || 'male-qn-qingse',
          speed: config.rate || 1.0,
          vol: (config.volume || 80) / 100,
          pitch: config.pitch || 0,
        },
        audio_setting: {
          sample_rate: 16000,
          bitrate: 32000,
          format: 'pcm',
          channel: 1,
        },
      };

      const response = await fetch(`${this.apiUrl}/t2a_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok || !response.body) {
        console.error(`[MinimaxTTS] 请求失败: HTTP ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let leftover = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        leftover += decoder.decode(value, { stream: true });
        const lines = leftover.split('\n');
        leftover = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.data?.audio) {
                const audioBuf = Buffer.from(parsed.data.audio, 'hex');
                yield this._int16ToFloat32(audioBuf);
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[MinimaxTTS] 合成失败: ${e.message}`);
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
