import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateSnowflakeId } from '../src/lib/snowflake';

const prisma = new PrismaClient();

async function main() {
  const adminId = generateSnowflakeId();
  
  // 创建超级管理员
  await prisma.sysUser.create({
    data: {
      id: adminId,
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      realName: 'Super Admin',
      superAdmin: 1,
      status: 1,
    },
  });

  console.log('Seed completed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
