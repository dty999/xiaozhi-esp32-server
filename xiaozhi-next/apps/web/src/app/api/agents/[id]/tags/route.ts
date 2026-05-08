/**
 * 智能体的标签 — 获取 / 保存标签关联
 *
 * 对标 Java AgentController.java 中:
 *   GET /agent/{id}/tags  → GET  /api/agents/[id]/tags
 *   PUT /agent/{id}/tags  → PUT  /api/agents/[id]/tags
 *
 * 保存时支持按 tagIds 列表批量设置（全量替换模式）。
 *
 * @module agents/[id]/tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/agents/[id]/tags — 获取智能体的标签
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
  const agentId = BigInt(id);

  const relations = await prisma.agentTagRelation.findMany({
    where: { agentId },
    include: { tag: true },
    orderBy: { sort: 'asc' },
  });

  const tags = relations.map(r => ({
    id: r.tag.id.toString(),
    tagName: r.tag.tagName,
  }));

  return NextResponse.json({ code: 0, data: tags });
}

// ─────────────────────────────────────────────
// PUT /api/agents/[id]/tags — 保存智能体的标签（全量替换）
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
  const agentId = BigInt(id);
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const tagIds: string[] = body.tagIds || [];
  const tagNames: string[] = body.tagNames || [];
  const userId = auth.payload!.userId;

  await prisma.$transaction(async (tx) => {
    // 1. 清除旧的标签关联
    await tx.agentTagRelation.deleteMany({ where: { agentId } });

    // 2. 处理新标签：对于已有的标签名，先查后创
    for (let i = 0; i < tagIds.length; i++) {
      const tagId = tagIds[i];
      const tagName = tagNames[i];

      if (!tagId && tagName) {
        // 按名称创建新标签
        let tag = await tx.agentTag.findFirst({ where: { tagName } });
        if (!tag) {
          tag = await tx.agentTag.create({
            data: { id: generateSnowflakeId(), tagName },
          });
        }
        await tx.agentTagRelation.create({
          data: { id: generateSnowflakeId(), agentId, tagId: tag.id, sort: i },
        });
      } else if (tagId) {
        await tx.agentTagRelation.create({
          data: { id: generateSnowflakeId(), agentId, tagId: BigInt(tagId), sort: i },
        });
      }
    }
  });

  return NextResponse.json({ code: 0, msg: '标签保存成功' });
}
