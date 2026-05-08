/**
 * ============================================================
 * 阿里云流式 ASR — 智能语音交互 NLS
 * 对标旧Python: core/providers/asr/aliyun_stream.py
 *
 * 使用阿里云智能语音交互（NLS）流式语音识别
 * 支持实时识别，需 AccessKey/Token 认证
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../../types';
import { Buffer } from 'buffer';

export class AliyunStreamASRProvider implements ASRProvider {
  readonly name = 'AliyunStreamASR';

  private apiUrl: string;
  private accessToken: string;
  private appKey: string;

  constructor(config: ASRConfig) {
    // 阿里云 NLS 端点
    this.apiUrl = config.api_url || 'https://nls-gateway-cn-shanghai.aliyuncs.com';
    this.accessToken = config.access_token || config.api_key || process.env.ALIYUN_ASR_TOKEN || '';
    this.appKey = config.appid || process.env.ALIYUN_ASR_APP_KEY || '';
  }

  async speechToText(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.accessToken) {
      console.warn('[AliyunASR] 未配置 AccessToken，返回空');
      return '';
    }

    try {
      // Float32 → Int16 PCM Buffer
      const pcmBuffer = this._float32ToInt16(audioData);

      // 阿里云 NLS HTTP 一次性识别
      const params = new URLSearchParams();
      params.set('appkey', this.appKey);
      params.set('format', 'pcm');
      params.set('sample_rate', String(sampleRate));
      params.set('enable_intermediate_result', 'false');
      params.set('enable_punctuation_prediction', 'true');
      params.set('enable_inverse_text_normalization', 'true');

      const response = await fetch(`${this.apiUrl}/stream/v1/asr?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-NLS-Token': this.accessToken,
        },
        body: new Uint8Array(pcmBuffer),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        console.error(`[AliyunASR] 请求失败: HTTP ${response.status}`);
        return '';
      }

      const result = await response.json();
      if (result.status === 20000000) {
        return result.result || '';
      }

      console.warn(`[AliyunASR] 服务返回错误: status=${result.status}, msg=${result.status_text}`);
      return '';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[AliyunASR] 识别失败: ${e.message}`);
      }
      return '';
    }
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
