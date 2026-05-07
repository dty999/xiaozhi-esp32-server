# 第二阶段：核心 API 迁移（上）—— 系统管理与模型配置

> **目标**：迁移认证、用户、参数、字典、模型配置、配置下发共 50+ 个 API 端点。
> **验证标准**：Postman 可调用所有端点，登录/注册流程完整可用，xiaozhi-server 可通过 `/api/config/*` 获取配置。

---

## 2.1 API Route 实现规范

所有 API Route 遵循以下模式（Next.js App Router）：

```typescript
// app/api/xxx/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthType } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

// 鉴权类型：'anon' | 'oauth2' | 'server'
const AUTH_TYPE: AuthType = 'oauth2';

export async function GET(request: NextRequest) {
  const auth = await authenticate(AUTH_TYPE, request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }
  
  // 业务逻辑...
  return NextResponse.json({ code: 0, data: {} });
}
```

**响应格式**（与原系统一致）：

```typescript
// 成功
{ "code": 0, "msg": "success", "data": {...} }

// 分页
{ "code": 0, "msg": "success", "data": { "total": 100, "page": 1, "limit": 10, "list": [...] } }

// 错误
{ "code": 500, "msg": "错误描述" }
```

---

## 2.2 认证 API

### 端点映射

| 原路径 | 新路径 | 方法 | 鉴权 |
|:---|:---|:---|:---|
| `/user/captcha?uuid=` | `/api/auth/captcha` | GET | anon |
| `/user/smsVerification` | `/api/auth/sms` | POST | anon |
| `/user/login` | `/api/auth/login` | POST | anon |
| `/user/register` | `/api/auth/register` | POST | anon |
| `/user/info` | `/api/auth/me` | GET | oauth2 |
| `/user/change-password` | `/api/auth/change-password` | PUT | oauth2 |
| `/user/retrieve-password` | `/api/auth/reset-password` | PUT | anon |
| `/user/pub-config` | `/api/auth/pub-config` | GET | anon |

### 2.2.1 `GET /api/auth/captcha`

**实现文件**：`src/app/api/auth/captcha/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createCaptcha } from '@/lib/captcha';

export async function GET(request: NextRequest) {
  // 忽略原有 uuid 参数（内部自动生成）
  const { uuid, svg } = await createCaptcha();
  
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'X-Captcha-Uuid': uuid,       // 返回 uuid 供客户端使用
      'Cache-Control': 'no-store',
    },
  });
}
```

**测试**：`GET http://localhost:3000/api/auth/captcha` → 返回 SVG 图片 + `X-Captcha-Uuid` 头

### 2.2.2 `POST /api/auth/sms`

**实现文件**：`src/app/api/auth/sms/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyCaptcha } from '@/lib/captcha';
import { sendSmsCode } from '@/lib/sms';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { phone, captcha, captchaId } = body;

  // 1. 验证图形验证码
  if (!captchaId || !captcha) {
    return NextResponse.json({ code: 400, msg: '请完成图形验证' });
  }
  const captchaValid = await verifyCaptcha(captchaId, captcha);
  if (!captchaValid) {
    return NextResponse.json({ code: 400, msg: '图形验证码错误' });
  }

  // 2. 发送短信
  const result = await sendSmsCode(phone);
  if (!result.success) {
    return NextResponse.json({ code: 400, msg: result.message });
  }

  return NextResponse.json({ code: 0, msg: '验证码已发送' });
}
```

### 2.2.3 `POST /api/auth/login`

