'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function TemplatesPage() {
  return (
    <DataTablePage
      title="模板管理"
      apiBase="/api/templates"
      columns={[
        { key: 'agentName', label: '模板名称' },
        { key: 'agentCode', label: '编码' },
        { key: 'sort', label: '排序' },
      ]}
      formFields={[
        { key: 'agentName', label: '模板名称' },
        { key: 'agentCode', label: '编码' },
      ]}
    />
  );
}
