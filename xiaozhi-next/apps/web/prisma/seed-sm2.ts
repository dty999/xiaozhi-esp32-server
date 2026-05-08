import { PrismaClient } from '@prisma/client';
import { generateSnowflakeId } from '../src/lib/snowflake';

const prisma = new PrismaClient();

const PUBLIC_KEY = '047381e9a0e557e185e5e5ab8c5801b5e27d41d58af6de648673b359f22f8a2ae2dd02596ce609b8e41297bfb2118c3504e66f21757d82ea4a16f006143faab802';
const PRIVATE_KEY = '6cd6f04af15f257a3a0c7aac1b7910c0e213888036c01f6076b5c0faa5aa69be';

async function upsertParam(paramCode: string, paramValue: string) {
  const existing = await prisma.sysParams.findFirst({ where: { paramCode } });
  if (existing) {
    await prisma.sysParams.update({
      where: { id: existing.id },
      data: { paramValue },
    });
    console.log(`Updated: ${paramCode}`);
  } else {
    await prisma.sysParams.create({
      data: {
        id: generateSnowflakeId(),
        paramCode,
        paramValue,
        valueType: 1,
        createDate: new Date(),
      },
    });
    console.log(`Created: ${paramCode}`);
  }
}

async function main() {
  await upsertParam('server.public_key', PUBLIC_KEY);
  await upsertParam('server.private_key', PRIVATE_KEY);
  console.log('\nSM2 key pair seeded successfully!');
  console.log('Public key: ', PUBLIC_KEY);
  console.log('Private key:', PRIVATE_KEY);
}

main().catch(console.error).finally(() => prisma.$disconnect());
