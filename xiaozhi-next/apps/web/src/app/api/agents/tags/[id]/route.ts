/**
 * 删除标签
 *
 * 对标 Java AgentController.java 中:
 *   DELETE /agent/tag/{id}  → DELETE /api/agents/tags/[id]
 *
 * @module agents/tags/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const tagId = BigInt(id);

  // 先删除所有关联关系，再删除标签
  await prisma.$transaction([
    prisma.agentTagRelation.deleteMany({ where: { tagId } }),
    prisma.agentTag.delete({ where: { id: tagId } }),
  ]);

  return NextResponse.json({ code: 0, msg: '标签已删除' });
}
