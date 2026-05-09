import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// GET /api/models/[param] — 模型详情（param 为模型 ID）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;
  const model = await prisma.modelConfig.findUnique({
    where: { id: BigInt(param) },
  });

  if (!model) {
    return NextResponse.json({ code: 404, msg: '模型不存在' });
  }

  return NextResponse.json({ code: 0, data: { ...model, id: model.id.toString() } });
}

// PUT /api/models/[param] — 更新模型
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;
  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const model = await prisma.modelConfig.update({
    where: { id: BigInt(param) },
    data: {
      modelCode: body.modelCode,
      modelName: body.modelName,
      isDefault: body.isDefault,
      isEnabled: body.isEnabled,
      configJson: body.configJson,
      docLink: body.docLink,
      remark: body.remark,
      sort: body.sort,
    },
  });

  return NextResponse.json({ code: 0, data: { ...model, id: model.id.toString() } });
}

// DELETE /api/models/[param] — 删除模型
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;
  await prisma.modelConfig.delete({ where: { id: BigInt(param) } });

  return NextResponse.json({ code: 0, msg: '模型已删除' });
}
