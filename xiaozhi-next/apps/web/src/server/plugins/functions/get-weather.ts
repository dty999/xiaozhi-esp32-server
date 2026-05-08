/**
 * ============================================================
 * 天气查询插件
 * 对标旧Python: plugins_func/functions/get_weather.py
 *
 * 查询指定城市的当前天气信息
 * 使用 wttr.in 免费天气API（无需API Key）
 * ============================================================
 */

import type { ToolFunction, ToolResult } from '../func-handler';

/**
 * 天气查询处理函数
 *
 * @param args 参数 { city: string }
 * @param context 工具上下文
 * @returns 天气信息文本
 */
export const handleGetWeather: ToolFunction = async (
  args: Record<string, any>,
  context,
): Promise<ToolResult> => {
  const city = args.city as string;
  if (!city) {
    return { success: false, action: 'error', result: '请提供要查询的城市名称' };
  }

  try {
    // 使用 wttr.in 免费天气API
    // 格式: ?format=j1 返回JSON
    // 使用 ofetch 或原生 fetch
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'XiaoZhi/1.0' },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    if (!response.ok) {
      return {
        success: false, action: 'error',
        result: `获取 ${city} 的天气信息失败，请稍后再试`,
      };
    }

    const data = await response.json();
    const current = data.current_condition?.[0];
    if (!current) {
      return {
        success: false,
        result: `未找到城市"${city}"的天气信息，请检查城市名称是否正确`,
      };
    }

    // 构建天气播报文本
    const temp = current.temp_C;
    const humidity = current.humidity;
    const weatherDesc = current.weatherDesc?.[0]?.value || '未知';
    const windSpeed = current.windspeedKmph;
    const windDir = current.winddir16Point;
    const visibility = current.visibility;
    const feelsLike = current.FeelsLikeC;
    const uvIndex = current.uvIndex;

    const weatherText = [
      `${city}当前天气：${weatherDesc}`,
      `温度${temp}°C（体感${feelsLike}°C）`,
      humidity ? `湿度${humidity}%` : '',
      windSpeed ? `风力${windDir || ''} ${windSpeed}km/h` : '',
      visibility ? `能见度${visibility}km` : '',
      uvIndex ? `紫外线指数${uvIndex}` : '',
    ]
      .filter(Boolean)
      .join('，');

    return {
      success: true,
      action: 'response',
      result: `${weatherText}。`,
    };
  } catch (e: any) {
    console.error(`[get_weather] 查询失败: ${e.message}`);
    return {
      success: false,
      result: `获取 ${city} 的天气信息时网络异常，请稍后再试`,
    };
  }
};
