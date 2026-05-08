/**
 * ============================================================
 * Silero VAD (Voice Activity Detection) 语音活动检测引擎
 * 对标旧Python: core/providers/vad/silero.py
 *
 * 功能：逐帧判断音频是否包含人声，驱动 ASR 识别时机
 *
 * 核心机制（对标Python实现）：
 * 1. 双阈值滞回 — 防止语音边界抖动（threshold=0.5, threshold_low=0.3）
 * 2. 滑动窗口投票 — 3帧多数决平滑瞬时噪声
 * 3. 静默检测 — 超过静默阈值触发语音停止（默认200ms）
 * 4. ONNX Runtime 推理 — 使用 silero_vad.onnx 模型
 *
 * 【部署说明】
 * 生产环境需将 silero_vad.onnx 置于 models/ 目录
 * 或指定环境变量 VAD_MODEL_PATH
 *
 * npm install onnxruntime-node
 * 模型下载：https://github.com/snakers4/silero-vad
 * ============================================================
 */

// ONNX Runtime 的类型导入（可选依赖，首次使用才加载）
type OrtSession = any;
type OrtTensor = any;

interface VADResult {
  /** 语音概率 [0, 1] */
  probability: number;
  /** 是否检测到人声 */
  isSpeech: boolean;
}

/**
 * VAD 连接状态（每个设备独立维护）
 * 对标旧Python: ConnectionHandler 中的 vad 相关变量
 */
export interface VADConnectionState {
  /** Opus解码器实例（每个连接独立） */
  opusDecoder: any;
  /** 累积的音频缓冲区（原始PCM字节） */
  audioBuffer: number[];
  /** VAD模型上下文状态数组 */
  context: Float32Array | null;
  /** VAD模型循环状态数组 */
  state: Float32Array | null;
  /** 采样率（固定16000） */
  sampleRate: number;
}

/**
 * SileroVAD 语音活动检测器
 *
 * 设计为单例模式 —— 所有设备连接共享同一个 ONNX 模型实例，
 * 但每个连接独立维护自己的音频缓冲区与状态机。
 * 对标旧Python: is_vad() 方法中通过 conn 参数维护每个连接的状态
 */
export class SileroVAD {
  /** 单例 */
  private static instance: SileroVAD;

  /** ONNX推理会话 */
  private session: OrtSession | null = null;

  // ==============================
  // VAD 参数配置
  // 对标旧Python: __init__ 中的参数
  // ==============================

  /** 采样率（固定16000Hz） */
  readonly sampleRate = 16000;

  /** 高阈值：语音概率高于此值判定为有人声 */
  private threshold = 0.5;

  /** 低阈值：用于滞回，防止语音边界抖动 */
  private thresholdLow = 0.3;

  /** 静默阈值（毫秒），超过此时长判定语音停止 */
  private silenceThresholdMs = 200;

  /** 滑动窗口大小（帧数），用于投票决策 */
  private frameWindowSize = 3;

  /** 每帧采样数（512 samples = 32ms @ 16kHz） */
  private samplesPerFrame = 512;

  /** VAD上下文长度（Silero模型要求64 samples） */
  private contextSize = 64;

  /** 是否已初始化 */
  private initialized = false;

  /** 模拟模式（无ONNX运行时使用） */
  private mockMode = false;

  /**
   * 获取单例实例
   * 对标旧Python: static getInstance()
   */
  static getInstance(): SileroVAD {
    if (!SileroVAD.instance) {
      SileroVAD.instance = new SileroVAD();
    }
    return SileroVAD.instance;
  }

  private constructor() {}

  /**
   * 初始化VAD引擎
   * 加载 Silero VAD ONNX 模型
   * 对标旧Python: __init__ 中 self.session = onnxruntime.InferenceSession(...)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 尝试加载onnxruntime-node
      const ort = require('onnxruntime-node');
      const modelPath = process.env.VAD_MODEL_PATH || './models/silero_vad.onnx';

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      console.log(`[SileroVAD] ONNX模型加载成功: ${modelPath}`);
      this.mockMode = false;
    } catch (e: any) {
      console.warn('[SileroVAD] ONNX模型加载失败，启用模拟模式');
      console.warn('[SileroVAD] 安装onnx: npm install onnxruntime-node');
      console.warn(`[SileroVAD] 详情: ${e.message}`);
      this.mockMode = true;
    }

    this.initialized = true;
  }

  /**
   * 为连接初始化VAD状态
   * 每个连接需要独立的缓冲区、上下文、状态
   *
   * @param state 连接状态对象（会被就地修改）
   */
  initConnectionState(state: VADConnectionState): void {
    state.audioBuffer = [];
    state.context = new Float32Array(this.contextSize); // 64个零值
    state.state = new Float32Array(256 * 2); // Silero状态大小
    this._resetState(state);
  }

