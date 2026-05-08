import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const params = await prisma.sysParams.findMany({
    where: {
      paramCode: {
        in: [
          'server.public_key',
          'system-web.menu',
          'system-web.name',
          'system-web.allow-register',
          'system-web.allow-mobile-register',
          'system-web.mobile-area-list',
          'system-web.beian-icp-num',
          'system-web.beian-ga-num',
          'system-web.version',
        ],
      },
    },
  });

  const paramMap = Object.fromEntries(params.map(p => [p.paramCode, p.paramValue]));

  return NextResponse.json({
    code: 0,
    data: {
      sm2PublicKey: paramMap['server.public_key'] || '',
      allowUserRegister: paramMap['system-web.allow-register'] === 'true',
      enableMobileRegister: paramMap['system-web.allow-mobile-register'] === 'true',
      mobileAreaList: JSON.parse(paramMap['system-web.mobile-area-list'] || '[]'),
      beianIcpNum: paramMap['system-web.beian-icp-num'] || '',
      beianGaNum: paramMap['system-web.beian-ga-num'] || '',
      version: paramMap['system-web.version'] || '',
      name: paramMap['system-web.name'] || '智控台',
      systemWebMenu: JSON.parse(paramMap['system-web.menu'] || '{}'),
    },
  });
}
