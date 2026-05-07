# 第三阶段：核心 API 迁移（下）—— 业务模块

> **目标**：迁移智能体、设备、OTA、聊天记录、知识库、声纹、音色克隆、替换词、服务端管理共 78 个 API 端点。
> **验证标准**：所有端点可正常 CRUD，级联删除逻辑正确，RAGFlow 适配器可用。

---

## 3.1 API Route 文件映射表

### 智能体模块（`src/app/api/agents/`）

| 端点 | 文件路径 |
|:---|:---|
| `GET /api/agents` | `src/app/api/agents/route.ts` |
| `POST /api/agents` | `src/app/api/agents/route.ts` |
| `GET /api/agents/all` | `src/app/api/agents/all/route.ts` |
| `GET /api/agents/[id]` | `src/app/api/agents/[id]/route.ts` |
| `PUT /api/agents/[id]` | `src/app/api/agents/[id]/route.ts` |
| `DELETE /api/agents/[id]` | `src/app/api/agents/[id]/route.ts` |
| `GET /api/agents/[id]/sessions` | `src/app/api/agents/[id]/sessions/route.ts` |
| `GET /api/agents/[id]/chat-history/[sessionId]` | `src/app/api/agents/[id]/chat-history/[sessionId]/route.ts` |
| `GET /api/agents/[id]/chat-history/user` | `src/app/api/agents/[id]/chat-history/user/route.ts` |
| `GET /api/agents/[id]/chat-history/audio` | `src/app/api/agents/[id]/chat-history/audio/route.ts` |
| `POST /api/agents/audio/[audioId]` | `src/app/api/agents/audio/[audioId]/route.ts` |
| `GET /api/agents/play/[uuid]` | `src/app/api/agents/play/[uuid]/route.ts` |
| `PUT /api/agents/[id]/memory` | `src/app/api/agents/[id]/memory/route.ts` |
| `POST /api/agents/chat-summary/[sessionId]` | `src/app/api/agents/chat-summary/[sessionId]/route.ts` |
| `POST /api/agents/chat-title/[sessionId]` | `src/app/api/agents/chat-title/[sessionId]/route.ts` |
| `GET /api/agents/tags` | `src/app/api/agents/tags/route.ts` |
| `POST /api/agents/tags` | `src/app/api/agents/tags/route.ts` |
| `DELETE /api/agents/tags/[id]` | `src/app/api/agents/tags/[id]/route.ts` |
| `GET /api/agents/[id]/tags` | `src/app/api/agents/[id]/tags/route.ts` |
| `PUT /api/agents/[id]/tags` | `src/app/api/agents/[id]/tags/route.ts` |

### 声纹模块（`src/app/api/agents/voice-prints/`）

| 端点 | 文件路径 |
|:---|:---|
| `GET /api/agents/[id]/voice-prints` | `src/app/api/agents/[id]/voice-prints/route.ts` |
| `POST /api/agents/voice-prints` | `src/app/api/agents/voice-prints/route.ts` |
| `PUT /api/agents/voice-prints/[id]` | `src/app/api/agents/voice-prints/[id]/route.ts` |
| `DELETE /api/agents/voice-prints/[id]` | `src/app/api/agents/voice-prints/[id]/route.ts` |

### MCP模块（`src/app/api/agents/[id]/mcp/`）

| 端点 | 文件路径 |
|:---|:---|
| `GET /api/agents/[id]/mcp/address` | `src/app/api/agents/[id]/mcp/address/route.ts` |
| `GET /api/agents/[id]/mcp/tools` | `src/app/api/agents/[id]/mcp/tools/route.ts` |

---

## 3.2 智能体核心 API 实现

### 3.2.1 创建智能体 `POST /api/agents`

```typescript
// src/app/api/agents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';

export async function POST(request: NextRequest) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await request.json();
  const userId = auth.payload!.userId;

  const agent = await prisma.aiAgent.create({
    data: {
      id: generateSnowflakeId(),
      agentCode: body.agentCode || `agent_${Date.now()}`,
      agentName: body.agentName || '新智能体',
      asrModelId: body.asrModelId ? BigInt(body.asrModelId) : null,
      vadModelId: body.vadModelId ? BigInt(body.vadModelId) : null,
      llmModelId: body.llmModelId ? BigInt(body.llmModelId) : null,
      ttsModelId: body.ttsModelId ? BigInt(body.ttsModelId) : null,
      memModelId: body.memModelId ? BigInt(body.memModelId) : null,
      intentModelId: body.intentModelId ? BigInt(body.intentModelId) : null,
      vllmModelId: body.vllmModelId ? BigInt(body.vllmModelId) : null,
      systemPrompt: body.systemPrompt || '',
      userId: userId,
      creator: userId,
      sort: body.sort || 0,
    },
  });

  return NextResponse.json({ code: 0, data: agent });
}
```

