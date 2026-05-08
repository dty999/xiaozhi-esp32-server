/**
 * ============================================================
 * 新闻获取插件
 * 对标旧Python: plugins_func/functions/get_news_from_newsnow.py
 *
 * 获取最新的新闻资讯
 * ============================================================
 */

import type { ToolFunction, ToolResult } from '../func-handler';

export const handleGetNews: ToolFunction = async (
  args: Record<string, any>,
  _context,
): Promise<ToolResult> => {
  const category = (args.category as string) || 'general';
  const count = Math.min(Math.max((args.count as number) || 5, 1), 10);

  // 注：完整的新闻API需要接入具体的数据源（如NewsNow、NewsAPI等）
  // 此处提供一个模拟实现，展示工具调用返回格式
  // 生产环境需对接真实的新闻API

  try {
    // 使用公开可用的新闻API（如需API Key请配置环境变量 NEWS_API_KEY）
    const apiKey = process.env.NEWS_API_KEY || '';
    let url: string;

    if (apiKey) {
      // 使用 NewsAPI.org（免费额度：100 req/day）
      url = `https://newsapi.org/v2/top-headlines?country=cn&category=${category}&pageSize=${count}&apiKey=${apiKey}`;
    } else {
      // 无API Key时返回提示
      return {
        success: false,
        result: '新闻服务需要配置API Key（NEWS_API_KEY环境变量），请管理员配置后重试',
      };
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        result: `获取新闻失败，请稍后再试`,
      };
    }

    const data = await response.json();
    const articles = data.articles?.slice(0, count) || [];

    if (articles.length === 0) {
      return {
        success: true,
        result: `暂无${category === 'general' ? '最新' : category}新闻。`,
      };
    }

    const newsText = articles
      .map((a: any, i: number) => `${i + 1}. ${a.title}`)
      .join('；');

    return {
      success: true,
      result: `以下是${category === 'general' ? '最新' : category}新闻：${newsText}`,
    };
  } catch (e: any) {
    console.error(`[get_news] 查询失败: ${e.message}`);
    return {
      success: false,
      result: '获取新闻时网络异常，请稍后再试',
    };
  }
};
