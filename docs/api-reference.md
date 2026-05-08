# 智控台 API 参考文档

> 基于 Next.js 15 (App Router)，共 22 个 API Route。
> 基础路径：`http://localhost:3000`

---

## 目录

- [通用约定](#通用约定)
- [一、认证模块（Auth）](#一认证模块auth)
- [二、管理后台——用户管理](#二管理后台用户管理)
- [三、管理后台——系统参数](#三管理后台系统参数)
- [四、管理后台——字典管理](#四管理后台字典管理)
- [五、模型管理](#五模型管理)
- [六、智能体配置下发](#六智能体配置下发)

---

## 通用约定

### 响应格式

```json5
// 成功（有数据）
{ "code": 0, "msg": "success", "data": { ... } }

// 成功（无数据）
{ "code": 0, "msg": "操作成功" }

// 分页
{ "code": 0, "data": { "total": 100, "page": 1, "limit": 10, "list": [...] } }

// 错误
{ "code": 400, "msg": "错误描述" }
```

### 鉴权方式

| 方式 | 说明 | 请求头 |
|:---|:---|:---|
| `anon` | 无需鉴权 | — |
| `oauth2` | 用户 JWT Token | `Authorization: Bearer <token>` |
| `server` | 服务端密钥 | `Authorization: Bearer <server_secret>` |
| `oauth2 + superAdmin` | 需要管理员权限 | `Authorization: Bearer <token>` + `superAdmin === 1` |

### 状态码

| code | 含义 |
|:---|:---|
| `0` | 成功 |
| `400` | 参数错误 / 业务错误 |
| `401` | 未认证 / Token 过期 |
| `403` | 无权限（非管理员） |
| `404` | 资源不存在 |
| `500` | 服务器内部错误 |

---

## 一、认证模块（Auth）

### 1.1 获取验证码

```
GET /api/auth/captcha
```

**鉴权**：`anon`

**响应**：`Content-Type: image/svg+xml`

| 响应头 | 说明 |
|:---|:---|
| `X-Captcha-Uuid` | 验证码 UUID，后续请求需携带 |
| `Cache-Control` | `no-store` |

**示例**：
```bash
curl -v http://localhost:3000/api/auth/captcha
# 返回 SVG 图片，头中含 X-Captcha-Uuid
```

---

### 1.2 发送短信验证码

```
POST /api/auth/sms
```

**鉴权**：`anon`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `phone` | string | ✅ | 手机号 |
| `captcha` | string | ✅ | 图形验证码 |
| `captchaId` | string | ✅ | 验证码 UUID |

**响应**：
```json
{ "code": 0, "msg": "验证码已发送" }
```

---

### 1.3 登录

```
POST /api/auth/login
```

**鉴权**：`anon`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `username` | string | ✅ | 用户名或手机号 |
| `password` | string | ✅ | SM2 加密后的 `captcha:password` |
| `captchaId` | string | 否 | 验证码 UUID |

**响应**：
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "jwt_token_string",
    "userInfo": {
      "id": "123456789",
      "username": "admin",
      "realName": "Super Admin",
      "email": null,
      "mobile": null,
      "superAdmin": 1,
      "status": 1,
      "headUrl": null
    }
  }
}
```

---

### 1.4 注册

```
POST /api/auth/register
```

**鉴权**：`anon`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `username` | string | 否 | 用户名（不传则自动生成） |
| `password` | string | ✅ | SM2 加密后的密码 |
| `phone` | string | 否 | 手机号 |
| `mobileCaptcha` | string | 否 | 短信验证码 |
| `captchaId` | string | 否 | 图形验证码 ID |
| `areaCode` | string | 否 | 区号 |

**响应**：
```json
{
  "code": 0,
  "msg": "注册成功",
  "data": {
    "userId": "123456789",
    "username": "admin"
  }
}
```

---

### 1.5 获取当前用户信息

```
GET /api/auth/me
```

**鉴权**：`oauth2`

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": "123456789",
    "username": "admin",
    "realName": "Super Admin",
    "email": null,
    "mobile": null,
    "superAdmin": 1,
    "status": 1,
    "headUrl": null,
    "createDate": "2026-05-08T00:00:00.000Z"
  }
}
```

---

### 1.6 修改密码

```
PUT /api/auth/change-password
```

**鉴权**：`oauth2`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `oldPassword` | string | ✅ | 原密码 |
| `newPassword` | string | ✅ | 新密码 |

**响应**：
```json
{ "code": 0, "msg": "密码修改成功" }
```

---

### 1.7 重置密码（通过手机号）

```
PUT /api/auth/reset-password
```

**鉴权**：`anon`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `phone` | string | ✅ | 手机号 |
| `password` | string | ✅ | SM2 加密后的新密码 |
| `code` | string | ✅ | 短信验证码 |
| `captchaId` | string | 否 | 图形验证码 ID |

**响应**：
```json
{ "code": 0, "msg": "密码已重置" }
```

---

### 1.8 公共配置

```
GET /api/auth/pub-config
```

**鉴权**：`anon`

**响应**：
```json
{
  "code": 0,
  "data": {
    "sm2PublicKey": "MFkwEwYHKoZIzj0CAQYIKoEcz1UBgi0DQgAE...",
    "allowUserRegister": true,
    "enableMobileRegister": false,
    "mobileAreaList": [],
    "beianIcpNum": "粤ICP备xxxxxxxx号",
    "beianGaNum": "",
    "version": "1.0.0",
    "name": "智控台",
    "systemWebMenu": {}
  }
}
```

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `sm2PublicKey` | string | SM2 公钥（前端加密用） |
| `allowUserRegister` | boolean | 是否允许注册 |
| `enableMobileRegister` | boolean | 是否允许手机号注册 |
| `mobileAreaList` | array | 手机区号列表 |
| `beianIcpNum` | string | ICP 备案号 |
| `beianGaNum` | string | 公安备案号 |
| `version` | string | 系统版本 |
| `name` | string | 系统名称 |

---

## 二、管理后台——用户管理

### 2.1 用户列表（分页）

```
GET /api/admin/users
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---:|:---|
| `page` | number | 1 | 页码 |
| `limit` | number | 10 | 每页条数 |
| `mobile` | string | — | 手机号模糊搜索 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "list": [
      { "id": "1", "username": "admin", "password": "$2a$10$...", ... }
    ]
  }
}
```

---

### 2.2 重置用户密码

```
PUT /api/admin/users/{id}
```

**鉴权**：`oauth2 + superAdmin`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `id` | 用户 ID |

**响应**（返回随机生成的新密码）：
```json
{
  "code": 0,
  "data": { "password": "a1b2c3d4" }
}
```

---

### 2.3 删除用户

```
DELETE /api/admin/users/{id}
```

**鉴权**：`oauth2 + superAdmin`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `id` | 用户 ID |

**响应**：
```json
{ "code": 0, "msg": "用户已删除" }
```

---

## 三、管理后台——系统参数

### 3.1 参数列表（分页）

```
GET /api/admin/params
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---:|:---|
| `page` | number | 1 | 页码 |
| `limit` | number | 10 | 每页条数 |
| `paramCode` | string | — | 参数代码模糊搜索 |

**响应**：
```json
{
  "code": 0,
  "data": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "list": [
      { "id": "1", "paramCode": "server.private_key", "paramValue": "******", ... }
    ]
  }
}
```

> 敏感参数（含 `api_key`、`secret`、`token`、`password`、`private` 等关键词）的 `paramValue` 自动脱敏为 `******`。

---

### 3.2 新增参数

```
POST /api/admin/params
```

**鉴权**：`oauth2 + superAdmin`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `paramCode` | string | ✅ | 参数代码 |
| `paramValue` | string | ✅ | 参数值 |
| `valueType` | number | 否 | 值类型（默认 1） |
| `remark` | string | 否 | 备注 |

> 新增后自动同步 Redis 缓存 `sys:params`。

**响应**：
```json
{ "code": 0, "data": { "id": "123", "paramCode": "...", ... } }
```

---

### 3.3 修改参数

```
PUT /api/admin/params/{id}
```

**鉴权**：`oauth2 + superAdmin`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `id` | 参数 ID |

**请求体**（全字段可选，不传则保留原值）：

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `paramValue` | string | 参数值 |
| `remark` | string | 备注 |
| `valueType` | number | 值类型 |

> 修改后自动同步 Redis 缓存。

**响应**：
```json
{ "code": 0, "data": { "id": "123", ... } }
```

---

### 3.4 删除参数

```
DELETE /api/admin/params/{id}
```

**鉴权**：`oauth2 + superAdmin`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `id` | 参数 ID |

> 删除后自动清除 Redis 缓存。

**响应**：
```json
{ "code": 0, "msg": "参数已删除" }
```

---

## 四、管理后台——字典管理

### 4.1 字典类型列表（分页）

```
GET /api/admin/dict/types
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---:|:---|
| `page` | number | 1 | — |
| `limit` | number | 10 | — |
| `dictType` | string | — | 字典类型代码模糊搜索 |

**响应**：标准分页格式，`list` 中为 `SysDictType` 数组。

---

### 4.2 新增字典类型

```
POST /api/admin/dict/types
```

**鉴权**：`oauth2 + superAdmin`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `dictType` | string | ✅ | 字典类型代码（如 `FIRMWARE_TYPE`） |
| `dictName` | string | ✅ | 字典类型名称 |
| `remark` | string | 否 | 备注 |
| `sort` | number | 否 | 排序（默认 0） |

---

### 4.3 修改字典类型

```
PUT /api/admin/dict/types
```

**鉴权**：`oauth2 + superAdmin`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `id` | string | ✅ | 字典类型 ID |
| `dictType` | string | ✅ | 字典类型代码 |
| `dictName` | string | ✅ | 字典类型名称 |
| `remark` | string | 否 | 备注 |
| `sort` | number | 否 | 排序 |

---

### 4.4 删除字典类型

```
DELETE /api/admin/dict/types?id={id}
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 必填 | 说明 |
|:---|:---:|:---|
| `id` | ✅ | 字典类型 ID |

> 级联删除该类型下所有字典数据。

**响应**：
```json
{ "code": 0, "msg": "字典类型已删除" }
```

---

### 4.5 字典数据列表（分页）

```
GET /api/admin/dict/data
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---:|:---|
| `page` | number | 1 | — |
| `limit` | number | 10 | — |
| `dictTypeId` | string | — | 字典类型 ID 筛选 |
| `dictLabel` | string | — | 字典标签模糊搜索 |

**响应**：标准分页格式，`list` 中每条记录含 `dictType` 关联对象。

---

### 4.6 新增字典数据

```
POST /api/admin/dict/data
```

**鉴权**：`oauth2 + superAdmin`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `dictTypeId` | string | ✅ | 所属字典类型 ID |
| `dictLabel` | string | ✅ | 字典标签（显示名） |
| `dictValue` | string | ✅ | 字典值 |
| `remark` | string | 否 | 备注 |
| `sort` | number | 否 | 排序（默认 0） |

> 新增后自动清除 Redis 字典缓存。

---

### 4.7 修改字典数据

```
PUT /api/admin/dict/data
```

**鉴权**：`oauth2 + superAdmin`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `id` | string | ✅ | 字典数据 ID |
| `dictLabel` | string | ✅ | 字典标签 |
| `dictValue` | string | ✅ | 字典值 |
| `remark` | string | 否 | 备注 |
| `sort` | number | 否 | 排序 |

---

### 4.8 删除字典数据

```
DELETE /api/admin/dict/data?id={id}
```

**鉴权**：`oauth2 + superAdmin`

**查询参数**：

| 参数 | 必填 | 说明 |
|:---|:---:|:---|
| `id` | ✅ | 字典数据 ID |

---

### 4.9 按类型获取字典数据（公开）

```
GET /api/admin/dict/data/type/{type}
```

**鉴权**：`anon`（公开接口）

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `type` | 字典类型代码（如 `FIRMWARE_TYPE`） |

**响应**：
```json
{
  "code": 0,
  "data": [
    { "id": "1", "dictLabel": "固件类型A", "dictValue": "TYPE_A", "remark": null, "sort": 1 },
    { "id": "2", "dictLabel": "固件类型B", "dictValue": "TYPE_B", "remark": null, "sort": 2 }
  ]
}
```

> 数据优先从 Redis 缓存读取，缓存 TTL 为 1 小时。

---

## 五、模型管理

### 5.1 模型列表（分页）

```
GET /api/models
```

**鉴权**：`oauth2`

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---:|:---|
| `page` | number | 1 | 页码 |
| `limit` | number | 20 | 每页条数 |
| `modelType` | string | — | 模型类型筛选 |
| `modelName` | string | — | 模型名称模糊搜索 |

**响应**：标准分页格式，按 `modelType` + `sort` 排序。

---

### 5.2 新增模型

```
POST /api/models
```

**鉴权**：`oauth2`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `modelType` | string | ✅ | 模型类型（LLM/ASR/TTS/VAD 等） |
| `modelCode` | string | ✅ | 模型代码 |
| `modelName` | string | ✅ | 模型名称 |
| `isDefault` | number | 否 | 是否默认（0/1，默认 0） |
| `isEnabled` | number | 否 | 是否启用（0/1，默认 1） |
| `configJson` | any | 否 | 模型配置 JSON |
| `docLink` | string | 否 | 文档链接 |
| `remark` | string | 否 | 备注 |
| `sort` | number | 否 | 排序（默认 0） |

---

### 5.3 模型名称列表（供下拉选择）

```
GET /api/models/names
```

**鉴权**：`oauth2`

**查询参数**：

| 参数 | 类型 | 说明 |
|:---|:---|:---|
| `modelType` | string | 模型类型筛选 |
| `modelName` | string | 模型名称模糊搜索 |

**响应**：
```json
{
  "code": 0,
  "data": [
    { "id": "1", "modelCode": "gpt-4", "modelName": "GPT-4", "modelType": "LLM", "isDefault": 1 }
  ]
}
```

> 仅返回已启用的模型（`isEnabled: 1`）。

---

### 5.4 模型详情

```
GET /api/models/{param}
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型 ID（数字） |

---

### 5.5 更新模型

```
PUT /api/models/{param}
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型 ID |

**请求体**：同 [5.2 新增模型](#52-新增模型) 除 `modelType` 不可修改。

---

### 5.6 删除模型

```
DELETE /api/models/{param}
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型 ID |

---

### 5.7 获取某类型下的供应商列表

```
GET /api/models/{param}/providers
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型类型（LLM/ASR/TTS/VAD 等） |

**响应**：
```json
{
  "code": 0,
  "data": [
    { "id": "1", "modelType": "LLM", "providerCode": "openai", "name": "OpenAI", "fields": {...}, "sort": 1 }
  ]
}
```

---

### 5.8 获取某供应商下的模型列表

```
GET /api/models/{param}/{providerCode}
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型类型（LLM/ASR/TTS 等） |
| `providerCode` | 供应商代码（如 openai） |

> 按 `modelCode` 以 `providerCode` 为前缀匹配筛选。

---

### 5.9 新增某供应商下的模型

```
POST /api/models/{param}/{providerCode}
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | 模型类型 |
| `providerCode` | 供应商代码 |

**请求体**：同 [5.2 新增模型](#52-新增模型)。

---

### 5.10 获取 TTS 音色列表

```
GET /api/models/{param}/voices
```

**鉴权**：`oauth2`

**路径参数**：

| 参数 | 说明 |
|:---|:---|
| `param` | TTS 模型 ID |

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "id": "1",
      "name": "zh-CN-XiaoxiaoNeural",
      "languages": "zh-CN",
      "ttsModelId": "123",
      "ttsVoice": { "style": "general" },
      "sort": 1
    }
  ]
}
```

---

## 六、智能体配置下发

### 6.1 获取智能体完整配置

```
POST /api/config/agent-models
```

**鉴权**：`server`（ServerSecret）

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `macAddress` | string | ✅ | 设备 MAC 地址 |
| `clientId` | string | 否 | 客户端 ID（预留，暂未使用） |
| `selectedModule` | string | 否 | 模块白名单，逗号分隔（如 `"LLM,TTS"`） |

**响应**：

```json
{
  "code": 0,
  "data": {
    "VAD": { "type": "silero", "provider": "Silero VAD", "config": { ... } },
    "ASR": { "type": "funasr", "provider": "FunASR", "config": { ... } },
    "LLM": { "type": "gpt-4o", "provider": "OpenAI GPT-4o", "config": { ... } },
    "TTS": {
      "type": "edge-tts",
      "provider": "Edge TTS",
      "config": { ... },
      "voiceName": "zh-CN-XiaoxiaoNeural",
      "voiceConfig": { "style": "general" },
      "language": "zh-CN",
      "volume": 100,
      "rate": 0,
      "pitch": 0
    },
    "ContextProviders": [ ... ],
    "CorrectWords": "替换词内容...",
    "Plugin": [ { "id": 1, "targetId": null } ],
    "agentParams": {
      "systemPrompt": "你是一个智能语音助手...",
      "summaryMemory": "...",
      "chatHistoryConf": "...",
      "language": "zh-CN",
      "functions": "[]"
    }
  }
}
```

> 该接口是 xiaozhi-server 与 ESP32 设备通信的核心配置接口。
> 数据完全动态——根据设备绑定的智能体逐项查询数据库组装。
> `selectedModule` 可用于热更新指定模块（如仅更新 LLM 配置）。

---

## 附录

### 完整路由索引

```
  GET    /api/auth/captcha                       # 获取图形验证码
  POST   /api/auth/sms                           # 发送短信验证码
  POST   /api/auth/login                         # 登录
  POST   /api/auth/register                      # 注册
  GET    /api/auth/me                            # 当前用户信息
  PUT    /api/auth/change-password               # 修改密码
  PUT    /api/auth/reset-password                # 重置密码
  GET    /api/auth/pub-config                    # 公共配置

  GET    /api/admin/users                        # 用户列表
  PUT    /api/admin/users/{id}                   # 重置用户密码
  DELETE /api/admin/users/{id}                   # 删除用户

  GET    /api/admin/params                       # 参数列表
  POST   /api/admin/params                       # 新增参数
  PUT    /api/admin/params/{id}                  # 修改参数
  DELETE /api/admin/params/{id}                  # 删除参数

  GET    /api/admin/dict/types                   # 字典类型列表
  POST   /api/admin/dict/types                   # 新增字典类型
  PUT    /api/admin/dict/types                   # 修改字典类型
  DELETE /api/admin/dict/types                   # 删除字典类型

  GET    /api/admin/dict/data                    # 字典数据列表
  POST   /api/admin/dict/data                    # 新增字典数据
  PUT    /api/admin/dict/data                    # 修改字典数据
  DELETE /api/admin/dict/data                    # 删除字典数据

  GET    /api/admin/dict/data/type/{type}        # 按类型获取字典数据

  GET    /api/models                             # 模型列表
  POST   /api/models                             # 新增模型
  GET    /api/models/names                       # 模型名称列表
  GET    /api/models/{param}                     # 模型详情
  PUT    /api/models/{param}                     # 更新模型
  DELETE /api/models/{param}                     # 删除模型
  GET    /api/models/{param}/voices              # TTS 音色列表
  GET    /api/models/{param}/providers           # 供应商列表
  GET    /api/models/{param}/{providerCode}      # 供应商下模型列表
  POST   /api/models/{param}/{providerCode}      # 新增模型（供应商下）

  POST   /api/config/agent-models                # 智能体配置下发
```

共 **22 个 API Route**，涵盖 4 大模块。