**实现文件**：`src/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { decryptoLoginData } from '@/lib/sm2';
import { issueUserToken } from '@/lib/jwt';
import { verifyCaptcha } from '@/lib/captcha';
import { cache } from '@/lib/redis';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password, captchaId } = body;

  // 1. SM2 解密 password 字段 → 获得 "captcha:password" 格式
  // 从 Redis/DB 获取私钥
  const privateKey = (await cache.hget('sys:params', 'server.private_key')) 
    || (await prisma.sysParams.findFirst({ where: { paramCode: 'server.private_key' } }))?.paramValue;

  if (!privateKey) {
    return NextResponse.json({ code: 500, msg: '系统配置错误：缺少SM2私钥' });
  }

  const decrypted = decryptoLoginData(password, privateKey);
  if (!decrypted) {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 2. 验证 captcha
  if (captchaId) {
    const captchaValid = await verifyCaptcha(captchaId, decrypted.captcha);
    if (!captchaValid) {
      return NextResponse.json({ code: 400, msg: '验证码错误' });
    }
  }

  // 3. 查找用户（支持用户名或手机号）
  const user = await prisma.sysUser.findFirst({
    where: {
      OR: [
        { username: username },
        { mobile: username },
      ],
      status: 1,
    },
  });

  if (!user) {
    return NextResponse.json({ code: 400, msg: '用户名或密码错误' });
  }

  // 4. BCrypt 密码校验
  if (!verifyPassword(decrypted.password, user.password)) {
    return NextResponse.json({ code: 400, msg: '用户名或密码错误' });
  }

  // 5. 签发 Token
  const token = await issueUserToken({
    id: user.id,
    username: user.username,
    superAdmin: user.superAdmin,
  });

  return NextResponse.json({
    code: 0,
    msg: 'success',
    data: {
      token,
      userInfo: {
        id: user.id.toString(),
        username: user.username,
        realName: user.realName,
        email: user.email,
        mobile: user.mobile,
        superAdmin: user.superAdmin,
        status: user.status,
        headUrl: user.headUrl,
      },
    },
  });
}
```

### 2.2.4 `POST /api/auth/register`

**实现文件**：`src/app/api/auth/register/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { sm2Decrypt } from '@/lib/sm2';
import { verifySmsCode } from '@/lib/sms';
import { cache } from '@/lib/redis';
import { generateSnowflakeId } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, password, captchaId, mobileCaptcha, phone, areaCode } = body;

  // 获取 SM2 私钥
  const param = await prisma.sysParams.findFirst({
    where: { paramCode: 'server.private_key' },
  });
  const privateKey = param?.paramValue;
  if (!privateKey) {
    return NextResponse.json({ code: 500, msg: '系统配置错误' });
  }

  // 解密密码
  let plainPassword: string;
  try {
    plainPassword = sm2Decrypt(password, privateKey);
  } catch {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 短信验证码校验
  if (phone && mobileCaptcha) {
    const valid = await verifySmsCode(phone, mobileCaptcha);
    if (!valid) {
      return NextResponse.json({ code: 400, msg: '短信验证码错误或已过期' });
    }
  }

  // 检查用户名是否已存在
  if (username) {
    const existing = await prisma.sysUser.findFirst({ where: { username } });
    if (existing) {
      return NextResponse.json({ code: 400, msg: '用户名已被注册' });
    }
  }

  // 检查手机号是否已注册
  if (phone) {
    const existing = await prisma.sysUser.findFirst({ where: { mobile: phone } });
    if (existing) {
      return NextResponse.json({ code: 400, msg: '手机号已被注册' });
    }
  }

  // 创建用户
  const user = await prisma.sysUser.create({
    data: {
      id: generateSnowflakeId(),
      username: username || `user_${phone}`,
      password: hashPassword(plainPassword),
      mobile: phone,
      status: 1,
      superAdmin: 0,
    },
  });

  return NextResponse.json({
    code: 0,
    msg: '注册成功',
    data: { userId: user.id.toString(), username: user.username },
  });
}
```

### 2.2.5 `GET /api/auth/me`

**实现文件**：`src/app/api/auth/me/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const user = await prisma.sysUser.findUnique({
    where: { id: auth.payload!.userId },
  });

  if (!user) {
    return NextResponse.json({ code: 401, msg: '用户不存在' });
  }

  return NextResponse.json({
    code: 0,
    data: {
      id: user.id.toString(),
      username: user.username,
      realName: user.realName,
      email: user.email,
      mobile: user.mobile,
      superAdmin: user.superAdmin,
      status: user.status,
      headUrl: user.headUrl,
      createDate: user.createDate,
    },
  });
}
```

### 2.2.6 `PUT /api/auth/change-password`

```typescript
// src/app/api/auth/change-password/route.ts
export async function PUT(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { oldPassword, newPassword } = await request.json();
  
  const user = await prisma.sysUser.findUnique({ where: { id: auth.payload!.userId } });
  if (!user || !verifyPassword(oldPassword, user.password)) {
    return NextResponse.json({ code: 400, msg: '原密码错误' });
  }

  await prisma.sysUser.update({
    where: { id: user.id },
    data: { password: hashPassword(newPassword) },
  });

  return NextResponse.json({ code: 0, msg: '密码修改成功' });
}
```

