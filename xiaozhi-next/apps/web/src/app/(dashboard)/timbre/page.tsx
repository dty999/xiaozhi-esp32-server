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
        { key: 'name', label: '音色名称', placeholder: '请输入音色名称' },
        { key: 'languages', label: '语言', placeholder: '如 zh-CN, en-US' },
        { key: 'ttsModelId', label: 'TTS模型ID', type: 'number', valueType: 'number', placeholder: '请输入TTS模型ID' },
        { key: 'sort', label: '排序', type: 'number', valueType: 'number', placeholder: '数值越小越靠前' },
        { key: 'remark', label: '备注', type: 'textarea', placeholder: '请输入备注信息' },
      ]}
    />
  );
}
