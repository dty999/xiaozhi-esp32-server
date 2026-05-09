import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// GET /api/models/providers — 分页查询供应器
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const keyword = searchParams.get('keyword') || '';

  const where: any = {};
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { providerCode: { contains: keyword } },
      { modelType: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.modelProvider.count({ where }),
    prisma.modelProvider.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ modelType: 'asc' }, { sort: 'asc' }],
    }),
  ]);

  const serialized = list.map(p => ({
    ...p,
    id: p.id.toString(),
    creator: p.creator?.toString() ?? null,
    updater: p.updater?.toString() ?? null,
  }));

  return NextResponse.json({ code: 0, data: { total, page, limit, list: serialized } });
}

// POST /api/models/providers — 新增供应器
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const provider = await prisma.modelProvider.create({
    data: {
      id: generateSnowflakeId(),
      modelType: body.modelType,
      providerCode: body.providerCode,
      name: body.name,
      fields: body.fields ? (typeof body.fields === 'string' ? JSON.parse(body.fields) : body.fields) : null,
      sort: body.sort ?? 0,
      creator: auth.payload?.userId,
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