### 2.2.7 `PUT /api/auth/reset-password`

```typescript
// src/app/api/auth/reset-password/route.ts
export async function PUT(request: NextRequest) {
  const { phone, password, code, captchaId } = await request.json();

  // 验证短信验证码
  const valid = await verifySmsCode(phone, code);
  if (!valid) {
    return NextResponse.json({ code: 400, msg: '验证码错误或已过期' });
  }

  // SM2解密新密码
  const privateKeyParam = await prisma.sysParams.findFirst({
    where: { paramCode: 'server.private_key' },
  });
  let plainPassword: string;
  try {
    plainPassword = sm2Decrypt(password, privateKeyParam!.paramValue);
  } catch {
    return NextResponse.json({ code: 400, msg: '密码解密失败' });
  }

  // 更新密码
  const user = await prisma.sysUser.findFirst({ where: { mobile: phone } });
  if (!user) {
    return NextResponse.json({ code: 400, msg: '该手机号未注册' });
  }

  await prisma.sysUser.update({
    where: { id: user.id },
    data: { password: hashPassword(plainPassword) },
  });

  return NextResponse.json({ code: 0, msg: '密码已重置' });
}
```

### 2.2.8 `GET /api/auth/pub-config`

```typescript
// src/app/api/auth/pub-config/route.ts
export async function GET() {
  const params = await prisma.sysParams.findMany({
    where: {
      paramCode: {
        in: [
          'server.public_key',
          'system-web.menu',
          'system-web.name',
          'system-web.allow-register',
          'system-web.allow-mobile-register',
          'system-web.mobile-area-list',
          'system-web.beian-icp-num',
          'system-web.beian-ga-num',
          'system-web.version',
        ],
      },
    },
  });

  const paramMap = Object.fromEntries(params.map(p => [p.paramCode, p.paramValue]));

  return NextResponse.json({
    code: 0,
    data: {
      sm2PublicKey: paramMap['server.public_key'] || '',
      allowUserRegister: paramMap['system-web.allow-register'] === 'true',
      enableMobileRegister: paramMap['system-web.allow-mobile-register'] === 'true',
      mobileAreaList: JSON.parse(paramMap['system-web.mobile-area-list'] || '[]'),
      beianIcpNum: paramMap['system-web.beian-icp-num'] || '',
      beianGaNum: paramMap['system-web.beian-ga-num'] || '',
      version: paramMap['system-web.version'] || '',
      name: paramMap['system-web.name'] || '智控台',
      systemWebMenu: JSON.parse(paramMap['system-web.menu'] || '{}'),
    },
  });
}
```

---

## 2.3 管理员 API

### 文件：`src/app/api/admin/users/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';

// GET /api/admin/users — 分页查询
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const mobile = searchParams.get('mobile') || '';

  const where: any = {};
  if (mobile) where.mobile = { contains: mobile };

  const [total, list] = await Promise.all([
    prisma.sysUser.count({ where }),
    prisma.sysUser.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createDate: 'desc' },
    }),
  ]);

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list },
  });
}

// PUT /api/admin/users/[id] — 重置密码
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 生成随机密码
  const newPassword = Math.random().toString(36).slice(-8);
  
  await prisma.sysUser.update({
    where: { id: BigInt(params.id) },
    data: { password: hashPassword(newPassword) },
  });

  return NextResponse.json({ code: 0, data: { password: newPassword } });
}
```

> 注：完整的路由参数结构参考 Next.js App Router 约定，`[id]` 文件夹下放 `route.ts`。

---

## 2.4 参数管理 API

### 文件：`src/app/api/admin/params/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { generateSnowflakeId } from '@/lib/snowflake';

// GET /api/admin/params — 分页
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const paramCode = searchParams.get('paramCode') || '';

  const where: any = {};
  if (paramCode) where.paramCode = { contains: paramCode };

  const [total, list] = await Promise.all([
    prisma.sysParams.count({ where }),
    prisma.sysParams.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { id: 'desc' },
    }),
  ]);

  // 敏感参数脱敏（客户端显示）
  const maskedList = list.map(p => ({
    ...p,
    paramValue: isSensitiveParam(p.paramCode) ? '******' : p.paramValue,
  }));

  return NextResponse.json({
    code: 0,
    data: { total, page, limit, list: maskedList },
  });
}

