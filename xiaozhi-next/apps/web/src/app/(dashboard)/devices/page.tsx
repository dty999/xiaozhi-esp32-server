'use client';
/**
 * 设备管理页 — 全局设备列表（管理员）
 *
 * 对标 Java 管理端 DeviceController
 * 支持：列表查询、新增设备、编辑、删除、查看详情
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface Device {
  id: string;
  macAddress: string;
  alias: string | null;
  board: string | null;
  appVersion: string | null;
  deviceType: string | null;
  isBound: number;
  activationCode: string | null;
  lastConnectedAt: string | null;
  otaAutoUpdate: number;
  firmwareType: string | null;
  createDate: string | null;
  updateDate: string | null;
  agentName: string;
  agentCode: string;
  username: string;
  realName: string;
}

export default function DevicesPage() {
  const { token } = useAuthStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');

  // 新增/编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState({ macAddress: '', alias: '', board: '', deviceType: '', firmwareType: '' });

  const limit = 10;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchDevices = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (keyword) params.set('keyword', keyword);
      const res = await ofetch(`/api/devices?${params.toString()}`, { headers: authHeaders });
      if (res.code === 0) {
        setDevices(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchDevices(1); }, []);

  const handleSearch = () => { setPage(1); fetchDevices(1); };

  // 新增
  const openCreate = () => {
    setEditingDevice(null);
    setFormData({ macAddress: '', alias: '', board: '', deviceType: '', firmwareType: '' });
    setDialogOpen(true);
  };

  // 编辑
  const openEdit = (d: Device) => {
    setEditingDevice(d);
    setFormData({
      macAddress: d.macAddress,
      alias: d.alias || '',
      board: d.board || '',
      deviceType: d.deviceType || '',
      firmwareType: d.firmwareType || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingDevice) {
        await ofetch(`/api/devices/${editingDevice.id}`, { method: 'PUT', body: formData, headers: authHeaders });
      } else {
        const res = await ofetch('/api/devices', { method: 'POST', body: formData, headers: authHeaders });
        if (res.code !== 0) { alert(res.msg); return; }
      }
      setDialogOpen(false);
      fetchDevices(page);
    } catch { /* 容错 */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此设备？')) return;
    try {
      await ofetch(`/api/devices/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchDevices(page);
    } catch { /* 容错 */ }
  };

  const isOnline = (lastConnectedAt: string | null) => {
    if (!lastConnectedAt) return false;
    return Date.now() - new Date(lastConnectedAt).getTime() < 5 * 60 * 1000;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold">设备管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7" onClick={() => fetchDevices(page)}>
            <RefreshCw size={13} strokeWidth={1.8} className="mr-1" />刷新
          </Button>
          <Button size="sm" className="h-7" onClick={openCreate}>
            <Plus size={13} strokeWidth={1.8} className="mr-1" />添加设备
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="搜索 MAC 地址..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-xs h-8"
        />
        <Button variant="secondary" size="sm" className="h-8" onClick={handleSearch}>搜索</Button>
      </div>

      {/* 设备列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-14" /></CardContent></Card>)}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {devices.map(d => (
              <Card key={d.id} className="transition-colors hover:border-primary/15">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{d.macAddress}</span>
                        {isOnline(d.lastConnectedAt)
                          ? <Badge variant="default" className="bg-emerald-500/90 text-white border-0 text-[10px]"><Wifi size={10} strokeWidth={2.5} className="mr-0.5" />在线</Badge>
                          : <Badge variant="secondary" className="text-[10px]"><WifiOff size={10} strokeWidth={2.5} className="mr-0.5" />离线</Badge>
                        }
                        {d.isBound === 1 && <Badge variant="outline" className="text-[10px]">已绑定</Badge>}
                      </div>
                      <div className="flex gap-x-4 gap-y-0.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {d.alias && <span>别名: {d.alias}</span>}
                        {d.board && <span>主板: {d.board}</span>}
                        {d.appVersion && <span>版本: {d.appVersion}</span>}
                        {d.agentName && <span>智能体: {d.agentName}</span>}
                        {d.username && <span>用户: {d.realName || d.username}</span>}
                        {d.lastConnectedAt && (
                          <span>最后连接: {new Date(d.lastConnectedAt).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-4 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(d)}>编辑</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/5" onClick={() => handleDelete(d.id)}>
                        <Trash2 size={14} strokeWidth={1.8} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 分页 */}
          {total > limit && (
            <div className="flex justify-center gap-1.5 mt-5">
              {Array.from({ length: Math.ceil(total / limit) }, (_, i) => i + 1).map(p => (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => { setPage(p); fetchDevices(p); }}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDevice ? '编辑设备' : '添加设备'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">MAC 地址 *</Label>
              <Input
                value={formData.macAddress}
                onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                disabled={!!editingDevice}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">别名</Label>
              <Input
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">主板型号</Label>
              <Input
                value={formData.board}
                onChange={(e) => setFormData({ ...formData, board: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">设备类型</Label>
              <Input
                value={formData.deviceType}
                onChange={(e) => setFormData({ ...formData, deviceType: e.target.value })}
                placeholder="esp32-s3 / esp32-c3"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">固件类型</Label>
              <Input
                value={formData.firmwareType}
                onChange={(e) => setFormData({ ...formData, firmwareType: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button size="sm" className="h-8" onClick={handleSave}>{editingDevice ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
