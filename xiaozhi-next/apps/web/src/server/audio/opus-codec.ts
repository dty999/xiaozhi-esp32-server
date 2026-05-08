/**
 * ============================================================
 * Opus 音频编解码器
 * 对标旧Python: core/providers/asr/base.py decode_opus() 与 TTS 编码逻辑
 *
 * ESP32 使用 Opus 格式传输音频，采样率 16000Hz，单声道，帧长 60ms
 * 每帧 16000 * 0.06 = 960 samples
 *
 * 【实现说明】
 * 本实现提供双模式支持：
 * 1. 纯JS模拟模式（默认）— 适用于无原生库的开发/测试环境
 * 2. 原生模式 — 依赖 @discordjs/opus 或 WASM libopus，生产环境推荐
 *
 * 替换为真实Opus编解码：
 *   npm install @discordjs/opus
 *   然后设置环境变量 OPUS_BACKEND=native
 * ============================================================
 */

import { Buffer } from 'buffer';

// ==============================
// 音频格式常量
// ==============================

/** 采样率（Hz），ESP32 Opus 音频标准 */
export const SAMPLE_RATE = 16000;
/** 声道数，ESP32 使用单声道 */
export const CHANNELS = 1;
/** 帧长（毫秒），ESP32 使用 60ms/帧 */
export const FRAME_DURATION_MS = 60;
/** 每帧采样数: 16000 * 0.06 = 960 */
export const FRAME_SAMPLES = Math.floor(SAMPLE_RATE * FRAME_DURATION_MS / 1000); // 960
/** 每样点字节数: int16 = 2 bytes */
export const BYTES_PER_SAMPLE = 2;
/** 每帧字节数: 960 * 2 = 1920 */
export const FRAME_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE;

/**
 * Opus编解码器
 *
 * 参考实现方案（生产环境）：
 * 1. @discordjs/opus — Node原生，需C++编译工具链
 * 2. opusscript — 纯JS，性能较低
 * 3. WASM版libopus — 推荐：性能好且跨平台
 */
export class OpusCodec {
  /** 编码器实例（原生模式） */
  private encoder: any = null;
  /** 解码器实例（原生模式） */
  private decoder: any = null;
  /** 后端类型 */
  private backend: 'native' | 'mock';

  constructor() {
    this.backend = process.env.OPUS_BACKEND === 'native' ? 'native' : 'mock';

    if (this.backend === 'native') {
      this._initNative();
    }

    console.log(
      `[OpusCodec] 初始化完成，后端: ${this.backend}` +
      `, 采样率: ${SAMPLE_RATE}Hz, 帧长: ${FRAME_DURATION_MS}ms, 每帧 ${FRAME_SAMPLES} 采样`
    );
  }

  /**
   * 初始化原生Opus库
   * 注意：需要先安装 @discordjs/opus 或 opusscript
   * npm install @discordjs/opus
   */
  private _initNative(): void {
    try {
      // 尝试加载 @discordjs/opus
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const opus = require('@discordjs/opus');
      this.encoder = new opus.OpusEncoder(SAMPLE_RATE, CHANNELS);
      this.decoder = new opus.OpusEncoder(SAMPLE_RATE, CHANNELS);
      console.log('[OpusCodec] 原生Opus编解码器初始化成功');
    } catch {
      console.warn('[OpusCodec] 原生Opus库加载失败，回退到模拟模式');
      console.warn('[OpusCodec] 安装原生库: npm install @discordjs/opus');
      this.backend = 'mock';
    }
  }

  /**
   * Opus 解码 → PCM Float32Array
   *
   * 对标旧Python: core/providers/asr/base.py → decode_opus()
   * 此方法被 VAD → ASR 管线调用
   *
   * @param opusData Opus编码的音频帧（Buffer）
   * @returns PCM Float32Array（16kHz单声道，值域[-1, 1]）
   */
  async decode(opusData: Buffer): Promise<Float32Array> {
    if (this.backend === 'native' && this.decoder) {
      return this._decodeNative(opusData);
    }
    return this._decodeMock(opusData);
  }

  /**
   * PCM Float32Array → Opus 编码
   *
   * 对标旧Python: TTS中 audio_bytes_to_data_stream() 编码逻辑
   * 此方法被 TTS → ESP32 管线调用
   *
   * @param pcmData PCM Float32Array（值域[-1, 1]）
   * @returns Opus编码的音频帧（Buffer）
   */
  async encode(pcmData: Float32Array): Promise<Buffer> {
    if (this.backend === 'native' && this.encoder) {
      return this._encodeNative(pcmData);
    }
    return this._encodeMock(pcmData);
  }

  // ==============================
  // 原生实现（需@discordjs/opus）
  // ==============================

  /**
   * 原生Opus解码
   * @discordjs/opus 的 OpusEncoder.decode() 返回 Int16Array PCM
   */
  private _decodeNative(opusData: Buffer): Float32Array {
    // OpusEncoder.decode 输入Opus Buffer，输出PCM Int16Array
    const pcmInt16 = this.decoder.decode(opusData);
    // 转换为 Float32Array (值域[-1, 1])
    const result = new Float32Array(pcmInt16.length);
    for (let i = 0; i < pcmInt16.length; i++) {
      result[i] = pcmInt16[i] / 32768.0;
    }
    return result;
  }

