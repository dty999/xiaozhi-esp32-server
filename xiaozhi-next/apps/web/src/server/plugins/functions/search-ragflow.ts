import type { ToolResult } from '../func-handler';

export async function handleRAGSearch(
  args: Record<string, any>,
  _context: Record<string, any>,
): Promise<ToolResult> {
  const query = args.query || args.question || '';
  const dataset = args.dataset || '';

  if (!query) {
    return {
      success: false,
      result: '请提供搜索查询内容。',
    };
  }

  const ragflowApiUrl = process.env.RAGFLOW_API_URL;
  const ragflowApiKey = process.env.RAGFLOW_API_KEY;

  if (!ragflowApiUrl || !ragflowApiKey) {
    return {
      success: false,
      result: 'RAGFlow 服务未配置，无法进行知识库搜索。',
    };
  }

  try {
    const response = await fetch(`${ragflowApiUrl}/api/v1/retrieval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ragflowApiKey}`,
      },
      body: JSON.stringify({
        question: query,
        dataset_ids: dataset ? [dataset] : undefined,
        top_k: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        result: `知识库搜索失败：HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const chunks = data?.data?.chunks || data?.data || [];

    if (Array.isArray(chunks) && chunks.length > 0) {
      const results = chunks
        .slice(0, 5)
        .map((chunk: any) => chunk.content || chunk.text || '')
        .filter(Boolean)
        .join('\n\n');

      return {
        success: true,
        result: results || '未找到相关内容。',
        needsLLMResponse: true,
      };
    }

    return {
      success: true,
      result: '未找到与查询相关的知识内容。',
      needsLLMResponse: true,
    };
  } catch (e: any) {
    return {
      success: false,
      result: `知识库搜索出错：${e.message}`,
    };
  }
}
