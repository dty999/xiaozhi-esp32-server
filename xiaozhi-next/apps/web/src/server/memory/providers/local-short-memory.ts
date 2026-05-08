/**
 * ============================================================
 * 本地短期记忆提供者 — LLM 总结 + 内存缓存
 * 对标旧Python: core/providers/memory/mem_local_short/
 *
 * 策略：
 * 1. 维护一个简短的记忆摘要字符串
 * 2. 每次对话结束后，调用 LLM 提取关键记忆并更新摘要
 * 3. 记忆存储在内存 Map 中，按 sessionId 索引
 * 4. 支持 Redis 持久化（可选）
 * ============================================================
 */

import type { MemoryProvider, ChatMessage } from '../../types';

/** 记忆条目 */
interface MemoryEntry {
  /** 最终摘要 */
  summary: string;
  /** 最后更新时间 */
  updatedAt: number;
  /** 累计轮数 */
  turnCount: number;
}

/**
 * LocalShortMemoryProvider
 *
 * 对标旧Python: mem_local_short 模式
 * 使用 LLM 提取对话关键信息，压缩为简短记忆摘要
 */
export class LocalShortMemoryProvider implements MemoryProvider {
  readonly name = 'LocalShortMemory';

  /** 默认 LLM 地址（可配置） */
  private llmApiUrl: string;
  private llmApiKey: string;
  private llmModel: string;

  /** 内存存储: sessionId → MemoryEntry */
  private static memoryStore = new Map<string, MemoryEntry>();

  /** 触发总结的最少对话轮数 */
  private static readonly MIN_TURNS_FOR_SUMMARY = 3;
  /** 最多保留轮数 */
  private static readonly MAX_TURNS = 50;

  constructor(config?: { api_url?: string; api_key?: string; llm?: string }) {
    this.llmApiUrl = config?.api_url || process.env.LLM_API_URL || 'https://api.openai.com';
    this.llmApiKey = config?.api_key || process.env.LLM_API_KEY || '';
    this.llmModel = config?.llm || process.env.LLM_MODEL || 'gpt-4o-mini';
  }

  /**
   * 查询记忆
   *
   * 对标旧Python: query_memory()
   *
   * @param query 用户当前的输入
   * @returns 相关记忆文本
   */
  async queryMemory(query: string): Promise<string> {
    const keys: string[] = [];
    // 查找所有与本设备相关的记忆 key（按 sessionId 前缀匹配）
    // 简化实现：返回最新的记忆
    let latestEntry: MemoryEntry | null = null;
    let latestTime = 0;

    for (const [, entry] of LocalShortMemoryProvider.memoryStore) {
      if (entry.updatedAt > latestTime) {
        latestEntry = entry;
        latestTime = entry.updatedAt;
      }
    }

    if (!latestEntry || !latestEntry.summary) return '';
    return latestEntry.summary;
  }

  /**
   * 保存记忆（异步 LLM 总结）
   *
   * 对标旧Python: save_memory()
   */
  async saveMemory(dialogue: ChatMessage[], sessionId: string): Promise<void> {
    if (!dialogue || dialogue.length === 0) return;

    // 仅取实际对话（排除临时消息）
    const realMessages = dialogue.filter((m) => !m.is_temporary);
    if (realMessages.length < 2) return;

    // 获取或创建记忆条目
    let entry = LocalShortMemoryProvider.memoryStore.get(sessionId);
    if (!entry) {
      entry = { summary: '', updatedAt: Date.now(), turnCount: 0 };
      LocalShortMemoryProvider.memoryStore.set(sessionId, entry);
    }

    entry.turnCount++;
    entry.updatedAt = Date.now();

    // 每 5 轮总结一次
    if (entry.turnCount % LocalShortMemoryProvider.MIN_TURNS_FOR_SUMMARY !== 0) return;

    // 构建总结 prompt
    const conversationText = realMessages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .slice(-10) // 只取最近10条消息
      .join('\n');

    const summaryPrompt = [
      '你是一个对话记忆摘要助手。请根据以下对话内容，用一段简洁的摘要提取关键信息。',
      '格式要求：',
      '1. 用第三人称描述',
      '2. 保留用户的重要偏好、需求和事实',
      '3. 不超过200字',
      '4. 如果此前已有记忆摘要，请与新信息合并',
      '',
      entry.summary ? `现有记忆摘要：${entry.summary}` : '',
      '',
      `最近的对话：\n${conversationText}`,
    ].join('\n');

    try {
      const response = await fetch(`${this.llmApiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.llmApiKey}`,
        },
        body: JSON.stringify({
          model: this.llmModel,
          messages: [
            { role: 'system', content: '你是简洁高效的记忆摘要助手。' },
            { role: 'user', content: summaryPrompt },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content?.trim();
        if (summary) {
          entry.summary = summary;
          console.log(`[Memory] 记忆已更新 (session=${sessionId}, turns=${entry.turnCount})`);
        }
      }
    } catch (e: any) {
      console.error(`[Memory] LLM记忆总结失败: ${e.message}`);
    }
  }

  /**
   * 清理过期记忆（超过 24 小时未更新）
   */
  static cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 小时
    for (const [key, entry] of LocalShortMemoryProvider.memoryStore) {
      if (now - entry.updatedAt > maxAge) {
        LocalShortMemoryProvider.memoryStore.delete(key);
      }
    }
  }
}
