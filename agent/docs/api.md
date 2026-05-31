# Paper Reviewer Agent — API 接口文档

> 业务系统对接 paper-reviewer 服务端的完整接口说明。基于 [src/server/](../src/server/) 实际实现整理,与代码同步。

**Base URL**: `http://<host>:3456`
**协议**: REST (JSON) + WebSocket
**鉴权**: 可选,见 [鉴权](#鉴权) 章节

---

## 目录

1. [鉴权](#鉴权)
2. [快速开始 — 完整对话流程](#快速开始--完整对话流程)
3. [健康检查](#健康检查)
4. [Sessions 会话管理](#sessions-会话管理)
5. [Conversations 多轮对话](#conversations-多轮对话)
6. [WebSocket 流式协议](#websocket-流式协议)
7. [Agents 自定义代理](#agents-自定义代理)
8. [Models 模型查询](#models-模型查询)
9. [Providers 供应商管理](#providers-供应商管理)
10. [错误码](#错误码)
11. [完整示例代码](#完整示例代码)

---

## 鉴权

服务端鉴权**默认关闭**(适合内网部署)。开启后所有 `/api/*` 端点都需要在请求头携带:

```
Authorization: Bearer <token>
```

### 开启方式

在 `.env` 设置:
```bash
ANTHROPIC_API_KEY=your-internal-service-token
```

并启动 server 时加 `--auth-required` 参数(在 docker-compose 里改 `command:`)。

### WebSocket 鉴权

如果开启了鉴权,WebSocket 升级请求**也需要**在 HTTP 升级头携带 `Authorization: Bearer <token>`。浏览器 WebSocket API 不支持自定义 header,需要通过 nginx 中间层注入,或者改走 query string `?token=xxx`(目前服务端只支持 header,需要适配)。

参考: [src/server/middleware/auth.ts](../src/server/middleware/auth.ts)

---

## 快速开始 — 完整对话流程

业务系统调用 paper-reviewer 的标准流程:

```
1. POST /api/sessions                       创建会话 → 拿到 sessionId
2. WebSocket ws://host:3456/ws/<sessionId>  建立流式通道
3. WS 客户端发: { type: 'user_message', content: '...' }
4. WS 服务端推: content_start → content_delta(N 次) → tool_use → ... → message_complete
5. 用户继续对话,重复 3-4
6. (可选) DELETE /api/sessions/:id          归档
```

详见 [WebSocket 流式协议](#websocket-流式协议) 章节。

---

## 健康检查

### `GET /health`

**鉴权**: 不需要

**响应** `200 OK`:
```json
{ "status": "ok", "timestamp": "2026-05-10T11:04:48.696Z" }
```

适合做容器健康检查、负载均衡探活、监控。

---

## Sessions 会话管理

会话数据存储在 `~/.claude/projects/{proj}/{sessionId}.jsonl`(挂载到容器 `/home/bun/.claude/`)。

代码: [src/server/api/sessions.ts](../src/server/api/sessions.ts)

### `GET /api/sessions`

列出会话(分页 + 项目过滤)。

**Query 参数**:
| 名称 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `project` | string | (全部) | 过滤指定 project 路径 |
| `limit` | int | 20 | 单页数量 |
| `offset` | int | 0 | 分页偏移 |

**响应** `200`:
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "审稿:Attention Is All You Need",
      "createdAt": "2026-05-09T10:00:00.000Z",
      "modifiedAt": "2026-05-09T10:30:00.000Z",
      "messageCount": 12,
      "projectPath": "/home/bun/.claude/projects/-papers",
      "workDir": "/papers",
      "workDirExists": true
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### `POST /api/sessions`

创建新会话。

**请求体**:
```json
{
  "workDir": "/papers/2026/transformer-review"
}
```

`workDir` 是 agent 工作目录(可读取的论文存放路径,挂载到容器内即可)。可选,不传走默认。

**响应** `201`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "新会话",
  "workDir": "/papers/2026/transformer-review",
  "createdAt": "2026-05-09T10:00:00.000Z",
  "modifiedAt": "2026-05-09T10:00:00.000Z",
  "messageCount": 0,
  "projectPath": "/home/bun/.claude/projects/-papers",
  "workDirExists": true
}
```

### `GET /api/sessions/:id`

获取会话详情(含全部消息)。

**响应** `200`:
```json
{
  "id": "...",
  "title": "...",
  "createdAt": "...",
  "modifiedAt": "...",
  "messageCount": 12,
  "projectPath": "...",
  "workDir": "...",
  "workDirExists": true,
  "messages": [ /* MessageEntry[],见下 */ ]
}
```

### `GET /api/sessions/:id/messages`

只取消息历史(轻量)。

**响应** `200`:
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "type": "user",
      "content": "请帮我审这篇论文",
      "timestamp": "2026-05-09T10:00:01.000Z"
    },
    {
      "id": "msg-uuid",
      "type": "assistant",
      "content": [{ "type": "text", "text": "好的..." }],
      "timestamp": "2026-05-09T10:00:02.000Z",
      "model": "gpt-4.1"
    },
    {
      "id": "msg-uuid",
      "type": "tool_use",
      "content": { "name": "Read", "input": { "file_path": "/papers/abstract.md" } },
      "timestamp": "..."
    },
    {
      "id": "msg-uuid",
      "type": "tool_result",
      "content": "...",
      "timestamp": "..."
    }
  ],
  "taskNotifications": []
}
```

`type` 取值: `user` / `assistant` / `system` / `tool_use` / `tool_result`

### `PATCH /api/sessions/:id`

重命名会话。

**请求体**: `{ "title": "新标题" }`

**响应** `200`: `{ "ok": true }`

### `DELETE /api/sessions/:id`

删除会话(jsonl 文件被删,WebSocket 连接被关闭)。

**响应** `200`: `{ "ok": true }`

---

## Conversations 多轮对话

⚠️ **REST 端点只用于状态控制**,实际消息流走 WebSocket。

代码: [src/server/api/conversations.ts](../src/server/api/conversations.ts)

### `POST /api/sessions/:id/chat`

(可选)入队一条消息。**真正的发送和流式响应都通过 WebSocket**。这个端点只返回入队凭证。

**请求体**:
```json
{ "content": "请评估这篇论文的方法学" }
```

**响应** `202`:
```json
{ "messageId": "uuid", "status": "queued" }
```

### `GET /api/sessions/:id/chat/status`

查询当前对话状态。

**响应** `200`:
```json
{ "state": "thinking" }
```

`state` 取值: `idle` / `thinking` / `tool_executing`

### `POST /api/sessions/:id/chat/stop`

中止当前生成。

**响应** `200`: `{ "ok": true }`

---

## WebSocket 流式协议

**连接 URL**: `ws://<host>:3456/ws/<sessionId>`

> sessionId 必须匹配 `^[0-9a-zA-Z_-]{1,64}$`,见 [src/server/index.ts:105](../src/server/index.ts#L105)

代码: [src/server/ws/handler.ts](../src/server/ws/handler.ts) · 事件类型: [src/server/ws/events.ts](../src/server/ws/events.ts)

### 客户端 → 服务端 消息

```ts
type ClientMessage =
  | { type: 'prewarm_session' }                                       // 预热(可选)
  | { type: 'user_message', content: string, attachments?: Attachment[] }
  | { type: 'permission_response', requestId: string, allowed: boolean,
      rule?: string, updatedInput?: object }                          // 权限决策回复
  | { type: 'set_runtime_config', providerId: string|null, modelId: string }  // 切换模型/provider
  | { type: 'set_permission_mode', mode: string }                     // 切权限模式
  | { type: 'stop_generation' }                                       // 停止生成
  | { type: 'ping' }
```

`Attachment`:
```ts
{
  type: 'file' | 'image',
  name?: string,
  path?: string,         // 服务端可访问的本地路径 (推荐)
  data?: string,         // base64 (image)
  mimeType?: string
}
```

### 服务端 → 客户端 消息

```ts
type ServerMessage =
  | { type: 'connected', sessionId: string }
  | { type: 'status', state: 'idle'|'thinking'|'tool_executing'|'streaming'|'permission_pending',
      verb?: string, elapsed?: number, tokens?: number }
  | { type: 'thinking', text: string }                                // Extended Thinking (仅 Claude)
  | { type: 'content_start', blockType: 'text'|'tool_use', toolName?: string,
      toolUseId?: string, parentToolUseId?: string }
  | { type: 'content_delta', text?: string, toolInput?: string }      // 流式 token
  | { type: 'tool_use_complete', toolName: string, toolUseId: string,
      input: unknown, parentToolUseId?: string }
  | { type: 'permission_request', requestId: string, toolName: string,
      toolUseId?: string, input: unknown, description?: string }       // 高危工具询问
  | { type: 'tool_result', toolUseId: string, content: unknown,
      isError: boolean, parentToolUseId?: string }
  | { type: 'message_complete', usage: TokenUsage }                   // 整轮 assistant 消息结束
  | { type: 'session_title_updated', sessionId: string, title: string }
  | { type: 'task_update', taskId: string, status: string, progress?: string }
  | { type: 'error', message: string, code: string, retryable?: boolean }
  | { type: 'system_notification', subtype: string, message?: string, data?: unknown }
  | { type: 'pong' }
```

`TokenUsage`:
```ts
{
  input_tokens: number,
  output_tokens: number,
  cache_read_tokens?: number,
  cache_creation_tokens?: number
}
```

### 典型事件流

```
客户端 → connect ws://host:3456/ws/{sessionId}
服务端 → { type: 'connected', sessionId }

客户端 → { type: 'user_message', content: '审一下这篇论文 /papers/x.pdf' }

服务端 → { type: 'status', state: 'thinking' }
服务端 → { type: 'content_start', blockType: 'text' }
服务端 → { type: 'content_delta', text: '我先' }
服务端 → { type: 'content_delta', text: '读取这个文件' }

服务端 → { type: 'content_start', blockType: 'tool_use',
            toolName: 'Read', toolUseId: 'tu-1' }
服务端 → { type: 'tool_use_complete', toolName: 'Read', toolUseId: 'tu-1',
            input: { file_path: '/papers/x.pdf' } }
服务端 → { type: 'status', state: 'tool_executing' }
服务端 → { type: 'tool_result', toolUseId: 'tu-1',
            content: '...PDF 内容...', isError: false }

服务端 → { type: 'content_start', blockType: 'text' }
服务端 → { type: 'content_delta', text: '基于摘要,这篇论文...' }

服务端 → { type: 'message_complete',
            usage: { input_tokens: 1234, output_tokens: 567 } }
服务端 → { type: 'status', state: 'idle' }
```

### 权限请求流(可选)

如果工具需要审批(例如 Bash):

```
服务端 → { type: 'permission_request', requestId: 'req-1',
            toolName: 'Bash', toolUseId: 'tu-2',
            input: { command: 'rm /tmp/x' } }

客户端 → { type: 'permission_response', requestId: 'req-1', allowed: true }

服务端 → 继续执行 → tool_result → ...
```

---

## Agents 自定义代理

代码: [src/server/api/agents.ts](../src/server/api/agents.ts)

### `GET /api/agents`

列出所有可用 agent(内置 + 自定义)。

**Query**: `?cwd=/papers/2026/...`(可选,影响 project-level agent 加载)

**响应** `200`:
```json
{
  "activeAgents": [
    {
      "agentType": "general-purpose",
      "description": "通用代理...",
      "model": "inherit",
      "modelDisplay": "gpt-4.1",
      "tools": ["*"],
      "systemPrompt": "...",
      "color": "blue",
      "source": "built-in",
      "isActive": true
    },
    {
      "agentType": "paper-reviewer",
      "description": "学术论文审稿 agent",
      "model": "opus",
      "modelDisplay": "gpt-5",
      "tools": ["Read", "WebFetch", "WebSearch"],
      "systemPrompt": "你是 ICML/NeurIPS 级别的资深审稿人...",
      "source": "user",
      "baseDir": "/home/bun/.claude/agents",
      "isActive": true
    }
  ],
  "allAgents": [ /* 包含被 override 的 */ ]
}
```

### `GET /api/agents/:name`

获取单个 agent 详情。

### `POST /api/agents`

创建自定义 agent。

**请求体**:
```json
{
  "name": "paper-reviewer",
  "description": "学术论文审稿 agent",
  "model": "opus",
  "tools": ["Read", "WebFetch", "WebSearch"],
  "systemPrompt": "你是 ICML/NeurIPS 级别的资深审稿人。审稿步骤: 1) 总结贡献 2) 评估方法新颖性 3) 检查实验 4) 给 weak accept / weak reject / strong reject 等评级 ...",
  "color": "purple"
}
```

**响应** `201`: `{ "ok": true }`

文件落到 `~/.claude/agents/<name>.md`(挂载到容器对应目录)。

### `PUT /api/agents/:name` / `DELETE /api/agents/:name`

更新 / 删除自定义 agent。

---

## Models 模型查询

代码: [src/server/api/models.ts](../src/server/api/models.ts)

### `GET /api/models`

列出当前可用模型。

**响应** `200`:
```json
{
  "models": [
    { "id": "gpt-4.1",      "name": "gpt-4.1",      "description": "Main model",   "context": "" },
    { "id": "gpt-4.1-mini", "name": "gpt-4.1-mini", "description": "Haiku model",  "context": "" },
    { "id": "gpt-4.1",      "name": "gpt-4.1",      "description": "Sonnet model", "context": "" },
    { "id": "gpt-5",        "name": "gpt-5",        "description": "Opus model",   "context": "" }
  ],
  "provider": null
}
```

来源: 读 `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `..._SONNET_MODEL` / `..._OPUS_MODEL` env vars。

### `GET /api/models/current`

当前选中的主模型。

**响应** `200`: `{ "model": { "id": "gpt-4.1", "name": "gpt-4.1", ... } }`

### `PUT /api/models/current`

切换主模型(写到用户 settings)。

**请求体**: `{ "modelId": "gpt-5" }`

**响应** `200`: `{ "ok": true, "model": "gpt-5" }`

> 也可以**仅在单次对话中切换**: WebSocket 发 `{ type: 'set_runtime_config', providerId: null, modelId: 'gpt-5' }`,只影响当前 session,不写盘。

---

## Providers 供应商管理

代码: [src/server/api/providers.ts](../src/server/api/providers.ts)

### `GET /api/providers`

列出已保存的所有供应商配置。

**响应** `200`:
```json
{
  "providers": [
    { "id": "deerapi-via-litellm", "name": "DeerAPI",
      "baseUrl": "http://litellm:4000",
      "models": { "main": "gpt-4.1", "haiku": "gpt-4.1-mini",
                  "sonnet": "gpt-4.1", "opus": "gpt-5" } }
  ],
  "activeId": "deerapi-via-litellm"
}
```

### `POST /api/providers`

新增供应商配置。

**请求体**:
```json
{
  "id": "openrouter",
  "name": "OpenRouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "authToken": "sk-or-v1-...",
  "models": {
    "main": "anthropic/claude-sonnet-4",
    "haiku": "anthropic/claude-haiku-4-5",
    "sonnet": "anthropic/claude-sonnet-4",
    "opus": "anthropic/claude-opus-4"
  }
}
```

### `POST /api/providers/:id/activate`

切换激活的供应商(全局生效)。

### `POST /api/providers/:id/test`

测试供应商连通性。

**响应**:
```json
{
  "result": {
    "connectivity": { "success": true, "latencyMs": 234 },
    "proxy": { "success": true }
  }
}
```

### 其他端点
- `GET /api/providers/presets` — 内置预设模板列表
- `GET /api/providers/auth-status` — 当前是否有可用凭证
- `GET/PUT /api/providers/settings` — cc-haha 管理的 settings.json 读写
- `POST /api/providers/official` — 切回官方 Anthropic
- `POST /api/providers/test` — 测试未保存的临时配置

---

## 错误码

统一格式([src/server/middleware/errorHandler.ts](../src/server/middleware/errorHandler.ts)):

```json
{ "error": "ERROR_CODE", "message": "可读说明" }
```

| HTTP | code | 含义 |
|---|---|---|
| 400 | `BAD_REQUEST` | 请求参数缺失/无效 |
| 401 | `Unauthorized` | 鉴权失败 |
| 403 | `FORBIDDEN` | 路径越权(workspace 访问等) |
| 404 | `NOT_FOUND` | 资源不存在 |
| 405 | `METHOD_NOT_ALLOWED` | HTTP 方法不允许 |
| 409 | `CONFLICT` | 状态冲突(如重复创建) |
| 500 | `INTERNAL_ERROR` | 服务端异常 |

---

## 完整示例代码

### curl: 创建会话 + 发消息(REST 入队)

```bash
HOST=http://127.0.0.1:3456

# 1. 创建会话
SID=$(curl -sS -X POST $HOST/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"workDir":"/papers"}' | jq -r '.id')

echo "Session: $SID"

# 2. 入队一条消息(只入队,实际响应走 WS)
curl -sS -X POST $HOST/api/sessions/$SID/chat \
  -H "Content-Type: application/json" \
  -d '{"content":"请审这篇论文"}'

# 3. 查状态
curl -sS $HOST/api/sessions/$SID/chat/status
```

### Python: 完整多轮对话(WebSocket)

```python
import asyncio
import json
import httpx
import websockets

HOST = "127.0.0.1:3456"

async def chat():
    # 1. 创建 session
    async with httpx.AsyncClient() as http:
        r = await http.post(f"http://{HOST}/api/sessions",
                            json={"workDir": "/papers"})
        sid = r.json()["id"]
        print(f"Session: {sid}")

    # 2. WebSocket 连接 + 多轮对话
    async with websockets.connect(f"ws://{HOST}/ws/{sid}") as ws:
        async def listen():
            async for raw in ws:
                msg = json.loads(raw)
                t = msg["type"]
                if t == "content_delta" and "text" in msg:
                    print(msg["text"], end="", flush=True)
                elif t == "tool_use_complete":
                    print(f"\n[工具] {msg['toolName']} {json.dumps(msg['input'], ensure_ascii=False)}")
                elif t == "message_complete":
                    print(f"\n[完成] tokens={msg['usage']}")
                    return
                elif t == "error":
                    print(f"\n[错误] {msg}")
                    return

        # 第一轮
        await ws.send(json.dumps({"type": "user_message",
                                   "content": "请帮我审这篇论文 /papers/x.pdf"}))
        await listen()

        # 第二轮(直接继续发,session 状态已保留)
        await ws.send(json.dumps({"type": "user_message",
                                   "content": "重点说一下方法学的问题"}))
        await listen()

asyncio.run(chat())
```

### Node/TypeScript: WebSocket + 切换模型

```typescript
import WebSocket from 'ws'

const HOST = '127.0.0.1:3456'

async function main() {
  // 1. 创建 session
  const r = await fetch(`http://${HOST}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workDir: '/papers' }),
  })
  const { id: sid } = await r.json()

  // 2. WebSocket
  const ws = new WebSocket(`ws://${HOST}/ws/${sid}`)
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString())
    if (m.type === 'content_delta' && m.text) process.stdout.write(m.text)
    if (m.type === 'message_complete') console.log(`\n用量: ${JSON.stringify(m.usage)}`)
  })
  ws.on('open', () => {
    // 切到 Opus 档(更深推理)
    ws.send(JSON.stringify({
      type: 'set_runtime_config', providerId: null, modelId: 'gpt-5'
    }))
    // 发问
    ws.send(JSON.stringify({
      type: 'user_message',
      content: '审稿这篇论文,给出最终评级'
    }))
  })
}
main()
```

### 创建 paper-reviewer 自定义 agent

```bash
curl -sS -X POST http://127.0.0.1:3456/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "paper-reviewer",
    "description": "学术论文审稿 agent",
    "model": "opus",
    "tools": ["Read", "WebFetch", "WebSearch", "Glob", "Grep"],
    "systemPrompt": "你是 ICML/NeurIPS 级别的资深审稿人。审稿请按以下步骤: 1) 用一句话概括论文贡献 2) 评估方法新颖性 (1-5 分) 3) 检查实验设置和 baseline 选择 4) 标注存疑的 claim 5) 给出 weak accept / weak reject / strong reject 等评级 6) 列出 3-5 条具体的可执行的修改建议",
    "color": "purple"
  }'
```

之后业务系统调用时,通过 `set_runtime_config` 让 agent 走这个 subagent 即可。

---

## 数据持久化

| 数据 | 容器内路径 | 宿主机路径(docker-compose 默认) |
|---|---|---|
| 会话 jsonl | `/home/bun/.claude/projects/` | `./data/claude/projects/` |
| 自定义 agent | `/home/bun/.claude/agents/` | `./data/claude/agents/` |
| Provider 配置 | `/home/bun/.claude/cc-haha/` | `./data/claude/cc-haha/` |
| 用户 settings | `/home/bun/.claude/settings.json` | `./data/claude/settings.json` |

备份只需复制 `./data/claude/` 目录。

---

## 限制与注意事项

1. **Extended Thinking**: 仅 Claude 模型可用,GPT-4.1 / GPT-5 等不会走 thinking 事件
2. **Prompt Caching**: 仅 Claude 可用;长论文上下文会显著提升 GPT 系列成本
3. **Tool Use 兼容性**: GPT-4o-mini 这类小模型可能调用工具不稳;subagent 探索建议至少用 `gpt-4.1-mini`
4. **WebSocket 鉴权**: 浏览器原生 WebSocket 无法带自定义 header,需要 nginx 代理或改造服务端支持 query token
5. **CORS**: 默认放开,生产环境请在 [src/server/middleware/cors.ts](../src/server/middleware/cors.ts) 限制 origin
6. **Session 隔离**: 当前是单用户场景,所有 session 共享 `~/.claude/`,**不要直接暴露在多租户环境**
