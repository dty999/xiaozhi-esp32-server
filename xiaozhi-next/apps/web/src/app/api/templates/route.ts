/**
 * 智能体模板管理 —— 获取模板列表 / 创建模板 / 批量删除
 *
 * 对标 Java AgentTemplateController.java 中:
 *   GET    /agent/template/page          → GET    /api/templates （管理员分页）
 *   POST   /agent/template               → POST   /api/templates （创建）
 *   POST   /agent/template/batch-remove  → DELETE /api/templates?ids=... （批量删除）
 *
 * 注：普通用户获取模板列表仍走 /api/agents/templates（或合并查询参数区分）
 *
 * @module templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/templates — 管理员模板分页
//   若只有普通权限则返回用户可见模板（按 sort 排序）
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // 区分管理员分页和普通用户列表
  if (auth.payload?.superAdmin === 1 && searchParams.has('page')) {
    // 管理员分页模式
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const agentName = searchParams.get('agentName') || '';

    const where: any = {};
    if (agentName) where.agentName = { contains: agentName };

    const [total, list] = await Promise.all([
      prisma.aiAgentTemplate.count({ where }),
      prisma.aiAgentTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sort: 'asc' },
      }),
    ]);

    return NextResponse.json({ code: 0, data: { total, page, limit, list: serializeTemplates(list) } });
  }

  // 普通用户：返回所有模板列表（按 sort 排序）
  const templates = await prisma.aiAgentTemplate.findMany({
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: serializeTemplates(templates) });
}

// ─────────────────────────────────────────────
// POST /api/templates — 创建模板（仅超级管理员）
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  // 获取下一个可用 sort 值（最大值 + 1）
  const lastTemplate = await prisma.aiAgentTemplate.findFirst({
    orderBy: { sort: 'desc' },
  });
  const nextSort = (lastTemplate?.sort ?? 0) + 1;

  const template = await prisma.aiAgentTemplate.create({
    data: {
      id: generateSnowflakeId(),
      agentCode: body.agentCode || `template_${Date.now()}`,
      agentName: body.agentName || '新模板',
      asrModelId: body.asrModelId ? BigInt(body.asrModelId) : null,
      vadModelId: body.vadModelId ? BigInt(body.vadModelId) : null,
      llmModelId: body.llmModelId ? BigInt(body.llmModelId) : null,
      ttsModelId: body.ttsModelId ? BigInt(body.ttsModelId) : null,
      memModelId: body.memModelId ? BigInt(body.memModelId) : null,
      intentModelId: body.intentModelId ? BigInt(body.intentModelId) : null,
      vllmModelId: body.vllmModelId ? BigInt(body.vllmModelId) : null,
      ttsVoiceId: body.ttsVoiceId ? BigInt(body.ttsVoiceId) : null,
      ttsLanguage: body.ttsLanguage || null,
      ttsVolume: body.ttsVolume ?? null,
      ttsRate: body.ttsRate ?? null,
      ttsPitch: body.ttsPitch ?? null,
      systemPrompt: body.systemPrompt || '',
      functions: body.functions || null,
      sort: nextSort,
      creator: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, data: serializeTemplate(template) });
}

function serializeTemplate(t: any) {
  return {
    ...t,
    id: t.id.toString(),
    asrModelId: t.asrModelId?.toString() ?? null,
    vadModelId: t.vadModelId?.toString() ?? null,
    llmModelId: t.llmModelId?.toString() ?? null,
    ttsModelId: t.ttsModelId?.toString() ?? null,
    memModelId: t.memModelId?.toString() ?? null,
    intentModelId: t.intentModelId?.toString() ?? null,
    vllmModelId: t.vllmModelId?.toString() ?? null,
    ttsVoiceId: t.ttsVoiceId?.toString() ?? null,
    creator: t.creator?.toString() ?? null,
    updater: t.updater?.toString() ?? null,
  };
}

function serializeTemplates(list: any[]) {
  return list.map(serializeTemplate);
}

// ─────────────────────────────────────────────
// DELETE /api/templates — 批量删除模板（仅超级管理员）
//   ?ids=1,2,3
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idsStr = searchParams.get('ids') || '';

  if (!idsStr) {
    return NextResponse.json({ code: 400, msg: '请提供模板ID列表' });
  }

  const ids = idsStr.split(',').map(id => BigInt(id.trim()));

  // 批量删除
  await prisma.aiAgentTemplate.deleteMany({
    where: { id: { in: ids } },
  });

  // 删除后重排 sort（保持连续性）
  const remaining = await prisma.aiAgentTemplate.findMany({
    orderBy: { sort: 'asc' },
  });

  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].sort !== i) {
      await prisma.aiAgentTemplate.update({
        where: { id: remaining[i].id },
        data: { sort: i },
      });
    }
  }

  return NextResponse.json({ code: 0, msg: `已删除 ${ids.length} 个模板` });
}
