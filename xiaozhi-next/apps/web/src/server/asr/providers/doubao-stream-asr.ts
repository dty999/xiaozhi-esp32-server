/**
 * ============================================================
 * 豆包流式 ASR — 火山引擎语音识别
 * 对标旧Python: core/providers/asr/doubao_stream.py
 *
 * 使用火山引擎 V2 流式语音识别 API
 * 支持实时流式识别，采样率 16000Hz，PCM 格式
 * ============================================================
 */

import type { ASRProvider, ASRConfig } from '../../types';
import { Buffer } from 'buffer';

/** 火山引擎 ASR 响应 */
interface DoubaoASRResponse {
  code?: number;
  message?: string;
  result?: {
    text: string;
    utterances?: Array<{ text: string; definite: boolean }>;
  };
}

export class DoubaoStreamASRProvider implements ASRProvider {
  readonly name = 'DoubaoStreamASR';

  private apiUrl: string;
  private apiKey: string;
  private appId: string;
  private cluster: string;

  constructor(config: ASRConfig) {
    // 火山引擎 ASR 端点
    this.apiUrl = config.api_url || 'https://openspeech.bytedance.com';
    this.apiKey = config.api_key || process.env.DOUBAO_ASR_API_KEY || '';
    this.appId = config.appid || process.env.DOUBAO_ASR_APP_ID || '';
    this.cluster = config.cluster || process.env.DOUBAO_ASR_CLUSTER || 'volcengine_input_edu';
  }

  async speechToText(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.apiKey) {
      console.warn('[DoubaoASR] 未配置 API Key，返回空');
      return '';
    }

    try {
      // Float32 → Int16 PCM Buffer
      const pcmBuffer = this._float32ToInt16(audioData);

      // 火山引擎要求格式：完整的音频 PCM 数据
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(pcmBuffer)], { type: 'audio/pcm' });
      formData.append('audio', audioBlob, 'audio.pcm');
      formData.append('format', 'pcm');
      formData.append('rate', String(sampleRate));
      formData.append('bits', '16');
      formData.append('channel', '1');
      formData.append('language', 'zh-CN');
      formData.append('show_utterances', 'false');
      formData.append('nbest', '1');

      const response = await fetch(`${this.apiUrl}/api/v1/asr?appid=${this.appId}&cluster=${this.cluster}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[DoubaoASR] 请求失败: HTTP ${response.status}`);
        return '';
      }

      const result: DoubaoASRResponse = await response.json();
      if (result.code === 1000 || result.code === 0) {
        const text = result.result?.text?.trim() || '';
        return text;
      }

      console.warn(`[DoubaoASR] 服务返回错误: code=${result.code}, msg=${result.message}`);
      return '';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[DoubaoASR] 识别失败: ${e.message}`);
      }
      return '';
    }
  }

  /** Float32 → Int16 PCM Buffer */
  private _float32ToInt16(samples: Float32Array): Buffer {
    const buf = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      buf.writeInt16LE(int16, i * 2);
    }
    return buf;
  }
}
