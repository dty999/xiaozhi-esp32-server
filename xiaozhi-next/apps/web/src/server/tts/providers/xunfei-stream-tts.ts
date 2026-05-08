/**
 * ============================================================
 * 讯飞流式 TTS — 语音合成 WebSocket
 * 对标旧Python: core/providers/tts/xunfei_stream.py
 *
 * 使用科大讯飞在线语音合成 WebSocket API
 * 支持多种发音人，流式返回 PCM 音频
 * ============================================================
 */

import type { TTSProvider, TTSConfig } from '../../types';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

export class XunfeiStreamTTSProvider implements TTSProvider {
  readonly name = 'XunfeiStreamTTS';

  private apiUrl: string;
  private appId: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(config: TTSConfig) {
    this.apiUrl = config.api_url || 'https://tts-api.xfyun.cn/v2/tts';
    this.appId = (config as any).appid || process.env.XUNFEI_TTS_APP_ID || '';
    this.apiKey = config.api_key || process.env.XUNFEI_TTS_API_KEY || '';
    this.apiSecret = (config as any).api_secret || process.env.XUNFEI_TTS_API_SECRET || '';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!this.apiKey || !this.apiSecret) {
      console.warn('[XunfeiTTS] 未配置密钥');
      return;
    }

    try {
      const params = {
        common: { app_id: this.appId },
        business: {
          aue: 'raw',
          auf: 'audio/L16;rate=16000',
          vcn: voice || 'xiaoyan',
          speed: Math.round((config.rate || 1.0) * 50),
          volume: config.volume || 50,
          pitch: config.pitch || 50,
          tte: 'UTF8',
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64'),
        },
      };

      const requestUrl = this._assembleAuthUrl();

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.error(`[XunfeiTTS] 请求失败: HTTP ${response.status}`);
        return;
      }

      const result = await response.json();
      if (result.code === 0 && result.data?.audio) {
        const audioBuf = Buffer.from(result.data.audio, 'base64');
        yield this._int16ToFloat32(audioBuf);
      } else {
        console.warn(`[XunfeiTTS] 合成错误: code=${result.code}, msg=${result.message}`);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[XunfeiTTS] 合成失败: ${e.message}`);
      }
    }
  }

  private _assembleAuthUrl(): string {
    const url = new URL(this.apiUrl);
    const date = new Date().toUTCString();
    const host = url.hostname;

    const signatureOrigin = `host: ${host}\ndate: ${date}\nPOST /v2/tts HTTP/1.1`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signatureOrigin)
      .digest('base64');

    const authorization = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorizationBase64 = Buffer.from(authorization).toString('base64');

    return `${this.apiUrl}?authorization=${encodeURIComponent(authorizationBase64)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
  }

  private _int16ToFloat32(buf: Buffer): Float32Array {
    const result = new Float32Array(Math.floor(buf.length / 2));
    for (let i = 0; i < result.length; i++) {
      result[i] = buf.readInt16LE(i * 2) / 32768.0;
    }
    return result;
  }
}
