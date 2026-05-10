import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/serialize';

// PUT /api/models/[param]/default — 设为默认模型
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param } = await params;

  // 1. 找到要设为默认的模型
  const targetModel = await prisma.modelConfig.findUnique({
    where: { id: BigInt(param) },
  });

  if (!targetModel) {
    return NextResponse.json({ code: 404, msg: '模型不存在' });
  }

  // 2. 将该类型的所有模型 isDefault 设为 0
  await prisma.modelConfig.updateMany({
    where: { modelType: targetModel.modelType },
    data: { isDefault: 0 },
  });

  // 3. 将目标模型 isDefault 设为 1
  const model = await prisma.modelConfig.update({
    where: { id: BigInt(param) },
    data: { isDefault: 1 },
  });

  return NextResponse.json({ code: 0, data: serializeBigInt(model) });
}
