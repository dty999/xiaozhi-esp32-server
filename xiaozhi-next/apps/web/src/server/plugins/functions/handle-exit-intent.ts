/**
 * ============================================================
 * 退出/结束对话插件
 * 对标旧Python: plugins_func/functions/handle_exit_intent.py
 *
 * 处理用户退出对话的意图
 * ============================================================
 */

import type { ToolFunction, ToolResult } from '../func-handler';

export const handleExitIntent: ToolFunction = async (
  args: Record<string, any>,
  _context,
): Promise<ToolResult> => {
  const goodbye = (args.say_goodbye as string) || '好的，再见！';

  return {
    success: true,
    result: '退出意图已处理',
    exit: true,
    goodbyeMessage: goodbye,
    needsLLMResponse: false,
  };
};
