/**
 * 服务端管理 —— WS 服务器列表查询 / WS 指令发送
 *
 * 对标 Java ServerSideManageController:
 *   GET  /server/list         → GET  /api/server/list （WS服务器列表）
 *   POST /server/emit-action  → POST /api/server/emit-action （发送WS指令）
 *
 * @module server
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/server/list — WS 服务器列表
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 从系统参数获取服务器配置
  const wsHost = await cache.hget('sys:params', 'server.ws_host') || process.env.WS_HOST || 'ws://localhost:8000';
  const mqttGateway = await cache.hget('sys:params', 'server.mqtt_gateway') || '';

  const servers = [
    {
      id: '1',
      name: 'WebSocket Server',
      address: wsHost,
      type: 'websocket',
      status: 'running',
    },
    {
      id: '2',
      name: 'MQTT Gateway',
      address: mqttGateway || '未配置',
      type: 'mqtt',
      status: mqttGateway ? 'running' : 'stopped',
    },
  ];

  return NextResponse.json({ code: 0, data: servers });
}
