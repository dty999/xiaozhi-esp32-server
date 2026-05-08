import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// 敏感参数关键词
const SENSITIVE_KEYWORDS = ['api_key', 'api_key_id', 'apikey', 'secret', 'token', 'password', 'private'];

function isSensitiveParam(code: string): boolean {
  return SENSITIVE_KEYWORDS.some(kw => code.toLowerCase().includes(kw.toLowerCase()));
}

// GET /api/admin/params — 分页查询
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const paramCode = searchParams.get('paramCode') || '';

  const where: any = {};
  if (paramCode) where.paramCode = { contains: paramCode };

  const [total, list] = await Promise.all([
    prisma.sysParams.count({ where }),
    prisma.sysParams.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { id: 'desc' },
    }),
  ]);

  // 敏感参数脱敏
  const maskedList = list.map(p => ({
    ...p,
    paramValue: isSensitiveParam(p.paramCode) ? '******' : p.paramValue,
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: maskedList },
  });
}

// POST /api/admin/params — 新增参数
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const param = await prisma.sysParams.create({
    data: {
      id: generateSnowflakeId(),
      paramCode: body.paramCode,
      paramValue: body.paramValue,
      valueType: body.valueType || 1,
      remark: body.remark,
    },
  });

  // 更新 Redis 缓存
  await cache.hset('sys:params', param.paramCode, param.paramValue);

  return NextResponse.json({ code: 0, data: param });
}