### 3.2.2 更新智能体 `PUT /api/agents/[id]`

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const body = await request.json();
  
  // 权限校验：只能修改自己的智能体
  const existing = await prisma.aiAgent.findUnique({
    where: { id: BigInt(params.id) },
  });
  if (!existing || existing.userId !== auth.payload!.userId) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  const agent = await prisma.aiAgent.update({
    where: { id: BigInt(params.id) },
    data: {
      agentName: body.agentName,
      asrModelId: body.asrModelId ? BigInt(body.asrModelId) : null,
      vadModelId: body.vadModelId ? BigInt(body.vadModelId) : null,
      llmModelId: body.llmModelId ? BigInt(body.llmModelId) : null,
      ttsModelId: body.ttsModelId ? BigInt(body.ttsModelId) : null,
      memModelId: body.memModelId ? BigInt(body.memModelId) : null,
      intentModelId: body.intentModelId ? BigInt(body.intentModelId) : null,
      vllmModelId: body.vllmModelId ? BigInt(body.vllmModelId) : null,
      slmModelId: body.slmModelId ? BigInt(body.slmModelId) : null,
      ttsVoiceId: body.ttsVoiceId ? BigInt(body.ttsVoiceId) : null,
      ttsLanguage: body.ttsLanguage,
      ttsVolume: body.ttsVolume,
      ttsRate: body.ttsRate,
      ttsPitch: body.ttsPitch,
      systemPrompt: body.systemPrompt,
      summaryMemory: body.summaryMemory,
      chatHistoryConf: body.chatHistoryConf,
      functions: body.functions,
      updater: auth.payload!.userId,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: agent });
}
```

### 3.2.3 删除智能体（级联删除）`DELETE /api/agents/[id]`

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const agentId = BigInt(params.id);

  // 权限校验
  const existing = await prisma.aiAgent.findUnique({ where: { id: agentId } });
  if (!existing || existing.userId !== auth.payload!.userId) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  // 级联删除（使用事务）
  await prisma.$transaction(async (tx) => {
    // 1. 删除设备关联
    await tx.aiDevice.updateMany({
      where: { agentId },
      data: { agentId: BigInt(0), isBound: 0 },
    });
    // 2. 删除聊天记录
    await tx.agentChatHistory.deleteMany({ where: { agentId } });
    // 3. 删除声纹
    await tx.agentVoicePrint.deleteMany({ where: { agentId } });
    // 4. 删除标签关联
    await tx.agentTagRelation.deleteMany({ where: { agentId } });
    // 5. 删除上下文源
    await tx.agentContextProvider.deleteMany({ where: { agentId } });
    // 6. 删除插件关联
    await tx.agentPluginMapping.deleteMany({ where: { agentId } });
    // 7. 删除替换词关联
    await tx.agentCorrectWordMapping.deleteMany({ where: { agentId } });
    // 8. 删除智能体
    await tx.aiAgent.delete({ where: { id: agentId } });
  });

  return NextResponse.json({ code: 0, msg: '删除成功' });
}
```

