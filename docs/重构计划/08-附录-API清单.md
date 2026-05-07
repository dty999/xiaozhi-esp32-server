# 图录：全API端点清单

> 本图录罗列全部120+个API端点，每端点附请求/响应类型与对接旧系统映射，供AI实现时逐一对标。

---

## 1. 认证模块 (`/api/auth/*`)

| # | 方法 | 路径 | Request Type | Response Type | 旧系统 |
|:---:|:---|:---|:---|:---|:---|
| 1 | GET | `/api/auth/captcha` | `{ uuid: string }` (query) | `string` (SVG) | `GET /user/captcha` |
| 2 | POST | `/api/auth/sms` | `{ phone, captcha, captchaId }` | `{ code, msg }` | `POST /user/smsVerification` |
| 3 | POST | `/api/auth/login` | `{ username, password, captchaId }` | `{ token, userInfo }` | `POST /user/login` |
| 4 | POST | `/api/auth/register` | `{ username?, password, phone?, mobileCaptcha?, areaCode? }` | `{ userId, username }` | `POST /user/register` |
| 5 | GET | `/api/auth/me` | — | `UserInfo` | `GET /user/info` |
| 6 | PUT | `/api/auth/change-password` | `{ oldPassword, newPassword }` | `{ code, msg }` | `PUT /user/change-password` |
| 7 | PUT | `/api/auth/reset-password` | `{ phone, password, code, captchaId }` | `{ code, msg }` | `PUT /user/retrieve-password` |
| 8 | GET | `/api/auth/pub-config` | — | `{ sm2PublicKey, allowUserRegister, ... }` | `GET /user/pub-config` |

---

## 2. 管理员模块 (`/api/admin/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 9 | GET | `/api/admin/users?page=&limit=&mobile=` | 分页查询用户 |
| 10 | PUT | `/api/admin/users/[id]` | 重置密码 |
| 11 | DELETE | `/api/admin/users/[id]` | 删除用户 |
| 12 | PUT | `/api/admin/users/status` | 批量修改状态 `{ status, userIds[] }` |
| 13 | GET | `/api/admin/devices?keywords=&page=&limit=` | 管理员查看所有设备 |

---

## 3. 参数管理 (`/api/admin/params`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 14 | GET | `/api/admin/params?page=&limit=&paramCode=` | 分页查询（敏感值脱敏） |
| 15 | GET | `/api/admin/params/[id]` | 详情 |
| 16 | POST | `/api/admin/params` | 新增 `{ paramCode, paramValue, valueType, remark }` |
| 17 | PUT | `/api/admin/params/[id]` | 修改 |
| 18 | POST | `/api/admin/params/batch-delete` | 批量删除 `{ ids: number[] }` |

---

## 4. 字典管理 (`/api/admin/dict/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 19 | GET | `/api/admin/dict/types?dictType=&dictName=&page=&limit=` | 字典类型分页 |
| 20 | GET | `/api/admin/dict/types/[id]` | 类型详情 |
| 21 | POST | `/api/admin/dict/types` | 新增类型 |
| 22 | PUT | `/api/admin/dict/types/[id]` | 修改类型 |
| 23 | POST | `/api/admin/dict/types/batch-delete` | 批量删除 |
| 24 | GET | `/api/admin/dict/data?dictTypeId=&dictLabel=&dictValue=&page=&limit=` | 数据分页 |
| 25 | GET | `/api/admin/dict/data/[id]` | 数据详情 |
| 26 | POST | `/api/admin/dict/data` | 新增数据 |
| 27 | PUT | `/api/admin/dict/data/[id]` | 修改数据 |
| 28 | POST | `/api/admin/dict/data/batch-delete` | 批量删除 |
| 29 | GET | `/api/admin/dict/data/type/[type]` | 按类型获取（无需登录） |

---

## 5. 模型配置 (`/api/models/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 30 | GET | `/api/models?modelType=&modelName=&page=&limit=` | 分页查询模型 |
| 31 | GET | `/api/models/names?modelType=&modelName=` | 模型名称列表 |
| 32 | GET | `/api/models/llm-names?modelName=` | LLM编码列表 |
| 33 | GET | `/api/models/[type]/providers` | 供应商列表 |
| 34 | POST | `/api/models/[type]/[provideCode]` | 新增模型配置 |
| 35 | PUT | `/api/models/[type]/[provideCode]/[id]` | 编辑模型配置 |
| 36 | DELETE | `/api/models/[id]` | 删除模型配置 |
| 37 | GET | `/api/models/[id]` | 模型配置详情 |
| 38 | PUT | `/api/models/[id]/enable/[status]` | 启用/禁用 (1/0) |
| 39 | PUT | `/api/models/[id]/default` | 设为默认 |
| 40 | GET | `/api/models/[id]/voices?voiceName=` | TTS音色列表 |

