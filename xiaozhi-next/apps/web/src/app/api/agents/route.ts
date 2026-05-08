/**
 * 智能体主路由 — GET 获取用户智能体列表 / POST 创建智能体
 *
 * 对标 Java AgentController.java 中:
 *   - GET  /agent/list         → GET  /api/agents?keyword=&searchType=
 *   - POST /agent              → POST /api/agents
 *
 * @module agents
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/agents — 获取当前用户智能体列表
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword') || '';
  const searchType = searchParams.get('searchType') || 'name';

  const userId = auth.payload!.userId;

  // 构建查询条件：仅查看当前用户的智能体
  const where: any = { userId };

  if (keyword) {
    if (searchType === 'mac' || searchType === 'device') {
      // 按设备 MAC 地址搜索
      where.devices = { some: { macAddress: { contains: keyword } } };
    } else {
      // 默认按智能体名称搜索
      where.agentName = { contains: keyword };
    }
  }

  const agents = await prisma.aiAgent.findMany({
    where,
    orderBy: { sort: 'asc' },
    include: {
      devices: {
        select: {
          id: true,
          macAddress: true,
          alias: true,
          isBound: true,
          board: true,
          lastConnectedAt: true,
          otaAutoUpdate: true,
        },
      },
      tags: {
        include: { tag: true },
      },
    },
  });

  // 转换为前端友好格式（BigInt → String）
  const list = agents.map(agent => ({
    id: agent.id.toString(),
    agentCode: agent.agentCode,
    agentName: agent.agentName,
    asrModelId: agent.asrModelId?.toString() || null,
    vadModelId: agent.vadModelId?.toString() || null,
    llmModelId: agent.llmModelId?.toString() || null,
    ttsModelId: agent.ttsModelId?.toString() || null,
    memModelId: agent.memModelId?.toString() || null,
    intentModelId: agent.intentModelId?.toString() || null,
    vllmModelId: agent.vllmModelId?.toString() || null,
    ttsVoiceId: agent.ttsVoiceId?.toString() || null,
    ttsLanguage: agent.ttsLanguage,
    ttsVolume: agent.ttsVolume,
    ttsRate: agent.ttsRate,
    ttsPitch: agent.ttsPitch,
    systemPrompt: agent.systemPrompt,
    summaryMemory: agent.summaryMemory,
    sort: agent.sort,
    functions: agent.functions,
    createDate: agent.createDate,
    updateDate: agent.updateDate,
    devicesCount: agent.devices.length,
    devices: agent.devices.map(d => ({
      id: d.id.toString(),
      macAddress: d.macAddress,
      alias: d.alias,
      isBound: d.isBound,
      board: d.board,
      lastConnectedAt: d.lastConnectedAt,
      otaAutoUpdate: d.otaAutoUpdate,
    })),
    tags: agent.tags.map(tr => ({
      id: tr.tag.id.toString(),
      tagName: tr.tag.tagName,
    })),
  }));

  return NextResponse.json({ code: 0, data: list });
}

// ─────────────────────────────────────────────
// POST /api/agents — 创建智能体
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const userId = auth.payload!.userId;
  const agentId = generateSnowflakeId();

  const agent = await prisma.aiAgent.create({
    data: {
      id: agentId,
      agentCode: body.agentCode || `agent_${Date.now()}`,
      agentName: body.agentName || '新智能体',
      asrModelId: body.asrModelId ? BigInt(body.asrModelId) : null,
      vadModelId: body.vadModelId ? BigInt(body.vadModelId) : null,
      llmModelId: body.llmModelId ? BigInt(body.llmModelId) : null,
      ttsModelId: body.ttsModelId ? BigInt(body.ttsModelId) : null,
      memModelId: body.memModelId ? BigInt(body.memModelId) : null,
      intentModelId: body.intentModelId ? BigInt(body.intentModelId) : null,
      vllmModelId: body.vllmModelId ? BigInt(body.vllmModelId) : null,
      slmModelId: body.slmModelId ? BigInt(body.slmModelId) : null,
      ttsVoiceId: body.ttsVoiceId ? BigInt(body.ttsVoiceId) : null,
      ttsLanguage: body.ttsLanguage || null,
      ttsVolume: body.ttsVolume ?? null,
      ttsRate: body.ttsRate ?? null,
      ttsPitch: body.ttsPitch ?? null,
      systemPrompt: body.systemPrompt || '',
      functions: body.functions || null,
      sort: body.sort || 0,
      userId,
    },
  });

  return NextResponse.json({ code: 0, data: { agentId: agent.id.toString() } });
}
