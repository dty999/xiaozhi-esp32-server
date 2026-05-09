'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function ProvidersPage() {
  return (
    <DataTablePage
      title="供应器管理"
      apiBase="/api/models/providers"
      columns={[
        { key: 'name', label: '名称' },
        { key: 'modelType', label: '模型类型' },
        { key: 'providerCode', label: '供应商编码' },
        { key: 'sort', label: '排序' },
      ]}
      formFields={[
        { key: 'name', label: '名称', placeholder: '请输入供应器名称' },
        { key: 'modelType', label: '模型类型', placeholder: '如 ASR, LLM, TTS' },
        { key: 'providerCode', label: '供应商编码', placeholder: '如 openai, doubao' },
        { key: 'sort', label: '排序', type: 'number', valueType: 'number', placeholder: '数值越小越靠前' },
        { key: 'fields', label: '字段定义(JSON)', type: 'textarea', placeholder: '{"api_key": {...}, "voice": {...}}' },
      ]}
    />
  );
}