---

## 6. 模型供应器 (`/api/models/providers`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 41 | GET | `/api/models/providers?name=&modelType=&page=&limit=` | 供应器分页 |
| 42 | POST | `/api/models/providers` | 新增 |
| 43 | PUT | `/api/models/providers/[id]` | 编辑 |
| 44 | POST | `/api/models/providers/batch-delete` | 批量删除 |
| 45 | GET | `/api/models/providers/plugins` | 插件名称列表 |

---

## 7. 配置下发 (`/api/config/*`) — ServerSecret 鉴权

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 46 | POST | `/api/config/server-base` | 服务端获取全部配置 |
| 47 | POST | `/api/config/agent-models` | 智能体模型配置 `{ macAddress, clientId, selectedModule? }` |
| 48 | POST | `/api/config/correct-words` | 替换词 `{ agentId }` |

---

## 8. 智能体 (`/api/agents/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 49 | GET | `/api/agents?keyword=&searchType=` | 用户智能体列表 |
| 50 | GET | `/api/agents/all?page=&limit=` | 管理员列表 |
| 51 | GET | `/api/agents/[id]` | 详情（含关联数据） |
| 52 | POST | `/api/agents` | 创建 |
| 53 | PUT | `/api/agents/[id]` | 更新 |
| 54 | DELETE | `/api/agents/[id]` | 删除（级联） |
| 55 | GET | `/api/agents/[id]/sessions?page=&limit=` | 会话列表 |
| 56 | GET | `/api/agents/[id]/chat-history/[sessionId]` | 聊天记录 |
| 57 | GET | `/api/agents/[id]/chat-history/user` | 最近50条 |
| 58 | GET | `/api/agents/[id]/chat-history/audio` | 音频内容 |
| 59 | POST | `/api/agents/audio/[audioId]` | 音频下载UUID |
| 60 | GET | `/api/agents/play/[uuid]` | 播放音频 |
| 61 | PUT | `/api/agents/[id]/memory` | 更新记忆(server鉴权) |
| 62 | POST | `/api/agents/chat-summary/[sessionId]` | 生成总结(server鉴权) |
| 63 | POST | `/api/agents/chat-title/[sessionId]` | 生成标题(server鉴权) |
| 64 | GET | `/api/agents/tags` | 所有标签 |
| 65 | POST | `/api/agents/tags` | 创建标签 |
| 66 | DELETE | `/api/agents/tags/[id]` | 删除标签 |
| 67 | GET | `/api/agents/[id]/tags` | 智能体标签 |
| 68 | PUT | `/api/agents/[id]/tags` | 保存标签 |

---

## 9. 聊天记录 (`/api/chat/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 69 | POST | `/api/chat/report` | 上报(server鉴权) `{ agentId, sessionId, chatType, content, audio?, macAddress }` |
| 70 | POST | `/api/chat/download-url/[agentId]/[sessionId]` | 下载链接UUID |
| 71 | GET | `/api/chat/download/[uuid]/current` | 下载当前会话 |
| 72 | GET | `/api/chat/download/[uuid]/previous` | 下载含历史 |

---

## 10. 声纹 (`/api/agents/voice-prints`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 73 | GET | `/api/agents/[id]/voice-prints` | 声纹列表 |
| 74 | POST | `/api/agents/voice-prints` | 创建 `{ agentId, sourceName, audioId, introduce }` |
| 75 | PUT | `/api/agents/voice-prints/[id]` | 更新 |
| 76 | DELETE | `/api/agents/voice-prints/[id]` | 删除 |

---

## 11. MCP (`/api/agents/[id]/mcp`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 77 | GET | `/api/agents/[id]/mcp/address` | MCP接入点 |
| 78 | GET | `/api/agents/[id]/mcp/tools` | MCP工具列表 |

---

## 12. 模板 (`/api/templates`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 79 | GET | `/api/templates` | 用户模板列表 |
| 80 | GET | `/api/templates/page?page=&limit=` | 管理员分页 |
| 81 | GET | `/api/templates/[id]` | 模板详情 |
| 82 | POST | `/api/templates` | 创建模板 |
| 83 | PUT | `/api/templates/[id]` | 更新模板 |
| 84 | DELETE | `/api/templates/[id]` | 删除（重排序） |
| 85 | POST | `/api/templates/batch-delete` | 批量删除 |

---

## 13. 设备 (`/api/devices`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 86 | POST | `/api/devices/register` | 注册 `{ macAddress, board, appVersion, chipInfo }` |
| 87 | POST | `/api/devices/bind/[agentId]/[code]` | 绑定 |
| 88 | GET | `/api/devices/bind/[agentId]` | 已绑列表+状态 |
| 89 | POST | `/api/devices/unbind` | 解绑 `{ deviceId }` |
| 90 | PUT | `/api/devices/[id]` | 更新 `{ alias?, otaAutoUpdate?, firmwareType? }` |
| 91 | POST | `/api/devices/manual-add` | 手动添加 `{ macAddress, board, appVersion, deviceType }` |
| 92 | POST | `/api/devices/[id]/tools` | 设备工具列表 |
| 93 | POST | `/api/devices/[id]/tools/call` | 调用工具 |