  /**
   * 原生Opus编码
   * @discordjs/opus 的 OpusEncoder.encode() 输入 Int16Array PCM，返回Opus Buffer
   */
  private _encodeNative(pcmData: Float32Array): Buffer {
    // Float32 → Int16
    const pcmInt16 = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]!));
      pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // 编码为Opus
    return this.encoder.encode(Buffer.from(pcmInt16.buffer));
  }

  // ==============================
  // 模拟实现（开发/测试环境用）
  // 原则：保持帧结构一致，但数据为模拟值
  // ==============================

  /**
   * 模拟Opus解码
   * 策略：将Opus Buffer的字节值映射回浮点音频样点
   * 这不是真正的Opus解码，但保持了数据流的连续性，
   * 足以在无ES32设备的开发环境中验证管线逻辑
   */
  private _decodeMock(opusData: Buffer): Float32Array {
    const numSamples = FRAME_SAMPLES; // 960 samples
    const result = new Float32Array(numSamples);

    // 策略1：如果Opus数据包含足够字节，用字节值模拟音频幅度
    // 策略2：否则生成低幅度的模拟音频（静音检测用）
    if (opusData.length >= numSamples * 2) {
      // 将原始字节解释为int16 PCM，再归一化为float32
      for (let i = 0; i < numSamples; i++) {
        const offset = i * 2;
        const int16 = (opusData[offset]! | (opusData[offset + 1]! << 8)) << 16 >> 16;
        result[i] = int16 / 32768.0;
      }
    } else if (opusData.length > 0) {
      // 数据不够960采样点，用线性插值填充
      const ratio = numSamples / opusData.length;
      for (let i = 0; i < numSamples; i++) {
        const srcIdx = Math.floor(i / ratio);
        // 将字节值映射到[-0.5, 0.5]范围，模拟正常语音幅度
        result[i] = ((opusData[srcIdx]! / 255.0) - 0.5);
      }
    }
    // 空数据则返回零值静音帧

    return result;
  }

  /**
   * 模拟Opus编码
   * 策略：对Float32音频进行下采样量化，打包为"类Opus"格式
   * 实际部署时，ESP32期待标准Opus格式；开发环境中此模拟数据足以验证管线
   */
  private _encodeMock(pcmData: Float32Array): Buffer {
    // 将Float32降精度为uint8（极简模拟编码）
    // 真正的Opus编码会将960个float样点压缩为几十到几百字节
    // 此处直接传原始PCM的uint8量化版本，保持帧结构
    const buf = Buffer.alloc(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      // 将[-1,1]映射到[0,255]
      const normalized = Math.max(-1, Math.min(1, pcmData[i]!));
      buf[i] = Math.floor((normalized + 1) * 127.5);
    }
    return buf;
  }

  // ==============================
  // 工具方法
  // ==============================

  /**
   * Float32 PCM → Int16 Buffer（生成WAV数据用）
   * @param samples Float32Array（值域[-1, 1]）
   * @returns Int16 PCM Buffer
   */
  float32ToInt16Buffer(samples: Float32Array): Buffer {
    const buf = Buffer.alloc(samples.length * BYTES_PER_SAMPLE);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      buf.writeInt16LE(int16, i * 2);
    }
    return buf;
  }

  /**
   * 生成 WAV 文件 Buffer
   * 用处：将 Float32 PCM 打包为 WAV 格式，供 ASR API 使用
   * 对标旧Python: speech_to_text_wrapper 中生成文件逻辑
   *
   * @param samples Float32Array（值域[-1, 1]）
   * @param sampleRate 采样率（默认16000）
   * @returns WAV 文件 Buffer
   */
  float32ToWav(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Buffer {
    const numChannels = CHANNELS;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * blockAlign;

    // WAV Header: 44 bytes
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);              // Subchunk1 size (PCM)
    header.writeUInt16LE(1, 20);               // Audio format (PCM = 1)
    header.writeUInt16LE(numChannels, 22);     // Num channels
    header.writeUInt32LE(sampleRate, 24);      // Sample rate
    header.writeUInt32LE(byteRate, 28);        // Byte rate
    header.writeUInt16LE(blockAlign, 32);      // Block align
    header.writeUInt16LE(bitsPerSample, 34);   // Bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    // PCM data
    const pcmData = this.float32ToInt16Buffer(samples);

    return Buffer.concat([header, pcmData]);
  }

  /**
   * 切分大音频为数个60ms帧
   * @param audio 完整PCM音频
   * @returns 分帧数组
   */
  splitToFrames(audio: Float32Array): Float32Array[] {
    const frames: Float32Array[] = [];
    for (let i = 0; i < audio.length; i += FRAME_SAMPLES) {
      const frame = audio.slice(i, i + FRAME_SAMPLES);
      if (frame.length === FRAME_SAMPLES) {
        frames.push(frame);
      }
    }
    return frames;
  }

  /**
   * 合并多个PCM帧为一个完整音频
   * @param frames 帧数组
   * @returns 合并后的Float32Array
   */
  mergeFrames(frames: Float32Array[]): Float32Array {
    const totalLength = frames.reduce((sum, f) => sum + f.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of frames) {
      result.set(frame, offset);
      offset += frame.length;
    }
    return result;
  }
}
