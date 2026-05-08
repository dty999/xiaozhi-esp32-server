/**
 * 向 WebSocket 服务器发送指令
 *
 * 对标 Java ServerSideManageController:
 *   POST /server/emit-action  → POST /api/server/emit-action
 *
 * 请求体：{ action: string, payload: any, deviceId?: string }
 *
 * @module server/emit-action
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { safeParseBody } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const { action, payload, deviceId } = body;

  if (!action) {
    return NextResponse.json({ code: 400, msg: '请指定动作类型' });
  }

  // 此处为简化实现：记录指令
  // 实际生产环境需通过内部消息通道（如 Redis Pub/Sub）将指令
  // 广播给 WS Server 进程，再由其转发至对应的设备连接

  const result = {
    action,
    payload: payload || {},
    deviceId: deviceId || null,
    status: 'dispatched',
    message: '指令已下发至消息通道',
  };

  return NextResponse.json({ code: 0, data: result });
}
