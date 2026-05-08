/**
 * ============================================================
 * 时间查询插件
 * 对标旧Python: plugins_func/functions/get_time.py
 *
 * 获取当前日期和时间信息
 * ============================================================
 */

import type { ToolFunction, ToolResult } from '../func-handler';

export const handleGetTime: ToolFunction = async (
  args: Record<string, any>,
  _context,
): Promise<ToolResult> => {
  const timezone = (args.timezone as string) || 'Asia/Shanghai';

  try {
    const now = new Date();

    // 使用 Intl.DateTimeFormat 格式化时间
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const timeStr = formatter.format(now);

    return {
      success: true,
      result: `现在是${timeStr}。`,
    };
  } catch {
    // 如果时区无效，降级为系统时间
    const now = new Date();
    const str = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ` +
      `${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]} ` +
      `星期${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    return {
      success: true,
      result: `现在是${str}。`,
    };
  }
};
