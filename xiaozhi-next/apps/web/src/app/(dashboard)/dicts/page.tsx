'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function DictsPage() {
  return (
    <DataTablePage
      title="字典管理"
      apiBase="/api/admin/dict/types"
      columns={[
        { key: 'dictType', label: '字典类型' },
        { key: 'dictName', label: '字典名称' },
        { key: 'remark', label: '备注' },
        { key: 'sort', label: '排序' },
      ]}
      formFields={[
        { key: 'dictType', label: '字典类型' },
        { key: 'dictName', label: '字典名称' },
        { key: 'remark', label: '备注' },
      ]}
    />
  );
}
