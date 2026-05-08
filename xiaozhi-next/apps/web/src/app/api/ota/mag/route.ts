/**
 * 固件管理 —— 分页列表 / 新增固件
 *
 * 对标 Java OTAMagController.java 中:
 *   GET  /ota/mag  → GET  /api/ota/mag （管理员分页）
 *   POST /ota/mag  → POST /api/ota/mag （新增固件）
 *
 * @module ota/mag
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { safeParseBody } from '@/lib/request-body';

// ─────────────────────────────────────────────
// GET /api/ota/mag — 固件分页查询
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const type = searchParams.get('type') || '';

  const where: any = {};
  if (type) where.type = type;

  const [total, list] = await Promise.all([
    prisma.aiOta.count({ where }),
    prisma.aiOta.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// ─────────────────────────────────────────────
// POST /api/ota/mag — 新增固件记录（仅超级管理员）
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }

  const firmware = await prisma.aiOta.create({
    data: {
      id: generateSnowflakeId(),
      firmwareName: body.firmwareName,
      firmwarePath: body.firmwarePath || '',
      type: body.type || 'default',
      version: body.version || '',
      fileSize: body.fileSize ? BigInt(body.fileSize) : null,
      md5: body.md5 || null,
      remark: body.remark || null,
      creator: auth.payload!.userId,
    },
  });

  return NextResponse.json({ code: 0, data: firmware });
}
