/**
 * 智能体标签管理 — 获取所有标签 / 创建标签
 *
 * 对标 Java AgentController.java 中:
 *   GET  /agent/tag/list  → GET  /api/agents/tags
 *   POST /agent/tag       → POST /api/agents/tags
 *
 * @module agents/tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/agents/tags — 获取所有标签列表
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const tags = await prisma.agentTag.findMany({
    orderBy: { createDate: 'desc' },
    include: {
      relations: {
        select: { agentId: true },
      },
    },
  });

  const list = tags.map(t => ({
    id: t.id.toString(),
    tagName: t.tagName,
    agentCount: t.relations.length,
    createDate: t.createDate,
  }));

  return NextResponse.json({ code: 0, data: list });
}

// ─────────────────────────────────────────────
// POST /api/agents/tags — 创建标签
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

  const tagName = body.tagName?.trim();
  if (!tagName) {
    return NextResponse.json({ code: 400, msg: '标签名称不能为空' });
  }

  // 检查标签名是否已存在
  const existing = await prisma.agentTag.findFirst({
    where: { tagName },
  });
  if (existing) {
    return NextResponse.json({ code: 400, msg: '标签名称已存在' });
  }

  const tag = await prisma.agentTag.create({
    data: {
      id: generateSnowflakeId(),
      tagName,
    },
  });

  return NextResponse.json({
    code: 0,
    data: { id: tag.id.toString(), tagName: tag.tagName },
  });
}
