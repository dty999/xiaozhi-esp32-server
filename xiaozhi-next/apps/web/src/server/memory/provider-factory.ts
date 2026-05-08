/**
 * ============================================================
 * Memory 提供者工厂
 *
 * 根据配置创建对应的 Memory 提供者实例
 * ============================================================
 */

import type { MemoryProvider, MemoryConfig } from '../types';
import { NoMemoryProvider } from './providers/no-memory';
import { LocalShortMemoryProvider } from './providers/local-short-memory';

/**
 * Memory提供者工厂
 */
export async function createMemoryProvider(config: MemoryConfig): Promise<MemoryProvider> {
  const type = (config.type || 'nomem').toLowerCase();

  switch (type) {
    case 'nomem':
    case 'mem_report_only':
      // 不使用记忆功能
      return new NoMemoryProvider();

    case 'mem_local_short':
      // 本地短期记忆（LLM总结 + 内存缓存）
      console.log(`[Memory] 使用本地短期记忆`);
      return new LocalShortMemoryProvider({
        api_url: config.api_url,
        api_key: config.api_key,
        llm: config.llm,
      });

    case 'mem0ai':
      // Mem0 AI 云端记忆
      console.warn(`[Memory] Mem0AI暂未实现，使用本地短期记忆`);
      return new LocalShortMemoryProvider({
        api_url: config.api_url,
        api_key: config.api_key,
        llm: config.llm,
      });

    case 'powermem':
      // PowerMem（SQLite + LLM）
      console.warn(`[Memory] PowerMem暂未实现，使用本地短期记忆`);
      return new LocalShortMemoryProvider({
        api_url: config.api_url,
        api_key: config.api_key,
        llm: config.llm,
      });

    default:
      return new NoMemoryProvider();
  }
}
