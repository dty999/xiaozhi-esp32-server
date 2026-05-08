/**
 * 模板详情 / 更新 / 删除单个模板
 *
 * 对标 Java AgentTemplateController.java 中:
 *   GET    /agent/template/{id}  → GET    /api/templates/[id]
 *   PUT    /agent/template       → PUT    /api/templates/[id]
 *   DELETE /agent/template/{id}  → DELETE /api/templates/[id]
 *
 * 所有操作仅超级管理员可用。
 * 删除单模板后重排剩余模板的 sort 值。
 *
 * @module templates/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/templates/[id] — 模板详情
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const template = await prisma.aiAgentTemplate.findUnique({
    where: { id: BigInt(id) },
  });

  if (!template) {
    return NextResponse.json({ code: 404, msg: '模板不存在' });
  }

  return NextResponse.json({ code: 0, data: template });
}

// ─────────────────────────────────────────────
// PUT /api/templates/[id] — 更新模板
// ─────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const updated = await prisma.aiAgentTemplate.update({
    where: { id: BigInt(id) },
    data: {
      agentName: body.agentName,
      asrModelId: body.asrModelId !== undefined ? (body.asrModelId ? BigInt(body.asrModelId) : null) : undefined,
      vadModelId: body.vadModelId !== undefined ? (body.vadModelId ? BigInt(body.vadModelId) : null) : undefined,
      llmModelId: body.llmModelId !== undefined ? (body.llmModelId ? BigInt(body.llmModelId) : null) : undefined,
      ttsModelId: body.ttsModelId !== undefined ? (body.ttsModelId ? BigInt(body.ttsModelId) : null) : undefined,
      memModelId: body.memModelId !== undefined ? (body.memModelId ? BigInt(body.memModelId) : null) : undefined,
      intentModelId: body.intentModelId !== undefined ? (body.intentModelId ? BigInt(body.intentModelId) : null) : undefined,
      vllmModelId: body.vllmModelId !== undefined ? (body.vllmModelId ? BigInt(body.vllmModelId) : null) : undefined,
      ttsVoiceId: body.ttsVoiceId !== undefined ? (body.ttsVoiceId ? BigInt(body.ttsVoiceId) : null) : undefined,
      ttsLanguage: body.ttsLanguage !== undefined ? body.ttsLanguage : undefined,
      ttsVolume: body.ttsVolume !== undefined ? body.ttsVolume : undefined,
      ttsRate: body.ttsRate !== undefined ? body.ttsRate : undefined,
      ttsPitch: body.ttsPitch !== undefined ? body.ttsPitch : undefined,
      systemPrompt: body.systemPrompt !== undefined ? body.systemPrompt : undefined,
      functions: body.functions !== undefined ? body.functions : undefined,
      sort: body.sort !== undefined ? body.sort : undefined,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: updated });
}

// ─────────────────────────────────────────────
// DELETE /api/templates/[id] — 删除单个模板（删除后重排序）
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.aiAgentTemplate.findUnique({
    where: { id: BigInt(id) },
  });

  if (!existing) {
    return NextResponse.json({ code: 404, msg: '模板不存在' });
  }

  // 删除
  await prisma.aiAgentTemplate.delete({ where: { id: BigInt(id) } });

  // 重排剩余模板的 sort 值（保持连续性）
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

  return NextResponse.json({ code: 0, msg: '模板已删除' });
}
