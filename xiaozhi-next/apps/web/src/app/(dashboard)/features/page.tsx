'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, Check } from 'lucide-react';

export default function FeaturesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Globe size={24} />功能配置
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { name: '用户注册', desc: '允许新用户注册', status: true },
          { name: '短信验证', desc: '阿里云短信验证码', status: true },
          { name: 'SM2 加密', desc: '国密 SM2 登录加密', status: true },
          { name: '设备激活', desc: '6位码激活绑定', status: true },
          { name: 'OTA 升级', desc: 'ESP32 固件升级', status: true },
          { name: '知识库 RAG', desc: 'RAGFlow 检索增强', status: true },
          { name: '声音克隆', desc: '火山引擎声音克隆', status: true },
          { name: 'MCP 协议', desc: 'Model Context Protocol', status: false },
        ].map(f => (
          <Card key={f.name}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">{f.name}</CardTitle>
                <Badge variant={f.status ? 'default' : 'secondary'}>
                  {f.status && <Check size={12} className="mr-1" />}
                  {f.status ? '已启用' : '未启用'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
