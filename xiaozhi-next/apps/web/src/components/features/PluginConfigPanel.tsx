'use client';
/**
 * PluginConfigPanel — 功能插件勾选面板
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const PLUGINS = [
  { id: 'weather', name: '天气查询', desc: '查询指定城市天气' },
  { id: 'news', name: '新闻获取', desc: '获取最新新闻' },
  { id: 'home_assistant', name: 'Home Assistant', desc: '智能家居控制' },
  { id: 'music', name: '音乐播放', desc: '在线音乐播放' },
  { id: 'ragflow', name: '知识库检索', desc: 'RAGFlow 知识库召回' },
  { id: 'iot', name: 'IoT 设备', desc: '物联网设备控制' },
  { id: 'mem_toggle', name: '记忆开关', desc: '对话记忆持久化' },
];

export function PluginConfigPanel({ agent, onChange }: { agent: any; onChange: (a: any) => void }) {
  const currentFunctions = (agent.functions || '').split(',').filter(Boolean);

  const toggle = (pluginId: string) => {
    const newFunctions = currentFunctions.includes(pluginId)
      ? currentFunctions.filter(f => f !== pluginId)
      : [...currentFunctions, pluginId];
    onChange({ ...agent, functions: newFunctions.join(',') });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">功能插件</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {PLUGINS.map(plugin => {
            const active = currentFunctions.includes(plugin.id);
            return (
              <div
                key={plugin.id}
                onClick={() => toggle(plugin.id)}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <div>
                  <div className="font-medium text-sm">{plugin.name}</div>
                  <div className="text-xs text-muted-foreground">{plugin.desc}</div>
                </div>
                <Badge variant={active ? 'default' : 'outline'}>
                  {active ? '已启用' : '未启用'}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
