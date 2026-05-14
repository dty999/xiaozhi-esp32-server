// 简单雪花 ID 替代（与原 MyBatis-Plus ASSIGN_ID 兼容）
// 实际使用中可直接用 Prisma 的 @default(autoincrement())，
// 但如需保持与旧系统 ID 格式兼容，使用此模块

let sequence = 0n;
const epoch = 1700000000000n; // 2023-11-14
const workerId = 1n;
const datacenterId = 1n;

export function generateSnowflakeId(): bigint {
  const timestamp = BigInt(Date.now()) - epoch;
  sequence = (sequence + 1n) & 0xFFFn;
  return (timestamp << 22n) | (datacenterId << 17n) | (workerId << 12n) | sequence;
}
