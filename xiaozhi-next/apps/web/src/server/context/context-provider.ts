/**
 * ============================================================
 * 上下文提供者 — 动态上下文注入
 * 对标旧Python: core/utils/context_provider.py
 *
 * 职责：
 * 1. 构建每次发送给 LLM 的动态上下文信息
 * 2. 注入时间、日期、用户信息、设备状态等
 * 3. 支持自定义 Provider 注册
 *
 * 设计：
 * ContextProvider 返回一个字符串，该字符串作为 system prompt 的
 * 一部分追加到 LLM 消息中，提供实时上下文信息。
 * ============================================================
 */

/**
 * 单个上下文提供者接口
 */
export interface IContextProvider {
  readonly name: string;
  /** 获取上下文文本 */
  getContext(deviceId: string, sessionId: string): Promise<string>;
}

// ==============================
// 内置 Context Provider
// ==============================

/**
 * 时间上下文 — 注入当前日期时间
 *
 * 对标旧Python: core/utils/current_time.py
 */
export class TimeContextProvider implements IContextProvider {
  readonly name = 'time';

  async getContext(_deviceId: string, _sessionId: string): Promise<string> {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long',
    });
    return `当前时间：${timeStr}`;
  }
}

/**
 * 日期信息上下文 — 农历/节气等
 */
export class DateContextProvider implements IContextProvider {
  readonly name = 'date';

  async getContext(_deviceId: string, _sessionId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[now.getDay()]!;

    return `今天是${year}年${month}月${day}日，${weekday}。`;
  }
}

/**
 * 设备信息上下文 — 注入设备相关元数据
 */
export class DeviceContextProvider implements IContextProvider {
  readonly name = 'device';

  async getContext(deviceId: string, _sessionId: string): Promise<string> {
    return `当前设备ID：${deviceId}`;
  }
}

// ==============================
// Context 提供者注册表
// ==============================

/** 全局已注册的上下文提供者 */
const contextProviders = new Map<string, IContextProvider>();

/**
 * 注册一个上下文提供者
 */
export function registerContextProvider(provider: IContextProvider): void {
  contextProviders.set(provider.name, provider);
  console.log(`[Context] 已注册上下文提供者: ${provider.name}`);
}

/**
 * 初始化所有内置上下文提供者
 */
export function initContextProviders(): void {
  registerContextProvider(new TimeContextProvider());
  registerContextProvider(new DateContextProvider());
  registerContextProvider(new DeviceContextProvider());
}

/**
 * 构建完整的动态上下文文本
 *
 * 对标旧Python: _build_context()
 *
 * @param deviceId 设备ID
 * @param sessionId 会话ID
 * @param enabledProviders 启用的提供者名称列表（逗号分隔字符串）
 * @returns 合并后的上下文文本
 */
export async function buildContext(
  deviceId: string,
  sessionId: string,
  enabledProviders?: string,
): Promise<string> {
  if (!enabledProviders) {
    // 默认启用全部
    enabledProviders = 'time,date,device';
  }

  const providerNames = enabledProviders
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const parts: string[] = [];

  for (const name of providerNames) {
    const provider = contextProviders.get(name);
    if (provider) {
      try {
        const ctx = await provider.getContext(deviceId, sessionId);
        if (ctx) parts.push(ctx);
      } catch {}
    }
  }

  return parts.join('\n');
}

// 自动初始化
initContextProviders();
