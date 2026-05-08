'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function ReplacementPage() {
  return (
    <DataTablePage
      title="替换词管理"
      apiBase="/api/correct-word/files"
      columns={[
        { key: 'fileName', label: '文件名' },
        { key: 'wordCount', label: '词条数' },
      ]}
      formFields={[
        { key: 'fileName', label: '文件名' },
        { key: 'content', label: '内容', type: 'textarea' },
      ]}
    />
  );
}
