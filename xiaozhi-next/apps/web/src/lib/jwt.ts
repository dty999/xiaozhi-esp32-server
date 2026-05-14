import * as jose from 'jose';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'xiaozhi-server-secret-change-me'
);

// Token 生成：UUID → MD5 → Hex（与原 Shiro 行为一致）
function generateTokenValue(): string {
  return createHash('md5').update(uuidv4()).digest('hex');
}

export interface JwtPayload {
  userId: bigint;
  username: string;
  superAdmin: number;
}

/**
 * 签发用户 Token，存入 sys_user_token 表，12 小时过期
 */
export async function issueUserToken(user: {
  id: bigint;
  username: string;
  superAdmin: number;
}): Promise<string> {
  const tokenValue = generateTokenValue();
  const now = Date.now();
  const expireDate = new Date(now + 12 * 60 * 60 * 1000); // 12 小时

  // 检查已有 token，如有则更新
  const existing = await prisma.sysUserToken.findFirst({
    where: { userId: user.id },
  });

  if (existing) {
    await prisma.sysUserToken.update({
      where: { id: existing.id },
      data: { token: tokenValue, expireDate, updateDate: new Date() },
    });
  } else {
    await prisma.sysUserToken.create({
      data: {
        id: BigInt(now),
        userId: user.id,
        token: tokenValue,
        expireDate,
        updateDate: new Date(),
      },
    });
  }

  // 生成 JWT (jose)
  const jwt = await new jose.SignJWT({
    userId: user.id.toString(),
    username: user.username,
    superAdmin: user.superAdmin,
    token: tokenValue,
  } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(JWT_SECRET);

  return jwt;
}

/**
 * 验证 JWT 并返回负载
 */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    // 验证 token 在数据库中存在且未过期
    const userToken = await prisma.sysUserToken.findFirst({
      where: {
        userId: BigInt(payload.userId as string),
        token: payload.token as string,
      },
    });
    if (!userToken) return null;
    if (userToken.expireDate < new Date()) return null;

    return {
      userId: BigInt(payload.userId as string),
      username: payload.username as string,
      superAdmin: payload.superAdmin as number,
    };
  } catch {
    return null;
  }
}

/**
 * 验证 ServerSecret（用于 xiaozhi-server 调用）
 */
export async function verifyServerSecret(secret: string): Promise<boolean> {
  // 从 sys_params 中读取 server.secret
  const param = await prisma.sysParams.findFirst({
    where: { paramCode: 'server.secret' },
  });
  if (!param) return false;
  return param.paramValue === secret;
}

/**
 * 生成设备 JWT Token（用于 ESP32 WebSocket 连接）
 */
export async function issueDeviceToken(macAddress: string): Promise<string> {
  return new jose.SignJWT({ macAddress, type: 'device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}
