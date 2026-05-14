/**
 * RAGFlow HTTP API 客户端
 *
 * 对标 Java RAGFlowClient — 封装 RAGFlow 知识库 REST API 调用。
 * 所有方法通过 HTTP 与 RAGFlow 服务交互，统一鉴权与错误处理。
 *
 * 支持的 API：
 *   - 知识库 CRUD
 *   - 文档上传 / 删除
 *   - 文档解析 / 切块
 *   - 切片查询
 *   - 召回测试
 *
 * @module lib/ragflow-client
 */

export class RAGFlowClient {
  /**
   * @param baseUrl RAGFlow 服务基地址，如 http://localhost:9380
   * @param apiKey  RAGFlow API Key
   */
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  /**
   * 统一 HTTP 请求封装
   * @param path     API 路径（如 /api/v1/datasets）
   * @param options   fetch 选项（method, body, headers 等）
   * @returns        解析后的 JSON 响应
   */
  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`RAGFlow API error: ${res.status} — ${errorText}`);
    }

    return res.json();
  }

  // ===================== 知识库管理 =====================

  /**
   * 创建知识库
   * @param name        知识库名称
   * @param description 描述（可选）
   */
  async createDataset(name: string, description?: string): Promise<any> {
    return this.request('/api/v1/datasets', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  /**
   * 删除知识库
   * @param datasetId 知识库 ID
   */
  async deleteDataset(datasetId: string): Promise<any> {
    return this.request(`/api/v1/datasets/${datasetId}`, {
      method: 'DELETE',
    });
  }

  async updateDataset(datasetId: string, data: { name?: string; description?: string }): Promise<any> {
    return this.request(`/api/v1/datasets/${datasetId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ===================== 文档管理 =====================

  /**
   * 上传文档至知识库
   * @param datasetId 知识库 ID
   * @param file      文件对象（File / Blob）
   */
  async uploadDocument(datasetId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/api/v1/datasets/${datasetId}/documents`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`RAGFlow upload error: ${res.status} — ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * 查询文档状态
   * @param datasetId  知识库 ID
   * @param documentId 文档 ID
   */
  async getDocumentStatus(datasetId: string, documentId: string): Promise<any> {
    return this.request(
      `/api/v1/datasets/${datasetId}/documents/${documentId}`
    );
  }

  /**
   * 删除文档
   * @param datasetId  知识库 ID
   * @param documentId 文档 ID
   */
  async deleteDocument(datasetId: string, documentId: string): Promise<any> {
    return this.request(
      `/api/v1/datasets/${datasetId}/documents/${documentId}`,
      { method: 'DELETE' }
    );
  }

  // ===================== 解析与切片 =====================

  /**
   * 解析文档（触发切块处理）
   * @param datasetId    知识库 ID
   * @param documentId   文档 ID 或文档 ID 数组（批量解析）
   */
  async parseDocument(datasetId: string, documentId: string | string[]): Promise<any> {
    const ids = Array.isArray(documentId) ? documentId : [documentId];
    return this.request(`/api/v1/datasets/${datasetId}/chunks`, {
      method: 'POST',
      body: JSON.stringify({ document_ids: ids }),
    });
  }

  /**
   * 查询文档切片列表
   * @param datasetId  知识库 ID
   * @param documentId 文档 ID
   * @param page       页码（从 1 开始）
   * @param pageSize   每页条数
   * @param keywords   搜索关键词（可选）
   */
  async listChunks(
    datasetId: string,
    documentId: string,
    page: number = 1,
    pageSize: number = 20,
    keywords?: string
  ): Promise<any> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (keywords) params.set('keywords', keywords);

    return this.request(
      `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks?${params}`
    );
  }

  // ===================== 召回测试 =====================

  /**
   * 知识库召回测试
   * @param datasetId 知识库 ID
   * @param query     检索词
   * @param topK      返回条数（默认 5）
   */
  async retrievalTest(
    datasetId: string | string[],
    query: string,
    topK: number = 5
  ): Promise<any> {
    const datasetIds = Array.isArray(datasetId) ? datasetId : [datasetId];
    return this.request(`/api/v1/datasets/${datasetIds[0]}/retrieval`, {
      method: 'POST',
      body: JSON.stringify({
        question: query,
        top_k: topK,
        dataset_ids: datasetIds,
      }),
    });
  }
}
