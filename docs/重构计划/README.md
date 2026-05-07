# 小智 ESP32 Server：Next.js + TypeScript 全栈重构计划

## 总览

本计划将现有四组件系统（Python WebSocket 引擎 + Java Spring Boot 后端 + Vue 2 前端 + uni-app 移动端）渐进式统一为 **Next.js 15 + TypeScript + Prisma + shadcn/ui** 全栈应用。

## 当前架构 vs 目标架构

```
当前架构:
  ESP32──Python WS Server ──(HTTP API)── Java Spring Boot ── MySQL/Redis
                │                              │
                │                    ┌─────────┴──────────┐
                │                    │                    │
                │              Vue 2 Web SPA      uni-app Mobile
                │              (22 页面)          (15 页面/13 平台)

目标架构:
  ESP32──Next.js App
              ├── WebSocket Server (port 8000)
              ├── HTTP API Routes (120+ 端点)
              ├── React Web Frontend (22 页面)
              ├── PWA Mobile
              └── Prisma ORM ── PostgreSQL/Redis
```

## 技术栈

| 层次 | 选型 | 版本 | 对标旧系统 |
|:---|:---|:---|:---|
| 框架 | Next.js (App Router) | 15.x | Vue 2 + Vue CLI |
| 语言 | TypeScript (strict) | 5.x | Python + Java + JS + TS |
| ORM | Prisma | 6.x | MyBatis-Plus 3.5.5 |
| 缓存 | ioredis | 5.x | Spring Data Redis |
| 认证 | jose (JWT) + 自实现 | — | Apache Shiro 2.0 |
| 密码 | bcryptjs | 2.x | Spring BCrypt |
| 国密 | sm-crypto | 0.3.x | sm-crypto (JS 端) |
| UI 组件 | shadcn/ui | latest | Element UI 2.15 |
| 样式 | Tailwind CSS | 4.x | SCSS |
| 国际化 | next-intl | 4.x | vue-i18n 8.x |
| WebSocket | ws | 8.x | websockets (Python) |
| VAD | onnxruntime-node | 1.x | onnxruntime (Python) |
| HTTP 客户端 | fetch (native) + ofetch | — | flyio / aiohttp / Spring RestTemplate |
| 构建 | Turborepo | 2.x | Vue CLI 5 + Maven |
| 测试 | Vitest + Playwright | latest | 无自动化测试 |
| 部署 | Docker (standalone) | — | Dockerfile-server + Dockerfile-web |

## 文件索引

| 文件 | 内容 | 阶段 | 依赖 |
|:---|:---|:---:|:---|
| [01-项目基础设施.md](./01-项目基础设施.md) | Monorepo 搭建、Prisma Schema、认证安全 | P1 | — |
| [02-核心API-系统与模型.md](./02-核心API-系统与模型.md) | 认证/系统/模型/配置/字典 API | P2 | P1 |
| [03-核心API-业务模块.md](./03-核心API-业务模块.md) | 智能体/设备/OTA/聊天/知识库/声纹/音色/替换词 API | P3 | P2 |
| [04-WebSocket-AI引擎.md](./04-WebSocket-AI引擎.md) | WS 服务器、VAD、ASR/LLM/TTS Provider、对话管线、插件系统 | P4 | P2 |
| [05-Web前端重构.md](./05-Web前端重构.md) | 22 页面 React 重写、组件映射、状态管理 | P5 | P3 |
| [06-移动端方案.md](./06-移动端方案.md) | PWA 实现、响应式设计、与 uni-app 共存策略 | P6 | P5 |
| [07-部署与运维.md](./07-部署与运维.md) | Docker、CI/CD、监控、性能优化 | P7 | P4+P5 |
| [08-附录-API清单.md](./08-附录-API清单.md) | 全部 120+ 端点签名、请求/响应 TypeScript 类型 | 参考 | — |
| [09-进度追踪.md](./09-进度追踪.md) | 可勾选的实现清单，逐功能跟踪 | 全阶段 | — |

## 实施原则

### 1. 渐进验证
每阶段产出须可独立运行测试。不允许跨阶段依赖导致无法验证。

### 2. 接口兼容
API 端点路径和请求/响应格式与原系统保持兼容，确保 ESP32 固件无需修改即可切换。

### 3. 数据库复用
数据库从 MySQL 迁移至 PostgreSQL，不修改表名/字段名，仅用 Prisma 替代 MyBatis-Plus 作为 ORM 层。迁移时需用 pg_dump/pg_restore 或 Prisma 迁移工具完成数据搬迁。

### 4. 功能完整
不遗漏任何现有功能。每条旧系统的功能都必须在计划中找到对应的实现方案。

### 5. AI 友好
每篇文档包含：
- **文件路径**：精确到文件级别的创建位置
- **接口契约**：完整的 TypeScript 类型定义
- **核心代码**：关键逻辑的伪代码或示例代码
- **测试检查点**：每节末尾的验证步骤

## 快速开始

AI 实现时应按以下顺序阅读和执行：

```
1. 阅读本 README → 理解全局
2. 阅读 01-项目基础设施.md → 搭建项目骨架
3. 阅读 09-进度追踪.md → 标记第一个任务
4. 按阶段顺序逐篇实现
5. 每完成一节，回 09-进度追踪.md 标记完成
```

## 进度预估

| 阶段 | 人日 | 累计 |
|:---:|:---:|:---:|
| P1 基础设施 | 10 | 10 |
| P2 核心 API 1 | 15 | 25 |
| P3 核心 API 2 | 20 | 45 |
| P4 WebSocket 引擎 | 20 | 65 |
| P5 Web 前端 | 20 | 85 |
| P6 移动端 | 10 | 95 |
| P7 部署运维 | 8 | 103 |
| **合计** | **103** | |
