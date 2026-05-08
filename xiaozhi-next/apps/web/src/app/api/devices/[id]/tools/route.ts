/**
 * 获取设备工具列表 / 调用设备工具
 *
 * 对标 Java DeviceController.java 中:
 *   POST /device/tools/list/{deviceId}  → POST /api/devices/[id]/tools       （工具列表）
 *   POST /device/tools/call/{deviceId}  → POST /api/devices/[id]/tools/call  （调用工具）
 *
 * 设备工具通过 MQTT 网关转发指令，此处返回设备已配置的插件信息。
 * 实际调用需由 WS Server 转发至设备端执行。
 *
 * @module devices/[id]/tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// POST /api/devices/[id]/tools — 获取设备工具列表
// ─────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const deviceId = BigInt(id);

  // 查找设备
  const device = await prisma.aiDevice.findUnique({ where: { id: deviceId } });
  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  // 通过设备关联的智能体获取插件列表
  const plugins = await prisma.agentPluginMapping.findMany({
    where: { agentId: device.agentId },
    select: {
      id: true,
      pluginId: true,
      targetId: true,
    },
  });

  const tools = plugins.map(p => ({
    id: p.id.toString(),
    pluginId: p.pluginId.toString(),
    targetId: p.targetId?.toString() || null,
  }));

  return NextResponse.json({ code: 0, data: tools });
}
