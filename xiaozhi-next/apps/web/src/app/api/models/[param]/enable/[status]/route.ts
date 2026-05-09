import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// PUT /api/models/[param]/enable/[status] — 启用/禁用模型
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ param: string; status: string }> }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { param, status } = await params;
  const isEnabled = parseInt(status) === 1 ? 1 : 0;

  const model = await prisma.modelConfig.update({
    where: { id: BigInt(param) },
    data: { isEnabled },
  });

  return NextResponse.json({ code: 0, data: { ...model, id: model.id.toString() } });
}
