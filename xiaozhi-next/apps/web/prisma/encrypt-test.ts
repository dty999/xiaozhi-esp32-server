/**
 * 用法：npx tsx prisma/encrypt-test.ts <验证码> <密码>
 * 示例：npx tsx prisma/encrypt-test.ts ABCDE admin123
 */
import { sm2 } from 'sm-crypto';

const pubKey = '047381e9a0e557e185e5e5ab8c5801b5e27d41d58af6de648673b359f22f8a2ae2dd02596ce609b8e41297bfb2118c3504e66f21757d82ea4a16f006143faab802';

const captchaCode = process.argv[2] || 'ABCDE';
const password = process.argv[3] || 'admin123';
const plainText = `${captchaCode}:${password}`;
const encrypted = sm2.doEncrypt(plainText, pubKey, 1);

console.log(encrypted);
