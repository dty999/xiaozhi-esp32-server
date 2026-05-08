import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateSnowflakeId } from '../src/lib/snowflake';

const prisma = new PrismaClient();

async function main() {
  // 检查 admin 是否已存在
  const existing = await prisma.sysUser.findFirst({ where: { username: 'admin' } });
  if (existing) {
    console.log('Admin user already exists, skipping.');
    return;
  }

  // 创建超级管理员
  await prisma.sysUser.create({
    data: {
      id: generateSnowflakeId(),
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      realName: 'Super Admin',
      superAdmin: 1,
      status: 1,
    },
  });

  console.log('Seed completed: admin/admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
