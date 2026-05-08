'use client';
import { DataTablePage } from '@/components/features/DataTablePage';
import { Badge } from '@/components/ui/badge';

export default function VoiceClonePage() {
  return (
    <DataTablePage
      title="声音克隆"
      apiBase="/api/voice-clone"
      columns={[
        { key: 'name', label: '名称' },
        { key: 'voiceId', label: '声音ID' },
        { key: 'trainStatus', label: '训练状态', render: (v) => {
          const map: Record<number, string> = { 0: '未训练', 1: '训练中', 2: '已完成' };
          return <Badge variant={v === 2 ? 'default' : 'secondary'}>{map[v] || v}</Badge>;
        }},
      ]}
      formFields={[
        { key: 'name', label: '名称' },
        { key: 'modelId', label: '模型ID' },
      ]}
    />
  );
}
