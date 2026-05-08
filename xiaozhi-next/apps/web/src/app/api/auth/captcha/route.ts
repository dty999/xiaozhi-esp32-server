import { NextRequest, NextResponse } from 'next/server';
import { createCaptcha } from '@/lib/captcha';

export async function GET(request: NextRequest) {
  const { uuid, svg } = await createCaptcha();

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'X-Captcha-Uuid': uuid,
      'Cache-Control': 'no-store',
    },
  });
}
