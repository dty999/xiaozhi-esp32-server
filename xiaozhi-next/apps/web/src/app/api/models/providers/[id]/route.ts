import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// GET /api/models/providers/[id] — 供应器详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const provider = await prisma.modelProvider.findUnique({
    where: { id: BigInt(id) },
  });

  if (!provider) {
    return NextResponse.json({ code: 404, msg: '供应器不存在' });
  }

  return NextResponse.json({
    code: 0,
    data: {
      ...provider,
      id: provider.id.toString(),
      creator: provider.creator?.toString() ?? null,
      updater: provider.updater?.toString() ?? null,
    },
  });
}

// PUT /api/models/providers/[id] — 更新供应器
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

  const provider = await prisma.modelProvider.update({
    where: { id: BigInt(id) },
    data: {
      modelType: body.modelType,
      providerCode: body.providerCode,
      name: body.name,
      fields: body.fields ? (typeof body.fields === 'string' ? JSON.parse(body.fields) : body.fields) : undefined,
      sort: body.sort,
      updater: auth.payload?.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({
    code: 0,
    data: {
      ...provider,
      id: provider.id.toString(),
      creator: provider.creator?.toString() ?? null,
      updater: provider.updater?.toString() ?? null,
    },
  });
}

// DELETE /api/models/providers/[id] — 删除供应器
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { id } = await params;
  await prisma.modelProvider.delete({ where: { id: BigInt(id) } });

  return NextResponse.json({ code: 0, msg: '供应器已删除' });
}
