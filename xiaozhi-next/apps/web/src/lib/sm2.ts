import { sm2 } from 'sm-crypto';

/**
 * SM2 解密（服务端私钥解密客户端公钥加密的数据）
 * 对应 Java 端 Sm2DecryptUtil
 */
export function sm2Decrypt(encryptedData: string, privateKey: string): string {
  // cipherMode: 1 - C1C3C2
  return sm2.doDecrypt(encryptedData, privateKey, 1);
}

/**
 * 解析客户端登录数据
 * 客户端用 SM2 公钥加密 "captcha:password" 拼接字符串
 * 服务端用 SM2 私钥解密后分割
 */
export function decryptoLoginData(
  encrypted: string,
  privateKey: string
): { captcha: string; password: string } | null {
  try {
    const decrypted = sm2Decrypt(encrypted, privateKey);
    // 原格式：captcha:password
    const parts = decrypted.split(':');
    if (parts.length !== 2) return null;
    return { captcha: parts[0]!, password: parts[1]! };
  } catch {
    return null;
  }
}
