import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';

// GET /api/models/[param]/[providerCode] — 获取某供应商下的模型列表（param 为模型类型）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ param: string; providerCode: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param, providerCode } = await params;

  const models = await prisma.modelConfig.findMany({
    where: {
      modelType: param,
      modelCode: { startsWith: providerCode },
    },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: models });
}

// POST /api/models/[param]/[providerCode] — 新增模型（param 为模型类型）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ param: string; providerCode: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;
  const body = await request.json();

  const model = await prisma.modelConfig.create({
    data: {
      id: generateSnowflakeId(),
      modelType: param,
      modelCode: body.modelCode,
      modelName: body.modelName,
      isDefault: body.isDefault ?? 0,
      isEnabled: body.isEnabled ?? 1,
      configJson: body.configJson,
      docLink: body.docLink,
      remark: body.remark,
      sort: body.sort ?? 0,
    },
  });

  return NextResponse.json({ code: 0, data: model });
}
