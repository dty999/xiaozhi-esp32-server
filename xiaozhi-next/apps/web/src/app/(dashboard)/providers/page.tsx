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
        { key: 'name', label: '名称' },
        { key: 'modelType', label: '模型类型' },
        { key: 'providerCode', label: '供应商编码' },
      ]}
    />
  );
}
