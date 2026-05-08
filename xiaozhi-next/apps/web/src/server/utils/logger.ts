/**
 * ============================================================
 * 结构化日志 — 请求追踪与性能监控
 * 对标旧Python: core/config/logger.py (loguru 增强)
 *
 * 职责：
 * 1. 结构化日志输出（JSON 格式便于收集分析）
 * 2. 关键指标埋点（延迟、错误率、并发数）
 * 3. 请求链路追踪（sessionId / deviceId）
 *
 * 环境变量：
 *   LOG_LEVEL=debug|info|warn|error  (默认 info)
 *   LOG_FORMAT=json|pretty           (默认 pretty)
 * ============================================================
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 结构化日志条目 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  deviceId?: string;
  sessionId?: string;
  duration?: number;
  [key: string]: any;
}

/** 请求计时器 */
interface RequestTimer {
  startTime: number;
  deviceId: string;
  sessionId: string;
  label: string;
}

/**
 * StructuredLogger
 *
 * 对标旧Python: loguru.logger
 */
export class StructuredLogger {
  private level: LogLevel;

  /** 活跃的连接数计数 */
  private activeConnections = 0;

  /** 请求计时器 Map */
  private timers = new Map<string, RequestTimer>();

  /** 性能指标累积 */
  private metrics = {
    totalRequests: 0,
    totalErrors: 0,
    totalTTSGenerated: 0,
    totalASRCalls: 0,
    totalLLMCalls: 0,
  };

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.level = (envLevel as LogLevel) || 'info';
  }

  /** 输出日志条目 */
  private _log(entry: LogEntry): void {
    const { module, level, deviceId, sessionId, message, duration, ...rest } = entry;

    const prefix = `[${entry.module}]`;
    const suffix = deviceId ? ` [${deviceId}/${sessionId || '?'}]` : '';
    const durStr = duration !== undefined ? ` (${duration}ms)` : '';

    if (process.env.LOG_FORMAT === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      // 简洁格式
      if (level === 'error') {
        console.error(`${prefix}${suffix} ${message}${durStr}`);
      } else if (level === 'warn') {
        console.warn(`${prefix}${suffix} ${message}${durStr}`);
      } else {
        console.log(`${prefix}${suffix} ${message}${durStr}`);
      }
    }
  }

  // ===== 通用日志 =====

  debug(module: string, message: string, meta?: Record<string, any>): void {
    if (this._shouldLog('debug')) {
      this._log({ timestamp: new Date().toISOString(), level: 'debug', module, message, ...meta });
    }
  }

  info(module: string, message: string, meta?: Record<string, any>): void {
    if (this._shouldLog('info')) {
      this._log({ timestamp: new Date().toISOString(), level: 'info', module, message, ...meta });
    }
  }

  warn(module: string, message: string, meta?: Record<string, any>): void {
    if (this._shouldLog('warn')) {
      this._log({ timestamp: new Date().toISOString(), level: 'warn', module, message, ...meta });
    }
  }

  error(module: string, message: string, meta?: Record<string, any>): void {
    this._log({ timestamp: new Date().toISOString(), level: 'error', module, message, ...meta });
  }

  // ===== 连接生命周期 =====

  /** 连接建立 */
  onConnection(deviceId: string, sessionId: string, clientIp: string): void {
    this.activeConnections++;
    this.info('Connection', `新连接`, { deviceId, sessionId, clientIp, activeConnections: this.activeConnections });
  }

  /** 连接断开 */
  onDisconnect(deviceId: string, sessionId: string): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    this.info('Connection', `断开连接`, { deviceId, sessionId, activeConnections: this.activeConnections });
  }

  // ===== 性能计时 =====

  /** 开始计时 */
  startTimer(id: string, deviceId: string, sessionId: string, label: string): void {
    this.timers.set(id, { startTime: Date.now(), deviceId, sessionId, label });
  }

  /** 结束计时并记录 */
  endTimer(id: string, module: string): number {
    const timer = this.timers.get(id);
    if (!timer) return 0;
    this.timers.delete(id);
    const duration = Date.now() - timer.startTime;
    this.info(module, timer.label, {
      deviceId: timer.deviceId,
      sessionId: timer.sessionId,
      duration,
    });
    return duration;
  }

  // ===== 管道关键指标 =====

  onASRCall(deviceId: string, sessionId: string, textLength: number, duration: number): void {
    this.metrics.totalASRCalls++;
    this.info('ASR', `识别完成`, { deviceId, sessionId, textLength, duration });
  }

  onLLMCall(deviceId: string, sessionId: string, tokenCount: number, duration: number): void {
    this.metrics.totalLLMCalls++;
    this.info('LLM', `生成完成`, { deviceId, sessionId, tokenCount, duration });
  }

  onTTSGenerated(deviceId: string, sessionId: string, textLength: number, duration: number): void {
    this.metrics.totalTTSGenerated++;
    this.info('TTS', `合成完成`, { deviceId, sessionId, textLength, duration });
  }

  onError(deviceId: string, sessionId: string, module: string, error: Error): void {
    this.metrics.totalErrors++;
    this.error(module, `错误: ${error.message}`, { deviceId, sessionId });
  }

  // ===== 监控指标 =====

  getMetrics(): Record<string, any> {
    return {
      ...this.metrics,
      activeConnections: this.activeConnections,
      timestamp: new Date().toISOString(),
    };
  }

  // ===== 辅助 =====

  private _shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

/** 全局单例 */
export const logger = new StructuredLogger();

// 定期输出指标摘要（每 60 秒）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const m = logger.getMetrics();
    if (m.totalRequests > 0 || m.activeConnections > 0) {
      console.log(`[Metrics] 连接:${m.activeConnections} | ASR:${m.totalASRCalls} LLM:${m.totalLLMCalls} TTS:${m.totalTTSGenerated} | 错误:${m.totalErrors}`);
    }
  }, 60000);
}
