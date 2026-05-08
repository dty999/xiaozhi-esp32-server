'use client';
import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function ServerPage() {
  const { token } = useAuthStore();
  const [servers, setServers] = useState<any[]>([]);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try { const res = await ofetch('/api/server/list', { headers: authHeaders }); if (res.code === 0) setServers(res.data); } catch { /* */ }
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Server size={24} />服务端管理
      </h1>
      <div className="space-y-3">
        {servers.map(s => (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant={s.status === 'running' ? 'default' : 'secondary'}>
                    {s.status === 'running' ? <Wifi size={12} className="mr-1" /> : <WifiOff size={12} className="mr-1" />}
                    {s.status === 'running' ? '运行中' : '已停止'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.type.toUpperCase()} · {s.address}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {servers.length === 0 && <p className="text-muted-foreground text-sm">暂无服务端信息</p>}
      </div>
    </div>
  );
}
