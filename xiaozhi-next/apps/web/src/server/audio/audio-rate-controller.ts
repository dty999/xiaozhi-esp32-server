/**
 * ============================================================
 * 音频速率控制器 — 精确流量控制
 * 对标旧Python: core/utils/audioRateController.py
 *
 * 职责：
 * 1. 按帧长（默认60ms）定时发送音频包，避免网络拥塞
 * 2. 预缓冲前N帧直接发送，降低首字延迟
 * 3. 支持动态流控与固定延迟两种模式
 * 4. 每句独立重置计数器，防止跨句干扰
 * ============================================================
 */

/**
 * 音频包元数据
 */
interface AudioPacket {
  /** Opus音频数据 */
  data: Buffer;
  /** 入队时间戳 */
  timestamp: number;
}

/**
 * 流控状态（每个连接独立维护）
 * 对标旧Python: conn.audio_flow_control
 */
export interface FlowControlState {
  /** 已发送包计数 */
  packetCount: number;
  /** 包序列号 */
  sequence: number;
  /** 当前句子ID（用于检测句子切换） */
  sentenceId: string;
}

/**
 * 音频速率控制器
 *
 * 对标旧Python: AudioRateController 类
 *
 * 核心机制：
 * - 维护一个音频包队列
 * - 后台异步循环按帧长间隔发送
 * - 前N帧直接发送（预缓冲），之后进入动态流控
 */
export class AudioRateController {
  /** 音频包队列 */
  private queue: AudioPacket[] = [];
  /** 帧时长（毫秒），默认60ms */
  readonly frameDuration: number;
  /** 预缓冲包数（直接发送以降低延迟） */
  private readonly preBufferCount: number = 5;
  /** 队列清空事件 */
  private queueEmptyResolve: (() => void) | null = null;
  /** 队列清空 Promise */
  private _queueEmptyPromise: Promise<void> | null = null;
  /** 后台发送任务 */
  private sendTask: Promise<void> | null = null;
  /** 是否已停止 */
  private stopped = false;
  /** 发送回调 */
  private sendCallback: ((packet: Buffer) => Promise<void>) | null = null;

  constructor(frameDuration: number = 60) {
    this.frameDuration = frameDuration;
  }

  /**
   * 启动后台发送循环
   * 对标旧Python: start_sending(send_callback)
   */
  startSending(sendCallback: (packet: Buffer) => Promise<void>): void {
    this.sendCallback = sendCallback;
    this.stopped = false;
    this.sendTask = this._sendLoop();
  }

  /**
   * 停止后台发送循环
   * 对标旧Python: stop_sending()
   */
  stopSending(): void {
    this.stopped = true;
  }

  /**
   * 重置控制器（清空队列、取消任务）
   * 对标旧Python: reset()
   */
  reset(): void {
    this.stopped = true;
    this.queue = [];
    this._queueEmptyPromise = null;
    this.queueEmptyResolve = null;
    this.sendTask = null;
    this.sendCallback = null;
  }

  /**
   * 添加音频包到队列（动态流控模式）
   * 对标旧Python: add_audio(packet)
   */
  addAudio(packet: Buffer): void {
    this.queue.push({ data: packet, timestamp: Date.now() });
    // 创建新的清空Promise
    if (!this._queueEmptyPromise) {
      this._queueEmptyPromise = new Promise<void>((resolve) => {
        this.queueEmptyResolve = resolve;
      });
    }
  }

  /**
   * 添加消息发送任务（用于混入JSON消息）
   * 对标旧Python: add_message(lambda)
   */
  addMessage(fn: () => Promise<void>): void {
    // 将函数包装为特殊包
    (this.queue as any).push({ __fn: fn });
  }

  /**
   * 获取队列清空Promise（等待所有包发送完成）
   * 对标旧Python: queue_empty_event
   */
  get queueEmptyPromise(): Promise<void> {
    return this._queueEmptyPromise || Promise.resolve();
  }

  /**
   * 获取队列大小
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * 后台发送循环
   * 对标旧Python: start_sending 中的 async 循环
   */
  private async _sendLoop(): Promise<void> {
    while (!this.stopped) {
      // 非阻塞地获取下一个包
      const packet = this.queue.shift();

      if (packet) {
        // 特殊消息（addMessage注入的函数）
        if ((packet as any).__fn) {
          try {
            await (packet as any).__fn();
          } catch (e) {
            console.error('[AudioRate] 消息发送失败:', e);
          }
        } else if (this.sendCallback) {
          try {
            await this.sendCallback(packet.data);
          } catch (e) {
            console.error('[AudioRate] 音频发送失败:', e);
          }
        }
      }

      // 检查队列是否清空
      if (this.queue.length === 0 && this.queueEmptyResolve) {
        this.queueEmptyResolve();
        this._queueEmptyPromise = null;
        this.queueEmptyResolve = null;
      }

      // 按帧长间隔等待
      await this._sleep(this.frameDuration);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 音频流控辅助函数
 *
 * 对标旧Python: sendAudio() + _send_audio_with_rate_control()
 *
 * @returns 预缓冲帧数
 */
export const PRE_BUFFER_COUNT = 5;

/**
 * 创建或获取AudioRateController，处理句子切换时的重置
 * 对标旧Python: _get_or_create_rate_controller()
 */
export function ensureRateController(
  connState: { rateController?: AudioRateController; flowControl?: FlowControlState },
  frameDuration: number,
  sentenceId: string,
): AudioRateController {
  let needReset = false;

  if (!connState.rateController) {
    needReset = true;
  } else if (
    connState.flowControl?.sentenceId !== sentenceId
  ) {
    needReset = true;
  }

  if (needReset || !connState.rateController) {
    if (connState.rateController) {
      connState.rateController.reset();
    }
    connState.rateController = new AudioRateController(frameDuration);
    connState.flowControl = {
      packetCount: 0,
      sequence: 0,
      sentenceId,
    };
  }

  return connState.rateController;
}
