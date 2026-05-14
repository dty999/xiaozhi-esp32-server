/**
 * RAGFlow 适配器工厂
 *
 * 对标 Java KnowledgeBaseAdapterFactory — 根据模型配置创建 RAGFlowClient 实例。
 * 从数据库中读取 RAG 模型配置（baseUrl + apiKey），返回封装好的客户端。
 *
 * @module lib/ragflow-factory
 */

import { RAGFlowClient } from './ragflow-client';
import { prisma } from './db';

/**
 * 根据 RAG 模型 ID 创建 RAGFlow 客户端
 *
 * @param modelId 模型配置主键 ID（ai_model_config.id）
 * @returns       RAGFlowClient 实例
 * @throws        Error 当模型配置不存在或缺少必要字段时
 */
export async function createRAGFlowClient(modelId: bigint): Promise<RAGFlowClient> {
  const modelConfig = await prisma.modelConfig.findUnique({
    where: { id: modelId },
  });

  if (!modelConfig) {
    throw new Error('RAGFlow 模型配置不存在');
  }

  const config = modelConfig.configJson as Record<string, any> | null;
  if (!config) {
    throw new Error('RAGFlow 模型配置为空');
  }

  const baseUrl = config.base_url || config.baseUrl;
  const apiKey = config.api_key || config.apiKey;

  if (!baseUrl) {
    throw new Error('RAGFlow 配置缺少 base_url');
  }
  if (!apiKey) {
    throw new Error('RAGFlow 配置缺少 api_key');
  }

  return new RAGFlowClient(baseUrl, apiKey);
}
