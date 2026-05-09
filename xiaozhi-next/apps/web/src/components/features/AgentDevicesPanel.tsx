'use client';
/**
 * 设备管理面板 — 嵌入智能体编辑页 Tab
 *
 * 从原 /agents/[id]/devices/page.tsx 抽取为内联组件。
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Unlink } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface Device {
  id: string;
  macAddress: string;
  alias: string | null;
  board: string | null;
  appVersion: string | null;
  lastConnectedAt: string | null;
}

export function AgentDevicesPanel({ agentId }: { agentId: string }) {
  const { token } = useAuthStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [bindCode, setBindCode] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchDevices = async () => {
    try {
      const res = await ofetch(`/api/devices/bind/${agentId}`, { headers: authHeaders });
      if (res.code === 0) setDevices(res.data || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchDevices(); }, [agentId]);

  const handleBind = async () => {
    if (!bindCode) return;
    try {
      const res = await ofetch(`/api/devices/bind/${agentId}/${bindCode}`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (res.code === 0) { setBindCode(''); fetchDevices(); }
      else alert(res.msg);
    } catch { /* 容错 */ }
  };

  const handleUnbind = async (deviceId: string) => {
    if (!confirm('确定解绑此设备？')) return;
    try {
      await ofetch('/api/devices/unbind', {
        method: 'POST',
        body: { deviceId },
        headers: authHeaders,
      });
      fetchDevices();
    } catch { /* 容错 */ }
  };

  return (
    <div>
      {/* 绑定新设备 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">绑定新设备</p>
          <div className="flex gap-2">
            <Input
              placeholder="输入设备6位激活码"
              value={bindCode}
              onChange={(e) => setBindCode(e.target.value)}
              className="max-w-xs"
              maxLength={6}
            />
            <Button onClick={handleBind} disabled={bindCode.length !== 6}>
              <Plus size={14} className="mr-1" />绑定
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            在 ESP32 设备上进入配网模式获取6位激活码
          </p>
        </CardContent>
      </Card>

      {/* 设备列表 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : devices.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无绑定设备</p>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium font-mono">{d.macAddress}</span>
                    {d.alias && <Badge variant="secondary">{d.alias}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-x-4">
                    {d.board && <span>型号: {d.board}</span>}
                    {d.appVersion && <span>版本: {d.appVersion}</span>}
                    {d.lastConnectedAt && (
                      <span>最近连接: {new Date(d.lastConnectedAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleUnbind(d.id)}
                >
                  <Unlink size={14} className="mr-1" />解绑
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
