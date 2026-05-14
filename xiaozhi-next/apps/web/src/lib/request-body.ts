import { NextRequest } from 'next/server';

/**
 * 安全解析请求体 JSON，遇格式错误则返回 null
 * 避免 request.json() 抛出 SyntaxError 导致 500
 */
export async function safeParseBody(request: NextRequest): Promise<Record<string, any> | null> {
  try {
    const body = await request.json();
    return body;
  } catch {
    return null;
  }
}