// POST /api/admin/params — 新增
export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated || auth.payload?.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const body = await request.json();
  const param = await prisma.sysParams.create({
    data: {
      id: generateSnowflakeId(),
      paramCode: body.paramCode,
      paramValue: body.paramValue,
      valueType: body.valueType || 1,
      remark: body.remark,
    },
  });

  // 更新 Redis 缓存
  await cache.hset('sys:params', param.paramCode, param.paramValue);

  return NextResponse.json({ code: 0, data: param });
}

// 敏感参数判断
function isSensitiveParam(code: string): boolean {
  const sensitiveKeywords = ['api_key', 'api_key_id', 'apiKey', 'secret', 'token', 'password', 'private'];
  return sensitiveKeywords.some(kw => code.toLowerCase().includes(kw.toLowerCase()));
}
```

---

## 2.5 字典管理 API

实现与参数管理类似，略述要点：

- `SysDictType` CRUD：`src/app/api/admin/dict/types/route.ts`
- `SysDictData` CRUD：`src/app/api/admin/dict/data/route.ts`
- 公开按类型获取：`src/app/api/admin/dict/data/type/[type]/route.ts`（anon 鉴权）

**Redis 缓存策略**：
- 字典数据变更时：`await cache.del('sys:dict:data:' + dictType)`
- 读取时优先缓存：`await cache.get('sys:dict:data:' + dictType)`

---

## 2.6 模型配置 API

### 端点分组

| 端点分组 | 文件 |
|:---|:---|
| 模型 CRUD | `src/app/api/models/route.ts` |
| 模型名列表 | `src/app/api/models/names/route.ts` |
| LLM 编码列表 | `src/app/api/models/llm-names/route.ts` |
| 供应商列表 | `src/app/api/models/[type]/providers/route.ts` |
| 模型增/改/删 | `src/app/api/models/[type]/[providerCode]/route.ts` |
| 模型详情/启用/默认 | `src/app/api/models/[id]/route.ts` 及子路由 |
| 音色列表 | `src/app/api/models/[id]/voices/route.ts` |

### 2.6.1 关键业务逻辑 — `GET /api/models/names`

```typescript
// src/app/api/models/names/route.ts
export async function GET(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const modelType = searchParams.get('modelType') || '';
  const modelName = searchParams.get('modelName') || '';

  const where: any = { isEnabled: 1 };
  if (modelType) where.modelType = modelType;
  if (modelName) where.modelName = { contains: modelName };

  const models = await prisma.modelConfig.findMany({
    where,
    select: {
      id: true,
      modelCode: true,
      modelName: true,
      modelType: true,
      isDefault: true,
    },
    orderBy: { sort: 'asc' },
  });

  return NextResponse.json({ code: 0, data: models });
}
```

### 2.6.2 关键业务逻辑 — `POST /api/config/agent-models`

此为 **xiaozhi-server 获取智能体配置的核心端点**（ServerSecret 鉴权）。

```typescript
// src/app/api/config/agent-models/route.ts
export async function POST(request: NextRequest) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await request.json();
  const { macAddress, clientId, selectedModule } = body;

  // 1. 根据 MAC 查找设备
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress },
    include: { agent: true },
  });
  if (!device || !device.agent) {
    return NextResponse.json({ code: 404, msg: '设备未绑定智能体' });
  }
  const agent = device.agent;

  // 2. 如果指定了 selectedModule（模块白名单），只返回选中的模块
  const selectedModulesSet = selectedModule 
    ? new Set(selectedModule.split(',').map((s: string) => s.trim().toUpperCase()))
    : null;

  // 3. 构建模型配置 Map
  const modelConfig: Record<string, any> = {};

  const modelIds = [
    { key: 'VAD', id: agent.vadModelId },
    { key: 'ASR', id: agent.asrModelId },
    { key: 'LLM', id: agent.llmModelId },
    { key: 'TTS', id: agent.ttsModelId },
    { key: 'Memory', id: agent.memModelId },
    { key: 'Intent', id: agent.intentModelId },
    { key: 'VLLM', id: agent.vllmModelId },
    { key: 'SLM', id: agent.slmModelId },
  ];

  for (const { key, id } of modelIds) {
    if (selectedModulesSet && !selectedModulesSet.has(key)) continue;
    if (!id) continue;
    
    const config = await prisma.modelConfig.findUnique({ where: { id } });
    if (config) {
      modelConfig[key] = {
        type: config.modelCode,
        provider: config.modelName,
        config: config.configJson,
      };
    }
  }

  // 4. TTS 音色配置
  if (!selectedModulesSet || selectedModulesSet.has('TTS')) {
    if (agent.ttsVoiceId) {
      const voice = await prisma.aiTtsVoice.findUnique({
        where: { id: agent.ttsVoiceId },
      });
      if (voice) {
        modelConfig['TTS'] = {
          ...modelConfig['TTS'],
          voiceName: voice.name,
          voiceConfig: voice.ttsVoice,
          language: voice.languages,
          volume: agent.ttsVolume,
          rate: agent.ttsRate,
          pitch: agent.ttsPitch,
        };
      }
    }
  }

  // 5. 上下文源
  const contextProviders = await prisma.agentContextProvider.findFirst({
    where: { agentId: agent.id },
  });
  if (contextProviders?.contextProviders) {
    modelConfig['ContextProviders'] = contextProviders.contextProviders;
  }

  // 6. 替换词
  const correctWords = await prisma.agentCorrectWordMapping.findMany({
    where: { agentId: agent.id },
    include: { file: true },
  });
  if (correctWords.length > 0) {
    modelConfig['CorrectWords'] = correctWords.map(cw => cw.file?.content || '').join('\n');
  }

  // 7. 插件配置
  const plugins = await prisma.agentPluginMapping.findMany({
    where: { agentId: agent.id },
  });
  if (plugins.length > 0) {
    modelConfig['Plugin'] = plugins.map(p => ({ id: p.pluginId, targetId: p.targetId }));
  }

  // 8. 智能体参数
  modelConfig['agentParams'] = {
    systemPrompt: agent.systemPrompt,
    summaryMemory: agent.summaryMemory,
    chatHistoryConf: agent.chatHistoryConf,
    language: agent.language,
    functions: agent.functions,
  };

  return NextResponse.json({
    code: 0,
    data: modelConfig,
  });
}
```

---

## 2.7 定时任务 — 参数缓存预热

### 文件：`src/lib/scheduled-tasks.ts`

```typescript
import { prisma } from './db';
import { cache } from './redis';

