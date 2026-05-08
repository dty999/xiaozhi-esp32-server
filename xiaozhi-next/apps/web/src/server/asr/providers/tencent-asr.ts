/**
 * ============================================================
 * 腾讯云 ASR — 语音识别
 * 对标旧Python: core/providers/asr/tencent.py
 *
 * 使用腾讯云语音识别 API（一句话识别 / 录音文件识别）
 * 认证方式：TC3-HMAC-SHA256 签名
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../../types';
import { Buffer } from 'buffer';
import * as crypto from 'crypto';

export class TencentASRProvider implements ASRProvider {
  readonly name = 'TencentASR';

  private secretId: string;
  private secretKey: string;
  private region: string;
  private endpoint: string;

  constructor(config: ASRConfig) {
    this.secretId = config.api_key || process.env.TENCENT_ASR_SECRET_ID || '';
    this.secretKey = config.access_token || process.env.TENCENT_ASR_SECRET_KEY || '';
    this.region = config.region || 'ap-guangzhou';
    this.endpoint = config.api_url || `https://asr.tencentcloudapi.com`;
  }

  async speechToText(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.secretId || !this.secretKey) {
      console.warn('[TencentASR] 未配置密钥，返回空');
      return '';
    }

    try {
      // Float32 → Int16 → Base64
      const pcmBuffer = this._float32ToInt16(audioData);
      const audioBase64 = pcmBuffer.toString('base64');

      const payload = JSON.stringify({
        EngineModelType: '16k_zh',
        VoiceFormat: 'wav',
        Data: audioBase64,
        DataLen: audioData.length * 2,
        ResTextFormat: 0,
        SourceType: 1,
      });

      const headers = this._signHeaders(payload);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[TencentASR] 请求失败: HTTP ${response.status}`);
        return '';
      }

      const result = await response.json();
      if (result.Response?.Result) {
        return result.Response.Result || '';
      }
      if (result.Response?.Error) {
        console.error(`[TencentASR] 错误: ${result.Response.Error.Message}`);
      }

      return '';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[TencentASR] 识别失败: ${e.message}`);
      }
      return '';
    }
  }

  /**
   * TC3-HMAC-SHA256 签名
   * 对标旧Python: tencent.py → _gen_signature()
   */
  private _signHeaders(payload: string): Record<string, string> {
    const service = 'asr';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]!;

    const httpMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQuery = '';
    const canonicalHeaders = `content-type:application/json\nhost:asr.tencentcloudapi.com\n`;
    const signedHeaders = 'content-type;host';
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

    const canonicalRequest = [
      httpMethod,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      hashedPayload,
    ].join('\n');

    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
      algorithm,
      String(timestamp),
      credentialScope,
      hashedCanonicalRequest,
    ].join('\n');

    const kDate = crypto.createHmac('sha256', `TC3${this.secretKey}`).update(date).digest();
    const kService = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': 'application/json',
      'Host': 'asr.tencentcloudapi.com',
      'X-TC-Action': 'SentenceRecognition',
      'X-TC-Version': '2019-06-14',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': this.region,
      'Authorization': authorization,
    };
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
