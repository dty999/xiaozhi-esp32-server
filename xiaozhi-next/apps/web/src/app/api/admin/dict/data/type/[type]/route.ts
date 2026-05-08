import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';

// GET /api/admin/dict/data/type/[type] — 按字典类型获取数据（公开）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  // 优先从缓存读取
  const cacheKey = `sys:dict:data:${type}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return NextResponse.json({
      code: 0,
      data: JSON.parse(cached),
    });
  }

  // 查数据库
  const dictType = await prisma.sysDictType.findFirst({
    where: { dictType: type },
  });

  if (!dictType) {
    return NextResponse.json({ code: 0, data: [] });
  }

  const data = await prisma.sysDictData.findMany({
    where: { dictTypeId: dictType.id },
    select: {
      id: true,
      dictLabel: true,
      dictValue: true,
      remark: true,
      sort: true,
    },
    orderBy: { sort: 'asc' },
  });

  // 回填缓存
  await cache.set(cacheKey, JSON.stringify(data), 3600);

  return NextResponse.json({ code: 0, data });
}
