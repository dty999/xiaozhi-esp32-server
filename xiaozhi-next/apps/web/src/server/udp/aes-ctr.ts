/**
 * ============================================================
 * AES-CTR 加密工具
 * 对标固件规范: UDP 音频使用 AES-CTR 加密
 *
 * 职责：
 * 1. 使用 AES-CTR 模式加密/解密 UDP 音频数据
 * 2. 支持 128-bit 密钥和 nonce
 * ============================================================
 */

import { createCipheriv, createDecipheriv } from 'crypto';

const AES_BLOCK_SIZE = 16;

/**
 * 从 hex 字符串解码密钥/nonce
 */
export function decodeHexKey(hexString: string): Buffer {
  return Buffer.from(hexString.replace(/\s/g, ''), 'hex');
}

/**
 * AES-CTR 加密
 *
 * @param data 明文数据
 * @param key 128-bit 密钥 (16 bytes)
 * @param nonce 128-bit nonce (16 bytes)
 * @returns 加密后的数据
 */
export function aesCtrEncrypt(data: Buffer, key: Buffer, nonce: Buffer): Buffer {
  if (key.length !== AES_BLOCK_SIZE) {
    throw new Error(`AES-CTR key must be ${AES_BLOCK_SIZE} bytes, got ${key.length}`);
  }
  if (nonce.length !== AES_BLOCK_SIZE) {
    throw new Error(`AES-CTR nonce must be ${AES_BLOCK_SIZE} bytes, got ${nonce.length}`);
  }

  const cipher = createCipheriv('aes-128-ctr', key, nonce);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-CTR 解密（CTR 模式下加密和解密是对称的）
 *
 * @param data 密文数据
 * @param key 128-bit 密钥 (16 bytes)
 * @param nonce 128-bit nonce (16 bytes)
 * @returns 解密后的数据
 */
export function aesCtrDecrypt(data: Buffer, key: Buffer, nonce: Buffer): Buffer {
  // CTR 模式下加密和解密使用相同操作
  return aesCtrEncrypt(data, key, nonce);
}

/**
 * 生成随机密钥和 nonce
 */
export function generateCryptoParams(): { key: string; nonce: string } {
  const key = cryptoRandomBytes(AES_BLOCK_SIZE).toString('hex');
  const nonce = cryptoRandomBytes(AES_BLOCK_SIZE).toString('hex');
  return { key, nonce };
}

function cryptoRandomBytes(size: number): Buffer {
  try {
    return require('crypto').randomBytes(size);
  } catch {
    // 降级方案
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    return buf;
  }
}