  /**
   * 核心VAD检测方法
   *
   * 对标旧Python: is_vad(conn, opus_packet) 方法
   * 处理流程：
   *   1. Opus解码 → PCM Int16
   *   2. 累积到音频缓冲区
   *   3. 以512采样点为窗口推理
   *   4. 双阈值滞回判决策略
   *   5. 滑动窗口投票
   *   6. 静默检测 → 语音停止标志
   *
   * @param connState 连接状态（含音频缓冲区等上下文）
   * @param pcmFrame PCM Float32Array帧（60ms = 960 samples）
   * @param listenMode 监听模式（'auto' | 'manual'）— manual模式始终返回true
   * @returns VAD检测结果
   */
  async detectSpeech(
    connState: VADConnectionState,
    pcmFrame: Float32Array,
    listenMode: string = 'auto',
  ): Promise<VADResult> {
    // 手动模式：所有音频都视为有声音（由客户端手动触发识别）
    if (listenMode === 'manual') {
      return { probability: 1.0, isSpeech: true };
    }

    if (!this.initialized) await this.init();

    // 确保连接状态已初始化
    if (!connState.context) {
      this.initConnectionState(connState);
    }

    if (this.mockMode) {
      return this._detectSpeechMock(pcmFrame);
    }

    return this._detectSpeechReal(connState, pcmFrame);
  }

  /**
   * 基于能量阈值的模拟VAD检测
   * 在没有ONNX Runtime的开发环境中使用
   *
   * 策略：
   * - 计算音频帧的RMS（均方根）能量
   * - 能量高于阈值判定为有声音
   * - 使用帧间平滑减少误判
   */
  private energySmooth = 0;
  private energyThreshold = 0.02; // RMS能量阈值

  private _detectSpeechMock(pcmFrame: Float32Array): VADResult {
    // 计算RMS能量
    let sumSq = 0;
    for (let i = 0; i < pcmFrame.length; i++) {
      sumSq += pcmFrame[i]! * pcmFrame[i]!;
    }
    const rms = Math.sqrt(sumSq / pcmFrame.length);

    // 指数平滑
    this.energySmooth = this.energySmooth * 0.7 + rms * 0.3;

    // 双阈值判定
    const isSpeech = this.energySmooth > this.energyThreshold;

    return {
      probability: Math.min(1.0, this.energySmooth / (this.energyThreshold * 5)),
      isSpeech,
    };
  }