/**
 * 系统启动时预热缓存
 * 在 Next.js instrumentation.ts 或 server.js 中调用
 */
export async function warmupCaches(): Promise<void> {
  // 1. 参数缓存
  const params = await prisma.sysParams.findMany();
  if (params.length > 0) {
    const paramMap: Record<string, string> = {};
    params.forEach(p => { paramMap[p.paramCode] = p.paramValue; });
    await cache.hmset('sys:params', paramMap);
  }

  // 2. 版本检测（若版本号不同则 flushAll）
  const dbVersion = params.find(p => p.paramCode === 'system-web.version')?.paramValue || '1.0';
  const cachedVersion = await cache.get('sys:version');
  if (cachedVersion !== dbVersion) {
    await cache.flushAll();
    await cache.set('sys:version', dbVersion, 86400 * 365);
    // 重新预热
    await warmupCaches();
  }
}
```

### 文件：`src/instrumentation.ts`

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmupCaches } = await import('@/lib/scheduled-tasks');
    await warmupCaches();
  }
}
```

---

## 2.8 P2 验证清单

- [ ] `GET /api/auth/captcha` 返回 SVG 验证码
- [ ] `POST /api/auth/sms` 发送短信（或 mock 模式）
- [ ] `POST /api/auth/login` 完整登录流程（SM2解密→BCrypt校验→Token签发）
- [ ] `GET /api/auth/me` 返回当前用户
- [ ] `POST /api/auth/register` 新用户注册
- [ ] `PUT /api/auth/change-password` 修改密码
- [ ] `GET /api/auth/pub-config` 公共配置
- [ ] `GET /api/admin/users` 管理员查用户列表
- [ ] `GET /api/admin/params` 参数分页
- [ ] `POST /api/admin/params` 新增参数（验证 Redis 缓存同步）
- [ ] `GET /api/admin/dict/types` 字典类型分页
- [ ] `GET /api/admin/dict/data/type/FIRMWARE_TYPE` 按类型获取字典
- [ ] `GET /api/models/names` 模型名称列表
- [ ] `POST /api/config/agent-models` ServerSecret 鉴权获取智能体配置
