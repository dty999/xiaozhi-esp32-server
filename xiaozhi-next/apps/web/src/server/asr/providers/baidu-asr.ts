/**
 * ============================================================
 * 百度 ASR — 语音识别
 * 对标旧Python: core/providers/asr/baidu.py
 *
 * 使用百度语音识别 REST API
 * 接入方式：OAuth2.0 获取 access_token 后调用
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../../types';
import { Buffer } from 'buffer';

export class BaiduASRProvider implements ASRProvider {
  readonly name = 'BaiduASR';

  private apiKey: string;
  private secretKey: string;
  private apiUrl: string;

  /** 缓存的 access token */
  private static cachedToken: string | null = null;
  private static tokenExpireAt = 0;

  constructor(config: ASRConfig) {
    this.apiKey = config.api_key || process.env.BAIDU_ASR_API_KEY || '';
    this.secretKey = config.access_token || process.env.BAIDU_ASR_SECRET_KEY || '';
    this.apiUrl = config.api_url || 'https://vop.baidu.com/server_api';
  }

  async speechToText(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.apiKey || !this.secretKey) {
      console.warn('[BaiduASR] 未配置密钥，返回空');
      return '';
    }

    try {
      // Float32 → Int16 PCM Buffer
      const pcmBuffer = this._float32ToInt16(audioData);
      const audioBase64 = pcmBuffer.toString('base64');

      // 获取 access token
      const accessToken = await this._getAccessToken();
      if (!accessToken) {
        console.warn('[BaiduASR] 获取 access token 失败');
        return '';
      }

      const params = {
        format: 'pcm',
        rate: sampleRate,
        channel: 1,
        cuid: `xiaozhi-${Date.now()}`,
        token: accessToken,
        speech: audioBase64,
        len: audioData.length * 2,
        dev_pid: 1537, // 普通话
        lan: 'zh',
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[BaiduASR] 请求失败: HTTP ${response.status}`);
        return '';
      }

      const result = await response.json();
      if (result.err_no === 0 && result.result?.length > 0) {
        return result.result.join('');
      }

      if (result.err_no !== 0) {
        console.warn(`[BaiduASR] 错误: err_no=${result.err_no}, msg=${result.err_msg}`);
      }

      return '';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[BaiduASR] 识别失败: ${e.message}`);
      }
      return '';
    }
  }

  /**
   * 获取百度 OAuth2.0 access token
   * 对标旧Python: baidu.py → _get_token()
   */
  private async _getAccessToken(): Promise<string | null> {
    // 检查缓存
    if (BaiduASRProvider.cachedToken && Date.now() < BaiduASRProvider.tokenExpireAt) {
      return BaiduASRProvider.cachedToken;
    }

    try {
      const response = await fetch(
        `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`,
        { method: 'POST', signal: AbortSignal.timeout(5000) },
      );

      if (!response.ok) return null;

      const data = await response.json();
      if (data.access_token) {
        BaiduASRProvider.cachedToken = data.access_token;
        // 提前 5 分钟过期
        BaiduASRProvider.tokenExpireAt = Date.now() + (data.expires_in - 300) * 1000;
        return data.access_token;
      }
      return null;
    } catch {
      return null;
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
