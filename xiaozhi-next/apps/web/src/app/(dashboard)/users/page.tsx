'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function UsersPage() {
  return (
    <DataTablePage
      title="用户管理"
      apiBase="/api/admin/users"
      columns={[
        { key: 'username', label: '用户名' },
        { key: 'mobile', label: '手机号' },
        { key: 'email', label: '邮箱' },
        { key: 'status', label: '状态', render: (v) => v === 1 ? '启用' : '禁用' },
      ]}
      searchPlaceholder="搜索手机号..."
    />
  );
}
