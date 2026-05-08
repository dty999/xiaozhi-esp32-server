'use client';
import { DataTablePage } from '@/components/features/DataTablePage';

export default function VoiceResourcePage() {
  return (
    <DataTablePage
      title="音色资源"
      apiBase="/api/voice-resource"
      columns={[
        { key: 'name', label: '名称' },
        { key: 'voiceId', label: '声音ID' },
        { key: 'trainStatus', label: '状态' },
      ]}
    />
  );
}