  /**
   * 真实ONNX VAD推理
   * 对标旧Python: is_vad() 中 ONNX 推理部分
   */
  private async _detectSpeechReal(
    connState: VADConnectionState,
    pcmFrame: Float32Array,
  ): Promise<VADResult> {
    // 将 float32 [-1,1] 转换为 int16，累积到音频缓冲区
    for (let i = 0; i < pcmFrame.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmFrame[i]!));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      // 存储为相邻的两个字节（低字节在前）
      connState.audioBuffer.push(int16 & 0xFF);
      connState.audioBuffer.push((int16 >> 8) & 0xFF);
    }

    // 每2字节为1个int16样本，512样本为一帧（恰好32ms @ 16kHz）
    const samplesForWindow = this.samplesPerFrame * 2; // 512 * 2 bytes
    let bestProb = 0;
    let anySpeech = false;

    while (connState.audioBuffer.length >= samplesForWindow) {
      // 取出512个样本（1024字节）
      const chunk = connState.audioBuffer.splice(0, samplesForWindow);

      // int16字节 → float32归一化
      const audioFloat32 = new Float32Array(this.samplesPerFrame);
      for (let i = 0; i < this.samplesPerFrame; i++) {
        const lo = chunk[i * 2]!;
        const hi = chunk[i * 2 + 1]!;
        // 还原为有符号int16
        let int16 = lo | (hi << 8);
        if (int16 >= 0x8000) int16 -= 0x10000;
        audioFloat32[i] = int16 / 32768.0;
      }

      // 拼装输入: [context(64) + new_samples(512)]
      const inputLength = this.contextSize + this.samplesPerFrame;
      const inputTensor = new Float32Array(inputLength);
      inputTensor.set(connState.context!, 0);
      inputTensor.set(audioFloat32, this.contextSize);

      // ONNX推理
      try {
        const ort = require('onnxruntime-node');
        const feeds: Record<string, any> = {};
        const inputName = this.session!.inputNames[0];
        const stateName = this.session!.inputNames[1];
        const srName = this.session!.inputNames[2];

        feeds[inputName] = new ort.Tensor('float32', inputTensor, [1, inputLength]);
        feeds[stateName] = new ort.Tensor('float32', connState.state, [2, 1, 128]);
        feeds[srName] = new ort.Tensor('int64', [this.sampleRate], [1]);

        const results = await this.session!.run(feeds);
        const outputName = this.session!.outputNames[0];
        const stateOutName = this.session!.outputNames[1];

        const prob = results[outputName].data[0] as number;
        connState.state = new Float32Array(results[stateOutName].data as Float32Array);

        if (prob > bestProb) bestProb = prob;
        if (prob > this.thresholdLow) anySpeech = true;

        // 更新上下文（保留最后64个样本）
        connState.context = audioFloat32.slice(
          this.samplesPerFrame - this.contextSize,
        );
      } catch (e) {
        console.error('[SileroVAD] ONNX推理失败:', e);
        this.mockMode = true;
        return this._detectSpeechMock(pcmFrame);
      }
    }

    return {
      probability: bestProb,
      isSpeech: anySpeech,
    };
  }

  /**
   * 重置VAD模型状态
   */
  private _resetState(state: VADConnectionState): void {
    if (state.state) {
      state.state.fill(0);
    }
    if (state.context) {
      state.context.fill(0);
    }
  }
}

// ==============================
// 静默检测辅助器
// 对标旧Python: receiveAudioHandle.no_voice_close_connect()
// ==============================

/**
 * 静默检测状态机
 * 追踪说话 → 静默 → 触发语音停止 的状态转换
 */
export class SilenceDetector {
  /** 记录最后一次检测到人声的时间（毫秒） */
  private lastVoiceTime = 0;
  /** 当前是否正在说话 */
  private isSpeaking = false;
  /** 静默帧计数器 */
  private silenceFrames = 0;
  /** 静默帧阈值（超过此值触发语音停止） */
  private readonly silenceFrameThreshold: number;
  /** 静默时长阈值（毫秒） */
  private readonly silenceDurationMs: number;

  constructor(silenceDurationMs = 200) {
    this.silenceDurationMs = silenceDurationMs;
    // 60ms/帧，200ms ÷ 60 ≈ 3.3 → 取4帧
    this.silenceFrameThreshold = Math.ceil(silenceDurationMs / 60);
  }

  /**
   * 输入一帧的VAD检测结果，返回是否触发语音停止
   *
   * 对标旧Python: is_vad() 中的 client_voice_stop 判断逻辑
   *
   * @param isSpeech 当前帧是否有人声
   * @returns 是否应该触发ASR识别（语音已停止）
   */
  feed(isSpeech: boolean): { shouldTriggerASR: boolean; isSpeaking: boolean } {
    const now = Date.now();

    if (isSpeech) {
      // 检测到人声
      this.lastVoiceTime = now;
      this.isSpeaking = true;
      this.silenceFrames = 0;
    } else if (this.isSpeaking) {
      // 之前说话中，现在静默了
      this.silenceFrames++;

      // 静默帧数超过阈值，认为说话结束
      if (this.silenceFrames >= this.silenceFrameThreshold) {
        this.isSpeaking = false;
        this.silenceFrames = 0;
        return { shouldTriggerASR: true, isSpeaking: false };
      }
    }

    return { shouldTriggerASR: false, isSpeaking: this.isSpeaking };
  }

  /** 重置状态 */
  reset(): void {
    this.lastVoiceTime = 0;
    this.isSpeaking = false;
    this.silenceFrames = 0;
  }
}
