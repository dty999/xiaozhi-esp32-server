'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function TimbrePage() {
  return (
    <DataTablePage
      title="音色管理"
      apiBase="/api/timbre"
      columns={[
        { key: 'name', label: '音色名称' },
        { key: 'languages', label: '语言' },
        { key: 'remark', label: '备注' },
        { key: 'sort', label: '排序' },
      ]}
      formFields={[
        { key: 'name', label: '音色名称' },
        { key: 'languages', label: '语言' },
        { key: 'ttsModelId', label: 'TTS模型ID' },
      ]}
    />
  );
}
