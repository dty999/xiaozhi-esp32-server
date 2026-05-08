/**
 * ============================================================
 * 微软 Edge TTS 提供者（免费，流式）
 * 对标旧Python: core/providers/tts/edge.py
 *
 * 通过微软 Edge 浏览器 TTS API 进行语音合成
 * 完全免费，无需 API Key，支持 SSML
 * 格式：MP3 流，需解码为 PCM Float32
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

import type { TTSProvider, TTSConfig } from '../../types';

/**
 * Edge TTS 提供者
 *
 * 对标旧Python: class TTSProvider(TTSProviderBase) — edge_tts.Communicate 实现
 *
 * 实现原理：
 * Edge TTS 是通过微软 Edge 浏览器的 "大声朗读" 功能实现的。
 * API地址: https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
 * 输入SSML → 输出多个音频数据块（MP3格式）
 */
export class EdgeTTSProvider implements TTSProvider {
  readonly name = 'EdgeTTS';

  /** 默认语音 */
  private defaultVoice: string;
  /** 音频格式 */
  private outputFormat: string;

  constructor(config: TTSConfig) {
    // 从配置中提取语音名称，默认为温柔女声
    this.defaultVoice = config.voice || config.voiceName || 'zh-CN-XiaoxiaoNeural';
    // 输出格式：16kHz，32kbps，单声道，MP3
    this.outputFormat = config.format || 'audio-16khz-32kbitrate-mono-mp3';
  }

  /**
   * 流式文本转语音
   *
   * 对标旧Python: async def text_to_speak(self, text, output_file)
   *
   * @param text 要合成的文本
   * @param voice 语音名称/角色
   * @param config TTS参数（volume, rate, pitch）
   * @returns 异步迭代器，逐个返回PCM Float32Array音频块
   */
  async *textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array> {
    if (!text.trim()) return;

    const voiceName = voice || this.defaultVoice;
    const rate = config.rate ?? 1.0;
    const pitch = config.pitch ?? 0;

    // 构建 SSML (Speech Synthesis Markup Language)
    const ssml = this._buildSSML(text, voiceName, rate, pitch);

    // 调用 Edge TTS API
    const url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
      '?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': this.outputFormat,
        },
        body: ssml,
      });
    } catch (e: any) {
      console.error(`[EdgeTTS] 请求失败: ${e.message}`);
      // 返回静音帧作为降级处理
      yield new Float32Array(960);
      return;
    }

    if (!response.ok) {
      console.error(`[EdgeTTS] API错误 ${response.status}`);
      yield new Float32Array(960);
      return;
    }

    if (!response.body) {
      yield new Float32Array(960);
      return;
    }

    // 解析响应流
    // Edge TTS 返回 MP3 格式的音频块
    // 每个音频块以WebSocket帧的二进制数据返回
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // value 是 Uint8Array，包含 MP3 数据
        // 在开发模式下，直接将 MP3 数据传递回去
        // 生产环境需 MP3 → PCM 解码（可用 audiobuffer-to-wav 等库）
        const audioBlock = this._mp3ToPCMFloat32(value);

        if (audioBlock.length > 0) {
          yield audioBlock;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 构建 SSML 请求体
   * 对标旧Python: Edge TTS 的 ssml 构建方式
   */
  private _buildSSML(text: string, voice: string, rate: number, pitch: number): string {
    // XML 转义
    const escaped = this._escapeXml(text);

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
              xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
      <voice name="${voice}">
        <prosody rate="${rate >= 0.01 ? rate : 1.0}" pitch="${pitch >= -50 ? pitch + '%' : '0%'}">
          ${escaped}
        </prosody>
      </voice>
    </speak>`;
  }

  /**
   * MP3字节 → Float32 PCM 的简化转换
   *
   * 注意：这是简化的模拟转换，仅用于开发测试
   * 生产环境需使用完整的 MP3 解码器（如 lamejs）
   *
   * 实现思路：
   *   npm install lamejs
   *   使用 Mp3Decoder 完整解码 MP3 → PCM Float32
   */
  private _mp3ToPCMFloat32(mp3Data: Uint8Array): Float32Array {
    // TODO: 集成完整的 MP3 → PCM 解码
    // 当前使用简化方案：假设 MP3 数据可直接近似为 PCM
    // 生产环境请使用 lamejs 或 ffmpeg 进行转码

    const numSamples = Math.floor(mp3Data.length / 2); // 粗略估计
    if (numSamples <= 0) return new Float32Array(0);

    const result = new Float32Array(numSamples);
    for (let i = 0; i < numSamples && i * 2 + 1 < mp3Data.length; i++) {
      const lo = mp3Data[i * 2]!;
      const hi = mp3Data[i * 2 + 1]!;
      let int16 = (hi << 8) | lo;
      if (int16 >= 0x8000) int16 -= 0x10000;
      result[i] = int16 / 32768.0;
    }
    return result;
  }

  /**
   * XML 特殊字符转义
   */
  private _escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
