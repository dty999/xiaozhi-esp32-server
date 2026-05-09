/**
 * 智能体详情/更新/删除单个智能体
 *
 * 对标 Java AgentController.java 中:
 *   GET    /agent/{id}  → GET    /api/agents/[id]
 *   PUT    /agent/{id}  → PUT    /api/agents/[id]
 *   DELETE /agent/{id}  → DELETE /api/agents/[id]
 *
 * 删除时执行级联清理：设备→聊天记录→插件→上下文源→替换词→标签关联→智能体自身。
 *
 * @module agents/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/agents/[id] — 获取智能体详情
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const agent = await prisma.aiAgent.findUnique({
    where: { id: BigInt(id) },
    include: {
      tags: { include: { tag: true } },
      contextProviders: {
        select: { id: true, contextProviders: true },
      },
      correctWords: {
        include: { file: { select: { id: true, fileName: true } } },
      },
      plugins: {
        select: { id: true, pluginId: true, targetId: true },
      },
    },
  });

  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }

  // 用户只能看自己的智能体（管理员除外）
  if (agent.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  return NextResponse.json({
    code: 0,
    data: {
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
      slmModelId: agent.slmModelId?.toString() || null,
      ttsVoiceId: agent.ttsVoiceId?.toString() || null,
      ttsLanguage: agent.ttsLanguage,
      ttsVolume: agent.ttsVolume,
      ttsRate: agent.ttsRate,
      ttsPitch: agent.ttsPitch,
      systemPrompt: agent.systemPrompt,
      summaryMemory: agent.summaryMemory,
      chatHistoryConf: agent.chatHistoryConf,
      functions: agent.functions,
      sort: agent.sort,
      userId: agent.userId.toString(),
      createDate: agent.createDate,
      updateDate: agent.updateDate,
      tags: agent.tags.map(tr => ({
        id: tr.tag.id.toString(),
        tagName: tr.tag.tagName,
      })),
      contextProviders: agent.contextProviders.map(cp => ({
        id: cp.id.toString(),
        contextProviders: cp.contextProviders,
      })),
      correctWords: agent.correctWords.map(cw => ({
        id: cw.id.toString(),
        fileId: cw.fileId.toString(),
        fileName: cw.file?.fileName || '',
      })),
      plugins: agent.plugins.map(p => ({
        id: p.id.toString(),
        pluginId: p.pluginId.toString(),
        targetId: p.targetId?.toString() || null,
      })),
    },
  });
}

// ─────────────────────────────────────────────
// PUT /api/agents/[id] — 更新智能体
// ─────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const agentId = BigInt(id);
  const userId = auth.payload!.userId;

  // 权限校验：只能修改自己的智能体（管理员可修改任意）
  const existing = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (existing.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 更新智能体
  await prisma.aiAgent.update({
    where: { id: agentId },
    data: {
      agentName: body.agentName,
      asrModelId: body.asrModelId !== undefined
        ? (body.asrModelId ? BigInt(body.asrModelId) : null) : undefined,
      vadModelId: body.vadModelId !== undefined
        ? (body.vadModelId ? BigInt(body.vadModelId) : null) : undefined,
      llmModelId: body.llmModelId !== undefined
        ? (body.llmModelId ? BigInt(body.llmModelId) : null) : undefined,
      ttsModelId: body.ttsModelId !== undefined
        ? (body.ttsModelId ? BigInt(body.ttsModelId) : null) : undefined,
      memModelId: body.memModelId !== undefined
        ? (body.memModelId ? BigInt(body.memModelId) : null) : undefined,
      intentModelId: body.intentModelId !== undefined
        ? (body.intentModelId ? BigInt(body.intentModelId) : null) : undefined,
      vllmModelId: body.vllmModelId !== undefined
        ? (body.vllmModelId ? BigInt(body.vllmModelId) : null) : undefined,
      slmModelId: body.slmModelId !== undefined
        ? (body.slmModelId ? BigInt(body.slmModelId) : null) : undefined,
      ttsVoiceId: body.ttsVoiceId !== undefined
        ? (body.ttsVoiceId ? BigInt(body.ttsVoiceId) : null) : undefined,
      ttsLanguage: body.ttsLanguage !== undefined ? body.ttsLanguage : undefined,
      ttsVolume: body.ttsVolume !== undefined ? body.ttsVolume : undefined,
      ttsRate: body.ttsRate !== undefined ? body.ttsRate : undefined,
      ttsPitch: body.ttsPitch !== undefined ? body.ttsPitch : undefined,
      systemPrompt: body.systemPrompt !== undefined ? body.systemPrompt : undefined,
      summaryMemory: body.summaryMemory !== undefined ? body.summaryMemory : undefined,
      chatHistoryConf: body.chatHistoryConf !== undefined ? body.chatHistoryConf : undefined,
      functions: body.functions !== undefined ? body.functions : undefined,
      sort: body.sort !== undefined ? body.sort : undefined,
    },
  });

  return NextResponse.json({ code: 0, msg: '更新成功' });
}

// ─────────────────────────────────────────────
// DELETE /api/agents/[id] — 删除智能体（级联删除）
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const agentId = BigInt(id);
  const userId = auth.payload!.userId;

  // 权限校验
  const existing = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }
  if (existing.userId !== userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 级联删除：在事务中依次清理关联数据
  await prisma.$transaction(async (tx) => {
    // 1. 解除设备绑定（将设备 isBound 置 0，agentId 置 0）
    await tx.aiDevice.updateMany({
      where: { agentId },
      data: { agentId: null, isBound: 0 },
    });
    // 2. 删除聊天记录
    await tx.agentChatHistory.deleteMany({ where: { agentId } });
    // 3. 删除会话标题
    await tx.agentChatTitle.deleteMany({ where: { agentId } });
    // 4. 删除插件映射
    await tx.agentPluginMapping.deleteMany({ where: { agentId } });
    // 5. 删除上下文源配置
    await tx.agentContextProvider.deleteMany({ where: { agentId } });
    // 6. 删除替换词文件关联
    await tx.agentCorrectWordMapping.deleteMany({ where: { agentId } });
    // 7. 删除标签关联
    await tx.agentTagRelation.deleteMany({ where: { agentId } });
    // 8. 删除声纹
    await tx.agentVoicePrint.deleteMany({ where: { agentId } });
    // 9. 删除智能体自身
    await tx.aiAgent.delete({ where: { id: agentId } });
  });

  return NextResponse.json({ code: 0, msg: '删除成功' });
}
