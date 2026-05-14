/**
 * BigInt 序列化工具
 *
 * Prisma 返回的 BigInt 字段无法被 JSON.stringify 序列化，
 * 此工具递归将对象中所有 BigInt 转为 string。
 */

/**
 * 递归将对象/数组中的所有 BigInt 转为 string
 */
export function serializeBigInt<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'bigint') {
    return data.toString() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(item => serializeBigInt(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result as T;
  }

  return data;
}
