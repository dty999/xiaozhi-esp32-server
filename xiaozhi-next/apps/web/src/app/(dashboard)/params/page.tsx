'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function ParamsPage() {
  return (
    <DataTablePage
      title="参数管理"
      apiBase="/api/admin/params"
      columns={[
        { key: 'paramCode', label: '参数编码' },
        { key: 'paramValue', label: '参数值', render: (v) => v?.length > 50 ? v.slice(0, 50) + '...' : v },
        { key: 'remark', label: '备注' },
      ]}
      formFields={[
        { key: 'paramCode', label: '参数编码' },
        { key: 'paramValue', label: '参数值', type: 'textarea' },
        { key: 'remark', label: '备注' },
      ]}
    />
  );
}