### 3.2.4 获取智能体详情 `GET /api/agents/[id]`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  const agent = await prisma.aiAgent.findUnique({
    where: { id: BigInt(params.id) },
    include: {
      tags: { include: { tag: true } },
      contextProviders: true,
      correctWords: true,
      plugins: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ code: 404, msg: '智能体不存在' });
  }

  // 用户只能看自己的智能体（管理员除外）
  if (agent.userId !== auth.payload!.userId && auth.payload!.superAdmin !== 1) {
    return NextResponse.json({ code: 403, msg: '无权限' }, { status: 403 });
  }

  return NextResponse.json({ code: 0, data: agent });
}
```

### 3.2.5 聊天记录上报 `POST /api/chat/report`

```typescript
// src/app/api/chat/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { generateSnowflakeId } from '@/lib/snowflake';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await request.json();
  const { agentId, sessionId, chatType, content, audio, macAddress } = body;

  let audioId: string | null = null;

  // 如果有音频数据（Base64），解码存入数据库
  if (audio) {
    audioId = createHash('md5').update(audio).digest('hex').slice(0, 32);
    const audioBuffer = Buffer.from(audio, 'base64');

    // 检查是否已存在
    const existing = await prisma.agentChatAudio.findUnique({
      where: { audioId },
    });
    if (!existing) {
      await prisma.agentChatAudio.create({
        data: {
          audioId,
          audioData: audioBuffer,
        },
      });
    }
  }

  // 保存聊天记录
  await prisma.agentChatHistory.create({
    data: {
      id: generateSnowflakeId(),
      agentId: BigInt(agentId),
      sessionId,
      chatType: chatType || 0,
      content,
      audioId,
      macAddress,
    },
  });

  return NextResponse.json({ code: 0, msg: '上报成功' });
}
```

### 3.2.6 生成会话总结 `POST /api/agents/chat-summary/[sessionId]`

```typescript
// src/app/api/agents/chat-summary/[sessionId]/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await request.json();
  const { agentId } = body;

  // 1. 获取会话聊天记录
  const messages = await prisma.agentChatHistory.findMany({
    where: { agentId: BigInt(agentId), sessionId: params.sessionId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const conversationText = messages.map(m => {
    const role = m.chatType === 1 ? '用户' : 'AI';
    return `${role}: ${m.content || ''}`;
  }).join('\n');

  // 2. 调用 LLM 生成总结（使用智能体的 LLM 配置）
  const agent = await prisma.aiAgent.findUnique({
    where: { id: BigInt(agentId) },
  });
  const llmConfig = agent?.llmModelId
    ? await prisma.modelConfig.findUnique({ where: { id: agent.llmModelId } })
    : null;

  let summary = '';
  if (llmConfig?.configJson) {
    const config = llmConfig.configJson as any;
    const response = await fetch(`${config.api_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model_name,
        messages: [
          { role: 'system', content: '请用一段话总结以下对话内容。' },
          { role: 'user', content: conversationText },
        ],
        max_tokens: 200,
      }),
    });
    const result = await response.json();
    summary = result.choices?.[0]?.message?.content || '';
  }

  // 3. 更新智能体的 summary_memory
  await prisma.aiAgent.update({
    where: { id: BigInt(agentId) },
    data: {
      summaryMemory: summary,
      updateDate: new Date(),
    },
  });

  return NextResponse.json({ code: 0, data: { summary } });
}
```

### 3.2.7 生成会话标题 `POST /api/agents/chat-title/[sessionId]`

```typescript
// src/app/api/agents/chat-title/[sessionId]/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await request.json();
  const { agentId } = body;

  // 获取第一条用户消息作为标题基础
  const firstMessage = await prisma.agentChatHistory.findFirst({
    where: {
      agentId: BigInt(agentId),
      sessionId: params.sessionId,
      chatType: 1, // 用户消息
    },
    orderBy: { createdAt: 'asc' },
  });

  const title = firstMessage?.content?.slice(0, 50) || '新对话';

  // 可以使用 LLM 生成更好的标题（与总结类似）
  // 此处简化处理

  // 保存标题
  const existing = await prisma.agentChatTitle.findFirst({
    where: { agentId: BigInt(agentId), sessionId: params.sessionId },
  });

  if (existing) {
    await prisma.agentChatTitle.update({
      where: { id: existing.id },
      data: { title },
    });
  } else {
    await prisma.agentChatTitle.create({
      data: {
        id: generateSnowflakeId(),
        agentId: BigInt(agentId),
        sessionId: params.sessionId,
        title,
      },
    });
  }

  return NextResponse.json({ code: 0, data: { title } });
}
```

---

## 3.3 设备管理核心 API

### 3.3.1 设备注册 `POST /api/devices/register`

```typescript
// src/app/api/devices/register/route.ts
export async function POST(request: NextRequest) {
  const { macAddress, board, appVersion, chipInfo } = await request.json();

  if (!macAddress) {
    return NextResponse.json({ code: 400, msg: 'MAC地址不能为空' });
  }

  // 检查设备是否已存在
  let device = await prisma.aiDevice.findFirst({
    where: { macAddress },
  });

  if (device && device.isBound === 1) {
    return NextResponse.json({ code: 400, msg: '设备已绑定' });
  }

  // 生成6位激活码
  const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Redis 缓存24小时
  await cache.set(`sys:device:captcha:${activationCode}`, macAddress, 86400);

  if (!device) {
    device = await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress,
        board,
        appVersion,
        chipInfo,
        activationCode,
        isBound: 0,
      },
    });
  } else {
    await prisma.aiDevice.update({
      where: { id: device.id },
      data: { activationCode, board, appVersion, chipInfo },
    });
  }

  return NextResponse.json({
    code: 0,
    data: { activationCode, deviceId: device.id.toString() },
  });
}
```

### 3.3.2 设备绑定 `POST /api/devices/bind/[agentId]/[code]`

```typescript
// src/app/api/devices/bind/[agentId]/[code]/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string; code: string } }
) {
  const auth = await authenticate('oauth2', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 401, msg: auth.error }, { status: 401 });
  }

  // 验证激活码
  const macAddress = await cache.get(`sys:device:captcha:${params.code}`);
  if (!macAddress) {
    return NextResponse.json({ code: 400, msg: '激活码无效或已过期' });
  }

  // 查找设备
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress },
  });

  if (!device) {
    return NextResponse.json({ code: 404, msg: '设备不存在' });
  }

  if (device.isBound === 1) {
    return NextResponse.json({ code: 400, msg: '设备已绑定到其他智能体' });
  }

  // 绑定设备
  await prisma.aiDevice.update({
    where: { id: device.id },
    data: {
      agentId: BigInt(params.agentId),
      userId: auth.payload!.userId,
      isBound: 1,
    },
  });

  // 清除激活码
  await cache.del(`sys:device:captcha:${params.code}`);

  return NextResponse.json({ code: 0, msg: '绑定成功' });
}
```

### 3.3.3 OTA 版本检查（核心）`POST /api/ota/check`

```typescript
// src/app/api/ota/check/route.ts
import { issueDeviceToken } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  const deviceId = request.headers.get('Device-Id') || '';
  const clientId = request.headers.get('Client-Id') || '';
  const body = await request.json();
  const { chipInfo, application } = body;

  // 查找设备
  let device = await prisma.aiDevice.findFirst({
    where: { macAddress: deviceId },
  });

  // 自动注册
  if (!device) {
    device = await prisma.aiDevice.create({
      data: {
        id: generateSnowflakeId(),
        macAddress: deviceId,
        isBound: 0,
        appVersion: application?.version,
        chipInfo: JSON.stringify(chipInfo),
      },
    });
  }

  // 生成 WebSocket Token
  const wsToken = await issueDeviceToken(deviceId);

  // 获取最新固件信息
  const firmwareType = device.firmwareType || 'default';
  const latestFirmware = await prisma.aiOta.findFirst({
    where: { type: firmwareType },
    orderBy: { createDate: 'desc' },
  });

  // 从参数获取 WebSocket/MQTT 地址
  const wsHost = (await cache.hget('sys:params', 'server.ws_host')) || 'ws://localhost:8000';
  const mqttHost = (await cache.hget('sys:params', 'server.mqtt_gateway')) || '';

  return NextResponse.json({
    code: 0,
    data: {
      active: device.isBound === 1,
      deviceId: device.id.toString(),
      wsAddress: `${wsHost}/xiaozhi/v1/`,
      mqttAddress: mqttHost,
      wsToken,
      firmware: latestFirmware ? {
        version: latestFirmware.version,
        url: `/api/ota/mag/download/${latestFirmware.id}`,
        size: latestFirmware.fileSize,
        md5: latestFirmware.md5,
      } : null,
    },
  });
}
```

---

## 3.4 RAGFlow 知识库适配器

### 文件：`src/lib/ragflow-client.ts`

```typescript
/**
 * RAGFlow HTTP API 客户端
 * 对标 Java RAGFlowClient
 */
export class RAGFlowClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`RAGFlow API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  // 创建知识库
  async createDataset(name: string, description?: string) {
    return this.request('/api/v1/datasets', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  // 上传文档
  async uploadDocument(datasetId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/api/v1/datasets/${datasetId}/documents`, {
      method: 'POST',
      body: formData,
      headers: {}, // 清除 Content-Type，让 fetch 自动设置 multipart
    });
  }

  // 解析文档
  async parseDocument(datasetId: string, documentId: string) {
    return this.request(`/api/v1/datasets/${datasetId}/chunks`, {
      method: 'POST',
      body: JSON.stringify({ document_ids: [documentId] }),
    });
  }

  // 文档状态查询
  async getDocumentStatus(datasetId: string, documentId: string) {
    return this.request(`/api/v1/datasets/${datasetId}/documents/${documentId}`);
  }

  // 文档切片列表
  async listChunks(datasetId: string, documentId: string, page: number = 1, pageSize: number = 20, keywords?: string) {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (keywords) query.set('keywords', keywords);
    return this.request(`/api/v1/datasets/${datasetId}/documents/${documentId}/chunks?${query}`);
  }

  // 召回测试
  async retrievalTest(datasetId: string, query: string, topK: number = 5) {
    return this.request(`/api/v1/datasets/${datasetId}/retrieval`, {
      method: 'POST',
      body: JSON.stringify({ question: query, top_k: topK }),
    });
  }

  // 删除知识库
  async deleteDataset(datasetId: string) {
    return this.request(`/api/v1/datasets/${datasetId}`, { method: 'DELETE' });
  }

  // 删除文档
  async deleteDocument(datasetId: string, documentId: string) {
    return this.request(`/api/v1/datasets/${datasetId}/documents/${documentId}`, { method: 'DELETE' });
  }
}
```

### 文件：`src/lib/ragflow-factory.ts`

```typescript
/**
 * RAGFlow 适配器工厂
 * 对标 Java KnowledgeBaseAdapterFactory
 */
import { RAGFlowClient } from './ragflow-client';
import { prisma } from './db';

export async function createRAGFlowClient(modelId: bigint): Promise<RAGFlowClient> {
  const modelConfig = await prisma.modelConfig.findUnique({
    where: { id: modelId },
  });

  if (!modelConfig?.configJson) {
    throw new Error('RAGFlow 模型配置不存在');
  }

  const config = modelConfig.configJson as any;
  return new RAGFlowClient(config.base_url, config.api_key);
}
```

### 文件：定时任务 — `src/lib/scheduled-tasks.ts`（追加）

```typescript
/**
 * 文档状态同步定时任务（每30秒）
 * 对标 Java DocumentStatusSyncTask
 */
export async function syncDocumentStatus(): Promise<void> {
  const runningDocs = await prisma.document.findMany({
    where: { status: 'RUNNING' },
    include: { knowledgeBase: true },
  });

  for (const doc of runningDocs) {
    try {
      const client = await createRAGFlowClient(doc.knowledgeBase.ragModelId);
      const status = await client.getDocumentStatus(
        doc.knowledgeBase.datasetId,
        doc.documentId
      );

      if (status.data?.status !== doc.status) {
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            status: status.data.status,
            chunkCount: status.data.chunk_count,
            tokenCount: status.data.token_count,
            progress: status.data.progress,
          },
        });
      }
    } catch (e) {
      console.error(`Failed to sync doc ${doc.documentId}:`, e);
    }
  }
}

// 启动定时任务
export function startScheduledTasks(): void {
  // 每30秒执行一次文档状态同步
  setInterval(syncDocumentStatus, 30000);
  console.log('Scheduled tasks started.');
}
```

---

## 3.5 P3 验证清单

- [ ] 智能体 CRUD 完整流程（创建→查看→修改→删除→验证级联删除）
- [ ] 智能体标签增删
- [ ] 聊天记录上报（含 Base64 音频）
- [ ] 聊天记录查询（按会话）
- [ ] 会话总结生成（LLM 调用）
- [ ] 会话标题生成
- [ ] 音频播放（UUID 临时链接）
- [ ] 声纹 CRUD
- [ ] MCP 接入点/工具查询
- [ ] 模板 CRUD
- [ ] 设备注册 + 绑定 + 解绑 + 手动添加
- [ ] OTA 版本检查（返回 WS Token + 固件信息）
- [ ] 固件 CRUD + 上传 + 下载（限3次）
- [ ] 知识库 CRUD + 文档上传 + 解析 + 切片 + 召回测试
- [ ] 文档状态定时同步
- [ ] 音色 CRUD
- [ ] 声音克隆上传 + 训练触发
- [ ] 替换词文件 CRUD
- [ ] 服务端列表 + 指令发送
