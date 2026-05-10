import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/models/names — 模型名称列表（供前端下拉选择）
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const modelType = searchParams.get('modelType') || '';
  const modelName = searchParams.get('modelName') || '';

  const where: any = { isEnabled: 1 };
  if (modelType) where.modelType = modelType;
  if (modelName) where.modelName = { contains: modelName };

  const models = await prisma.modelConfig.findMany({
    where,
    select: {
      id: true,
      modelCode: true,
      modelName: true,
      modelType: true,
      isDefault: true,
    },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(models) });
}
