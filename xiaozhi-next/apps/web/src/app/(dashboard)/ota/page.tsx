'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function OtaPage() {
  return (
    <DataTablePage
      title="OTA 固件管理"
      apiBase="/api/ota/mag"
      columns={[
        { key: 'firmwareName', label: '固件名称' },
        { key: 'version', label: '版本' },
        { key: 'type', label: '类型' },
        { key: 'fileSize', label: '大小', render: (v) => v ? `${(Number(v) / 1024).toFixed(1)} KB` : '-' },
        { key: 'md5', label: 'MD5' },
      ]}
      formFields={[
        { key: 'firmwareName', label: '固件名称' },
        { key: 'version', label: '版本号' },
        { key: 'type', label: '类型' },
      ]}
    />
  );
}
