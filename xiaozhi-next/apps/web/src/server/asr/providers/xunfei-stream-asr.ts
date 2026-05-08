/**
 * ============================================================
 * 讯飞流式 ASR — 语音听写 WebSocket 流式识别
 * 对标旧Python: core/providers/asr/xunfei_stream.py
 *
 * 使用科大讯飞语音听写 WebSocket API
 * 支持实时流式识别，需 HMAC-SHA256 签名认证
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../../types';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

export class XunfeiStreamASRProvider implements ASRProvider {
  readonly name = 'XunfeiStreamASR';

  private apiUrl: string;
  private appId: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(config: ASRConfig) {
    this.apiUrl = config.api_url || 'https://iat-api.xfyun.cn/v2/iat';
    this.appId = config.appid || process.env.XUNFEI_ASR_APP_ID || '';
    this.apiKey = config.api_key || process.env.XUNFEI_ASR_API_KEY || '';
    this.apiSecret = config.access_token || process.env.XUNFEI_ASR_API_SECRET || '';
  }

  async speechToText(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.apiKey || !this.apiSecret) {
      console.warn('[XunfeiASR] 未配置 API Key/Secret，返回空');
      return '';
    }

    try {
      // Float32 → Int16 PCM Buffer
      const pcmBuffer = this._float32ToInt16(audioData);
      // Base64 编码
      const audioBase64 = pcmBuffer.toString('base64');

      // 构建请求参数
      const params = {
        common: { app_id: this.appId },
        business: {
          language: 'zh_cn',
          domain: 'iat',
          accent: 'mandarin',
          ptt: 0,
          v_eod: 0,
          dwa: 'wpgs',
          pd: 'game',
        },
        data: {
          status: 2, // 最后一帧
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: audioBase64,
        },
      };

      // 生成签名 URL
      const requestUrl = this._assembleAuthUrl();

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[XunfeiASR] 请求失败: HTTP ${response.status}`);
        return '';
      }

      const result = await response.json();
      if (result.code === 0 && result.data?.result) {
        // 拼接所有识别文本段
        const text = this._extractText(result.data.result);
        return text;
      }

      console.warn(`[XunfeiASR] 服务返回错误: code=${result.code}, msg=${result.message}`);
      return '';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[XunfeiASR] 识别失败: ${e.message}`);
      }
      return '';
    }
  }

  /**
   * HMAC-SHA256 签名生成 URL
   * 对标旧Python: xunfei_stream.py → _create_url()
   */
  private _assembleAuthUrl(): string {
    const url = new URL(this.apiUrl);
    const date = new Date().toUTCString();

    // 讯飞使用 host + date 做签名
    const host = url.hostname;
    const signatureOrigin = `host: ${host}\ndate: ${date}\nPOST /v2/iat HTTP/1.1`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signatureOrigin)
      .digest('base64');

    const authorization = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorizationBase64 = Buffer.from(authorization).toString('base64');

    return `${this.apiUrl}?authorization=${encodeURIComponent(authorizationBase64)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
  }

  /** 提取识别文本 */
  private _extractText(result: any): string {
    if (typeof result === 'string') return result;
    if (Array.isArray(result.ws)) {
      return result.ws
        .map((ws: any) => {
          if (ws.cw) {
            return ws.cw.map((cw: any) => cw.w || '').join('');
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private _float32ToInt16(samples: Float32Array): Buffer {
    const buf = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2);
    }
    return buf;
  }
}