---

## 14. OTA (`/api/ota/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 94 | POST | `/api/ota/check` | 版本检查（ESP32主要接口） |
| 95 | POST | `/api/ota/activate` | 快速激活检查 |
| 96 | GET | `/api/ota/mag?page=&limit=` | 固件分页 |
| 97 | GET | `/api/ota/mag/[id]` | 固件详情 |
| 98 | POST | `/api/ota/mag` | 新增 |
| 99 | DELETE | `/api/ota/mag/[id]` | 删除 |
| 100 | PUT | `/api/ota/mag/[id]` | 修改 |
| 101 | GET | `/api/ota/mag/[id]/download-url` | 下载UUID |
| 102 | GET | `/api/ota/mag/download/[uuid]` | 下载（限3次） |
| 103 | POST | `/api/ota/mag/upload` | 上传固件(.bin/.apk) |
| 104 | POST | `/api/ota/mag/upload-assets` | 上传资源(≤20MB, 限50次/日) |

---

## 15. 知识库 (`/api/knowledge/*`)

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 105 | GET | `/api/knowledge/datasets?name=&page=&page_size=` | 知识库分页 |
| 106 | GET | `/api/knowledge/datasets/[id]` | 详情 |
| 107 | POST | `/api/knowledge/datasets` | 创建 |
| 108 | PUT | `/api/knowledge/datasets/[id]` | 更新 |
| 109 | DELETE | `/api/knowledge/datasets/[id]` | 级联删除 |
| 110 | DELETE | `/api/knowledge/datasets/batch` | 批量删除 `?ids=1,2,3` |
| 111 | GET | `/api/knowledge/datasets/[id]/documents?name=&page=&page_size=` | 文档列表 |
| 112 | GET | `/api/knowledge/datasets/[id]/documents/status/[status]` | 按状态查 |
| 113 | POST | `/api/knowledge/datasets/[id]/documents` | 上传文档(multipart) |
| 114 | DELETE | `/api/knowledge/datasets/[id]/documents/[docId]` | 删除文档 |
| 115 | POST | `/api/knowledge/datasets/[id]/chunks` | 解析文档 `{ documentId }` |
| 116 | GET | `/api/knowledge/datasets/[id]/documents/[docId]/chunks?page=&page_size=&keywords=` | 切片列表 |
| 117 | POST | `/api/knowledge/datasets/[id]/retrieval-test` | 召回测试 `{ query, topK }` |

---

## 16. 音色与克隆

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 118 | GET | `/api/timbre?ttsModelId=&name=&page=&limit=` | 音色分页 |
| 119 | POST | `/api/timbre` | 新增音色 |
| 120 | PUT | `/api/timbre/[id]` | 修改音色 |
| 121 | POST | `/api/timbre/batch-delete` | 批量删除 |
| 122 | GET | `/api/voice-clone?page=&limit=` | 克隆记录分页 |
| 123 | POST | `/api/voice-clone/upload` | 上传音频(formData) |
| 124 | POST | `/api/voice-clone/[id]/name` | 修改名称 `{ name }` |
| 125 | POST | `/api/voice-clone/audio/[id]` | 获取播放UUID |
| 126 | GET | `/api/voice-clone/play/[uuid]` | 播放音频 |
| 127 | POST | `/api/voice-clone/train` | 执行训练 `{ id }` |

---

## 17. 替换词与服务端

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 128 | POST | `/api/correct-word/files` | 创建替换词文件 |
| 129 | PUT | `/api/correct-word/files/[id]` | 修改文件 |
| 130 | GET | `/api/correct-word/files?page=&pageSize=` | 分页获取 |
| 131 | GET | `/api/correct-word/files/select` | 所有文件 |
| 132 | GET | `/api/correct-word/files/[id]/download` | 下载 |
| 133 | DELETE | `/api/correct-word/files/[id]` | 删除 |
| 134 | POST | `/api/correct-word/files/batch-delete` | 批量删除 |
| 135 | GET | `/api/server/list` | WS服务器列表 |
| 136 | POST | `/api/server/emit-action` | 发送指令 `{ address, action }` |

---

## 18. 健康检查

| # | 方法 | 路径 | 说明 |
|:---:|:---|:---|:---|
| 137 | GET | `/api/health` | 数据库 + Redis 健康检查 |

---

**共计 137 个 API 端点**，对应旧系统 120+ 端点（部分端点因模块合并而有增减）。
