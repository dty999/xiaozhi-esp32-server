/**
 * ============================================================
 * 空意图识别 — 始终继续聊天
 * 对标旧Python: Intent nointent 模式
 * ============================================================
 */

import type { IntentProvider, IntentResult, ChatMessage } from '../../types';

export class NoIntentProvider implements IntentProvider {
  readonly name = 'NoIntent';

  async detect(_text: string, _context?: ChatMessage[]): Promise<IntentResult> {
    return { exit: false };
  }
}
