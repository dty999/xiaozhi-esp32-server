'use client';
/**
 * 服务端管理页
 *
 * 对标旧项目 ServerSideManager.vue:
 *   - WS 服务端地址列表
 *   - 操作：重启 + 更新配置（均需确认弹窗）
 *   - 成功/失败反馈
 *   - 状态展示（运行中/已停止）
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Server, Wifi, WifiOff, RefreshCw, FileCog, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

export default function ServerPage() {
  const { token } = useAuthStore();
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // serverId_action
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchServers = async () => {
    setLoading(true);
    try {
      const res = await ofetch('/api/server/list', { headers: authHeaders });
      if (res.code === 0) setServers(res.data || []);
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchServers(); }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const emitAction = async (server: any, action: 'restart' | 'update_config') => {
    const actionKey = `${server.id}_${action}`;
    setActionLoading(actionKey);
    setMessage(null);

    try {
      const res = await ofetch('/api/server/emit-action', {
        method: 'POST',
        body: {
          action,
          targetWs: server.address,
          payload: {},
        },
        headers: authHeaders,
      });

      if (res.code === 0) {
        showMsg('success', action === 'restart' ? '重启指令已下发' : '更新配置指令已下发');
      } else {
        showMsg('error', res.msg || '操作失败');
      }
    } catch (e: any) {
      showMsg('error', e.message || '操作失败');
    }
    setActionLoading(null);
  };

  const handleAction = (server: any, action: 'restart' | 'update_config') => {
    const actionText = action === 'restart' ? '重启' : '更新配置';
    if (!confirm(`确定对服务端「${server.address}」执行${actionText}操作？`)) return;
    emitAction(server, action);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Server size={20} strokeWidth={1.8} />服务端管理
        </h1>
        <Button variant="outline" size="sm" className="h-7" onClick={fetchServers} disabled={loading}>
          <RefreshCw size={13} strokeWidth={1.8} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {message.type === 'success'
            ? <CheckCircle2 size={16} className="flex-shrink-0" />
            : <AlertCircle size={16} className="flex-shrink-0" />
          }
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : servers.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无服务端信息</p>
      ) : (
        <div className="space-y-3">
          {servers.map(s => (
            <Card key={s.id} className="transition-colors hover:border-primary/15">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      {s.status === 'running' ? (
                        <Badge className="bg-emerald-500/90 text-white border-0 text-[10px]">
                          <Wifi size={10} strokeWidth={2.5} className="mr-0.5" />运行中
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          <WifiOff size={10} strokeWidth={2.5} className="mr-0.5" />已停止
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-x-4 gap-y-0.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="font-mono">{s.type?.toUpperCase()}</span>
                      <span className="font-mono">{s.address}</span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 ml-4 flex-shrink-0">
                    <!-- 重启 -->
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleAction(s, 'restart')}
                      disabled={actionLoading === `${s.id}_restart`}
                    >
                      {actionLoading === `${s.id}_restart`
                        ? <Loader2 size={13} strokeWidth={1.8} className="mr-1 animate-spin" />
                        : <RefreshCw size={13} strokeWidth={1.8} className="mr-1" />
                      }
                      重启
                    </Button>
                    <!-- 更新配置 -->
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleAction(s, 'update_config')}
                      disabled={actionLoading === `${s.id}_update_config`}
                    >
                      {actionLoading === `${s.id}_update_config`
                        ? <Loader2 size={13} strokeWidth={1.8} className="mr-1 animate-spin" />
                        : <FileCog size={13} strokeWidth={1.8} className="mr-1" />
                      }
                      更新配置
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}