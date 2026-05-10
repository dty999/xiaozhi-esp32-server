/**
 * ============================================================
 * 微软 Edge TTS 提供者（免费，流式，WebSocket 协议）
 * 对标旧Python: core/providers/tts/edge.py → edge_tts.Communicate
 *
 * 通过微软 Edge 浏览器 TTS WebSocket API 进行语音合成
 * 完全免费，无需 API Key
 *
 * 实现原理（与 Python edge-tts 库一致）：
 * 1. 向 Edge TTS 服务发起 WebSocket 连接
 * 2. 发送 SSML 配置请求（含 ReqId、Timestamp）
 * 3. 通过 WebSocket 接收音频数据块（MP3 格式）
 * 4. 将 MP3 数据解码为 PCM Float32 供 Opus 编码器使用
 *
 * Edge TTS 支持的语音列表（中文）：
 *   zh-CN-XiaoxiaoNeural (女声-温柔)
 *   zh-CN-YunxiNeural    (男声-阳光)
 *   zh-CN-YunjianNeural  (男声-成熟)
 *   zh-CN-XiaoyiNeural   (女声-活泼)
 *   zh-CN-YunyangNeural  (男声-新闻播报)
 *   zh-CN-XiaochenNeural (女声-客服)
 *   zh-CN-XiaohanNeural  (女声-可爱)
 *   zh-CN-XiaomengNeural (女声-甜美)
 *   zh-CN-XiaomoNeural   (女声-平静)
 *   zh-CN-XiaoqiuNeural  (女声-温柔)
 *   zh-CN-XiaoruiNeural  (女声-沉稳)
 *   zh-CN-XiaoshuangNeural (女声-活泼)
 *   zh-CN-XiaoxuanNeural (女声-自信)
 *   zh-CN-XiaoyanNeural  (女声-甜美)
 *   zh-CN-YunfengNeural  (男声-深沉)
 *   zh-CN-YunhaoNeural   (男声-磁性)
 *   zh-CN-YunjieNeural   (男声-讲述)
 *   zh-CN-YunxiaNeural   (男声-陪伴)
 *   zh-CN-YunyeNeural    (男声-剧情)
 *   zh-CN-YunzeNeural    (男声-温柔)
 *   zh-CN-XiaozhenNeural (女声-东北话)
 * ============================================================
 */

import WebSocket from 'ws';
import type { TTSProvider, TTSConfig } from '../../types';

const EDGE_TTS_WS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
  '?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4' +
  '&ConnectionId=';

const WSS_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin': 'chrome-extension://jdiccldnimdaeeaclkmejddbjcnnjmo',
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
  'Accept': '*/*',
};

function genReqId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function genTimestamp(): string {
  const d = new Date();
  return d.toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

export class EdgeTTSProvider implements TTSProvider {
  readonly name = 'EdgeTTS';

  private defaultVoice: string;
  private outputFormat: string;

  constructor(config: TTSConfig) {
    this.defaultVoice = config.voice || config.voiceName || 'zh-CN-XiaoxiaoNeural';
    this.outputFormat = config.format || 'raw-16khz-16bit-mono-pcm';
  }

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!text.trim()) return;

    const voiceName = voice || this.defaultVoice;
    const rate = config.rate ?? 1.0;
    const pitch = config.pitch ?? 0;
    const reqId = genReqId();

    const ssml = this._buildSSML(text, voiceName, rate, pitch);

    const connectionId = genReqId();
    const wsUrl = EDGE_TTS_WS_URL + connectionId;

    let ws: WebSocket;
    try {
      ws = await this._connect(wsUrl);
    } catch (e: any) {
      console.error(`[EdgeTTS] WebSocket连接失败: ${e.message}`);
      yield new Float32Array(960);
      return;
    }

    try {
      const audioChunks: Buffer[] = [];
      let synthesisDone = false;

      const audioPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Edge TTS 超时'));
        }, 30000);

        ws!.on('message', (data: WebSocket.Data) => {
          const msg = typeof data === 'string' ? data : data.toString('utf-8');

          if (msg.includes('Path:turn.start')) {
            // 合成开始
          } else if (msg.includes('Path:turn.end')) {
            synthesisDone = true;
            clearTimeout(timeout);
            resolve();
          }
        });

        ws!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        ws!.on('close', () => {
          clearTimeout(timeout);
          if (!synthesisDone) resolve();
        });
      });

      this._sendConfig(ws, reqId, this.outputFormat);
      this._sendSSML(ws, reqId, ssml);

      const binaryChunks: Buffer[] = [];
      ws.on('message', (data: WebSocket.Data) => {
        if (Buffer.isBuffer(data)) {
          const headerEnd = data.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            binaryChunks.push(data.subarray(headerEnd + 4));
          } else {
            binaryChunks.push(data);
          }
        }
      });

      await audioPromise;

      try { ws.close(); } catch {}

      if (binaryChunks.length > 0) {
        const fullPcm = Buffer.concat(binaryChunks);
        const pcmFloat = this._pcm16ToFloat32(fullPcm);
        if (pcmFloat.length > 0) {
          const CHUNK_SIZE = 960 * 6;
          for (let i = 0; i < pcmFloat.length; i += CHUNK_SIZE) {
            yield pcmFloat.subarray(i, Math.min(i + CHUNK_SIZE, pcmFloat.length));
          }
        }
      }
    } catch (e: any) {
      console.error(`[EdgeTTS] 合成失败: ${e.message}`);
      try { ws.close(); } catch {}
      yield new Float32Array(960);
    }
  }

  private _connect(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: WSS_HEADERS,
        perMessageDeflate: false,
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('连接超时'));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private _sendConfig(ws: WebSocket, reqId: string, format: string): void {
    const timestamp = genTimestamp();
    const configMsg = [
      `X-Timestamp:${timestamp}`,
      'Content-Type:application/json; charset=utf-8',
      'Path:speech.config',
      '',
      `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"${format}"}}}}`,
    ].join('\r\n');
    ws.send(configMsg);
  }

  private _sendSSML(ws: WebSocket, reqId: string, ssml: string): void {
    const timestamp = genTimestamp();
    const ssmlMsg = [
      `X-RequestId:${reqId}`,
      `X-Timestamp:${timestamp}Z`,
      'Content-Type:application/ssml+xml',
      `X-RequestId:${reqId}`,
      'Path:ssml',
      '',
      ssml,
    ].join('\r\n');
    ws.send(ssmlMsg);
  }

  private _buildSSML(text: string, voice: string, rate: number, pitch: number): string {
    const escaped = this._escapeXml(text);
    const rateStr = rate >= 1 ? `+${Math.round((rate - 1) * 100)}%` : `${Math.round((rate - 1) * 100)}%`;
    const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">
    <prosody rate="${rateStr}" pitch="${pitchStr}">
      ${escaped}
    </prosody>
  </voice>
</speak>`;
  }

  private _pcm16ToFloat32(pcmData: Buffer): Float32Array {
    const numSamples = Math.floor(pcmData.length / 2);
    if (numSamples <= 0) return new Float32Array(0);

    const result = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      let int16 = pcmData.readInt16LE(i * 2);
      result[i] = int16 / 32768.0;
    }
    return result;
  }

  private _escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
