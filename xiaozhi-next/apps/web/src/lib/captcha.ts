import { randomBytes } from 'crypto';
import { cache } from './redis';
import { v4 as uuidv4 } from 'uuid';

/**
 * 生成 5 位字符验证码（与原 easy-captcha 行为一致）
 */
function generateCaptchaCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * 生成简单 SVG 验证码
 * 实际项目中可替换为 svg-captcha 库
 */
function generateSvgCaptcha(code: string): string {
  const width = 150;
  const height = 50;
  const letters = code.split('');
  const fontSize = 30;
  
  let paths = '';
  let texts = '';
  
  letters.forEach((char, i) => {
    const x = 15 + i * 28;
    const y = 35 + Math.random() * 8 - 4;
    texts += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial" fill="#1a1a1a">${char}</text>`;
  });

  // 干扰线
  for (let i = 0; i < 3; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    paths += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ccc" stroke-width="1"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f0f0f0"/>
    ${paths}
    ${texts}
  </svg>`;
}

export interface CaptchaResult {
  uuid: string;
  svg: string;
}

/**
 * 创建验证码（Redis 缓存 5 分钟）
 */
export async function createCaptcha(): Promise<CaptchaResult> {
  const uuid = uuidv4();
  const code = generateCaptchaCode();
  await cache.set(`sys:captcha:${uuid}`, code.toUpperCase(), 300);
  const svg = generateSvgCaptcha(code);
  return { uuid, svg };
}

/**
 * 验证 captcha
 */
export async function verifyCaptcha(uuid: string, code: string): Promise<boolean> {
  const stored = await cache.get(`sys:captcha:${uuid}`);
  if (!stored) return false;
  await cache.del(`sys:captcha:${uuid}`); // 一次性使用
  return stored.toUpperCase() === code.toUpperCase();
}
