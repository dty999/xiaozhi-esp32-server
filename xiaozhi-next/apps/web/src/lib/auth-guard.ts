import { NextRequest } from 'next/server';
import { verifyJwt, verifyServerSecret, JwtPayload } from './jwt';

export type AuthType = 'anon' | 'oauth2' | 'server';

interface AuthResult {
  authenticated: boolean;
  payload?: JwtPayload;
  error?: string;
}

/**
 * 验证请求
 * @param type 鉴权类型
 * @param request NextRequest
 */
export async function authenticate(
  type: AuthType,
  request: NextRequest
): Promise<AuthResult> {
  if (type === 'anon') return { authenticated: true };

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return { authenticated: false, error: 'Missing authorization header' };
  }

  if (type === 'server') {
    const valid = await verifyServerSecret(token);
    return valid
      ? { authenticated: true }
      : { authenticated: false, error: 'Invalid server secret' };
  }

  if (type === 'oauth2') {
    const payload = await verifyJwt(token);
    return payload
      ? { authenticated: true, payload }
      : { authenticated: false, error: 'Invalid or expired token' };
  }

  return { authenticated: false, error: 'Unknown auth type' };
}
