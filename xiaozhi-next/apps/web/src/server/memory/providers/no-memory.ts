/**
 * ============================================================
 * 空记忆提供者 — 不存储任何记忆
 * 对标旧Python: Memory nomem 模式
 * ============================================================
 */

import type { MemoryProvider, ChatMessage } from '../../types';

export class NoMemoryProvider implements MemoryProvider {
  readonly name = 'NoMemory';

  async queryMemory(_query: string): Promise<string> {
    return '';
  }

  async saveMemory(_dialogue: ChatMessage[], _sessionId: string): Promise<void> {
    // 不执行任何操作
  }
}
