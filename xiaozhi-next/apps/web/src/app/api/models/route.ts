import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';

// GET /api/models — 模型查询（分页/筛选）
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const modelType = searchParams.get('modelType') || '';
  const modelName = searchParams.get('modelName') || '';

  const where: any = {};
  if (modelType) where.modelType = modelType;
  if (modelName) where.modelName = { contains: modelName };

  const [total, list] = await Promise.all([
    prisma.modelConfig.count({ where }),
    prisma.modelConfig.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ modelType: 'asc' }, { sort: 'asc' }],
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// POST /api/models — 新增模型
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await request.json();
  const model = await prisma.modelConfig.create({
    data: {
      id: generateSnowflakeId(),
      modelType: body.modelType,
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
