# AI Service API 文档

> 统一的 HTTP + SSE 网关，封装 OpenAI Codex CLI 和 Anthropic Claude Code CLI。

**Base URL:** `http://<host>:<port>`（默认端口 `8200`）

---

## 目录

- [认证](#认证)
- [会话生命周期概览](#会话生命周期概览)
- [API 端点](#api-端点)
  - [健康检查](#1-健康检查)
  - [创建会话](#2-创建会话)
  - [列出所有会话](#3-列出所有会话)
  - [删除会话](#4-删除会话)
  - [上传文件](#5-上传文件)
  - [发送消息（对话）](#6-发送消息对话)
- [SSE 事件格式](#sse-事件格式)
  - [Codex 事件](#codex-事件)
  - [Claude 事件](#claude-事件)
  - [通用事件](#通用事件)
- [会话与对话机制详解](#会话与对话机制详解)
  - [什么是同一个对话](#什么是同一个对话)
  - [如何重开一个新对话](#如何重开一个新对话)
  - [会话自动过期](#会话自动过期)
  - [上下文继承原理](#上下文继承原理)
- [文件上传说明](#文件上传说明)
- [并发与限流](#并发与限流)
- [错误码参考](#错误码参考)
- [完整调用示例](#完整调用示例)
  - [curl 示例](#curl-示例)
  - [JavaScript 客户端示例](#javascript-客户端示例)
  - [Python 客户端示例](#python-客户端示例)
- [环境变量配置](#环境变量配置)

---

## 认证

当服务端设置了 `API_TOKEN` 环境变量时，所有 `/api/*` 路径需要携带 Bearer Token：

```
Authorization: Bearer <your-api-token>
```

如果 `API_TOKEN` 为空（默认），则无需认证。

> `/health` 端点不需要认证。

---

## 会话生命周期概览

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  创建会话    │────▶│  上传文件    │────▶│  发送消息    │────▶│  删除会话    │
│ POST        │     │ POST        │     │ POST (SSE)  │     │ DELETE      │
│ /api/sessions│     │ ../upload   │     │ ../chat     │     │ /api/sessions│
└─────────────┘     └──────┬──────┘     └──────┬──────┘     └─────────────┘
                           │                   │
                       (可选，可多次)       (可多次，同一对话)
```

**核心流程：**

1. **创建会话** — 选择 provider（`codex` 或 `claude`），获得 `sessionId`
2. **上传文件**（可选） — 把需要 AI 分析的文件上传到该会话的工作目录
3. **发送消息** — 通过 SSE 流式接收 AI 回复，可在同一会话中多次发送
4. **删除会话** — 结束后清理资源；不删除也会在超时后自动过期

---

## API 端点

### 1. 健康检查

检查服务是否存活，并获取当前进程池状态。

```
GET /health
```

**响应 `200`：**

```json
{
  "status": "ok",
  "pool": {
    "running": 2,
    "queued": 0,
    "max": 10,
    "maxQueued": 100
  }
}
```

---

### 2. 创建会话

创建一个新的 AI 会话，指定使用的 provider。

```
POST /api/sessions
Content-Type: application/json
```

**请求体：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `provider` | `string` | 否 | `"codex"` | AI 引擎，可选 `"codex"` 或 `"claude"` |

**请求示例：**

```json
{
  "provider": "claude"
}
```

**响应 `201`：**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "provider": "claude"
}
```

> **重要：** 保存返回的 `sessionId`，后续所有操作都需要使用它。

---

### 3. 列出所有会话

获取当前存活的全部会话。

```
GET /api/sessions
```

**响应 `200`：**

```json
{
  "sessions": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "provider": "claude",
      "threadId": null,
      "claudeSessionId": "session_abc123",
      "status": "idle",
      "createdAt": 1711267200000,
      "lastActiveAt": 1711267500000
    }
  ]
}
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| `id` | 会话唯一 ID |
| `provider` | 使用的 AI 引擎 |
| `threadId` | Codex 的线程 ID（仅 codex 会话有值） |
| `claudeSessionId` | Claude 的会话 ID（仅 claude 会话有值） |
| `status` | `"idle"`（空闲）或 `"busy"`（正在处理） |
| `createdAt` | 创建时间（Unix 毫秒时间戳） |
| `lastActiveAt` | 最后活动时间（Unix 毫秒时间戳） |

---

### 4. 删除会话

手动删除会话并清理关联的工作目录。

```
DELETE /api/sessions/:id
```

**响应 `200`：**

```json
{
  "deleted": true
}
```

**响应 `404`：**

```json
{
  "error": "session not found"
}
```

---

### 5. 上传文件

向指定会话的工作目录上传文件。上传的文件会存储在会话的沙箱目录中，AI 对话时可以直接访问这些文件。

```
POST /api/sessions/:id/upload
Content-Type: multipart/form-data
```

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | `File[]` | 是 | 一次最多上传 **10 个**文件，单文件最大 **20MB** |

**响应 `200`：**

```json
{
  "uploaded": [
    {
      "name": "report.csv",
      "size": 102400,
      "path": "/workspace/sessions/a1b2c3d4/report.csv"
    }
  ]
}
```

**注意事项：**

- 文件名中的特殊字符会被替换为 `_`（仅保留 `字母、数字、.、-、_`）
- 同名文件会被覆盖
- 上传的文件在会话被删除或过期时一并清理

---

### 6. 发送消息（对话）

向 AI 发送消息并以 **SSE（Server-Sent Events）** 流式接收回复。

```
POST /api/sessions/:id/chat
Content-Type: application/json
Accept: text/event-stream
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | **是** | 发送给 AI 的消息内容 |
| `search` | `boolean` | 否 | 仅 Codex：是否启用联网搜索 |
| `model` | `string` | 否 | 仅 Claude：指定模型（如 `"claude-sonnet-4-20250514"`），覆盖服务端默认值 |

**请求示例：**

```json
{
  "message": "分析当前目录下的 report.csv，给出数据摘要",
  "search": false
}
```

**响应：** SSE 事件流（详见 [SSE 事件格式](#sse-事件格式)）

---

## SSE 事件格式

chat 接口返回的是标准 [SSE 协议](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)。连接成功后，服务端首先发送一条注释行 `:ok`，随后持续推送事件。

### 通用事件

**所有 provider 都会发送的事件：**

| event | 说明 | 触发时机 |
|-------|------|----------|
| `done` | 对话完成 | AI 进程退出时，**始终是最后一个事件** |
| `raw` | 无法解析的原始输出 | CLI 产生非 JSON 输出时 |

**心跳：** 服务端每隔 15 秒（可配置）发送 `:ping` 注释行保持连接。

**done 事件的 data：**

```json
{
  "exitCode": 0,
  "provider": "codex"
}
```

### Codex 事件

| event | data 字段 | 说明 |
|-------|-----------|------|
| `thread.started` | `{ type, thread_id, ... }` | 线程已创建，`thread_id` 用于上下文延续 |
| 其他 Codex 事件 | 原始 JSON | 直接透传 Codex CLI 的 JSON 输出 |

### Claude 事件

| event | data 字段 | 说明 |
|-------|-----------|------|
| `system` | `{ type: "system", session_id, ... }` | 系统消息，包含 Claude 的 `session_id` |
| `assistant.text` | `{ type: "assistant.text", text, session_id }` | AI 回复的文本内容 |
| `assistant.thinking` | `{ type: "assistant.thinking", thinking, session_id }` | AI 的思考过程（verbose 模式） |
| `assistant.tool_use` | `{ type: "assistant.tool_use", tool, input, session_id }` | AI 调用工具（读写文件、执行命令等） |
| `result` | `{ type: "result", session_id, ... }` | 最终结果摘要 |

---

## 会话与对话机制详解

### 什么是同一个对话

**同一个 `sessionId` 下的所有 chat 请求，都属于同一个对话。** AI 会记住之前的对话上下文。

```
创建会话 → sessionId = "abc-123"

第 1 次 chat: "你好，我叫小明"          ← AI 记住了你的名字
第 2 次 chat: "我叫什么名字？"            ← AI 回答"小明"
第 3 次 chat: "分析一下我上传的文件"      ← AI 可以引用之前对话内容 + 文件
```

**原理：**
- **Codex** — 首次对话时 CLI 返回 `thread_id`，服务端自动保存。后续对话自动使用 `codex exec resume <thread_id>` 恢复上下文。
- **Claude** — 首次对话时 CLI 返回 `session_id`，服务端自动保存。后续对话自动使用 `claude --resume <session_id>` 恢复上下文。

> 调用方无需关心 `thread_id` / `session_id` 的管理，只需持有 `sessionId` 即可。服务端会自动处理上下文延续。

### 如何重开一个新对话

**删除旧会话，创建新会话即可。** 新会话没有任何历史上下文。

```bash
# 结束旧对话
DELETE /api/sessions/abc-123

# 开启全新对话（无历史上下文）
POST /api/sessions  →  sessionId = "def-456"
```

**也可以不删除旧会话，直接创建新会话。** 旧会话会在超时后（默认 30 分钟无活动）自动过期清理。

**总结：**

| 场景 | 做法 |
|------|------|
| 继续同一对话（保留上下文） | 用同一个 `sessionId` 继续调用 `/chat` |
| 开启全新对话（清空上下文） | 创建新会话，获取新 `sessionId` |
| 切换 provider | 必须创建新会话（provider 在创建时绑定，不可更改） |

### 会话自动过期

- 会话在 **空闲状态**（`status: "idle"`）超过 `SESSION_TIMEOUT`（默认 30 分钟）后自动过期
- 过期的会话及其工作目录（包括上传的文件）会被自动清理
- 每次对话活动都会刷新 `lastActiveAt`，重置过期倒计时
- `busy` 状态的会话不会被过期清理

### 上下文继承原理

```
┌───────────────────────────────────────────────────────┐
│                   Session "abc-123"                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 工作目录: /workspace/sessions/abc-123/          │  │
│  │  ├── report.csv      (上传的文件)               │  │
│  │  ├── analysis.py     (AI 创建的文件)            │  │
│  │  └── .git/           (版本控制)                  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  内部状态:                                             │
│  ├── threadId: "thread_xyz"    (Codex 上下文 ID)     │
│  ├── claudeSessionId: null     (Claude 上下文 ID)    │
│  └── provider: "codex"                               │
│                                                       │
│  Chat #1 ──▶ Chat #2 ──▶ Chat #3  (上下文延续)       │
└───────────────────────────────────────────────────────┘
```

**上下文包含两部分：**

1. **对话记忆** — 通过 `threadId`（Codex）/ `claudeSessionId`（Claude）自动维护
2. **文件系统** — 会话的工作目录持久化，AI 上一轮创建/修改的文件在下一轮依然可访问

---

## 文件上传说明

### 上传流程

```bash
# 1. 创建会话
POST /api/sessions
→ { "sessionId": "abc-123" }

# 2. 上传文件
POST /api/sessions/abc-123/upload
Content-Type: multipart/form-data
Body: files=@report.csv&files=@config.json

# 3. 在对话中引用文件
POST /api/sessions/abc-123/chat
{ "message": "分析 report.csv 的内容" }
```

### 限制

| 限制项 | 值 |
|--------|-----|
| 单文件大小上限 | 20MB |
| 单次上传文件数上限 | 10 个 |
| 文件名字符 | 仅允许 `字母 数字 . - _`，其他字符替换为 `_` |

### AI 如何访问文件

上传的文件存放在会话的工作目录中（如 `/workspace/sessions/abc-123/`）。AI CLI 进程以此目录为 `cwd` 启动，因此：

- AI 可以直接用文件名引用文件（如 `report.csv`）
- AI 可以创建新文件，这些文件在后续对话中依然存在
- AI 可以执行脚本（如 `python analysis.py`）

---

## 并发与限流

### 会话级别

- 同一会话同时只能有 **1 个** 进行中的 chat 请求
- 向 `busy` 状态的会话发送 chat 请求会返回 `429`

### 服务级别

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `MAX_CONCURRENT` | 10 | 最多同时运行的 AI 进程数 |
| `MAX_QUEUED` | 100 | 超出并发时的最大排队数 |
| `QUEUE_TIMEOUT_MS` | 30000 | 排队等待超时时间（毫秒） |
| `PROCESS_TIMEOUT_MS` | 300000 | 单个 AI 进程最大运行时间（5 分钟） |

**限流响应：**

- 排队已满 → `503` `{ "error": "server busy, try again later" }`
- 排队超时 → `504` `{ "error": "request timed out waiting in queue" }`

### nginx 层（生产部署）

- 每 IP 请求频率：30 次/秒，burst 50
- 每 IP 最大连接数：20

---

## 错误码参考

| HTTP 状态码 | error 值 | 触发场景 |
|-------------|----------|----------|
| `400` | `"invalid provider, must be one of: codex, claude"` | 创建会话时 provider 值非法 |
| `400` | `"\"message\" field is required"` | chat 请求缺少 message 字段 |
| `401` | `"unauthorized"` | API Token 验证失败 |
| `404` | `"session not found"` | sessionId 不存在或已过期 |
| `429` | `"session is busy"` | 该会话正在处理另一个请求 |
| `503` | `"server busy, try again later"` | 全局排队已满 |
| `503` | `"service unavailable"` | 服务内部错误 |
| `504` | `"request timed out waiting in queue"` | 排队等待超时 |

---

## 完整调用示例

### curl 示例

```bash
BASE_URL="http://localhost:8200"
TOKEN="your-api-token"    # 无认证时可省略 -H 头

# ──────────────────────────────────────────────
# 1) 健康检查
# ──────────────────────────────────────────────
curl -s "$BASE_URL/health" | jq .

# ──────────────────────────────────────────────
# 2) 创建会话（使用 Claude）
# ──────────────────────────────────────────────
SESSION=$(curl -s -X POST "$BASE_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider": "claude"}' | jq -r '.sessionId')

echo "Session ID: $SESSION"

# ──────────────────────────────────────────────
# 3) 上传文件
# ──────────────────────────────────────────────
curl -s -X POST "$BASE_URL/api/sessions/$SESSION/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@./data/report.csv" \
  -F "files=@./data/config.json" | jq .

# ──────────────────────────────────────────────
# 4) 发送消息（SSE 流式）
# ──────────────────────────────────────────────
curl -N -X POST "$BASE_URL/api/sessions/$SESSION/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  -d '{"message": "分析 report.csv 的数据趋势"}'

# ──────────────────────────────────────────────
# 5) 继续对话（同一个 session，上下文保留）
# ──────────────────────────────────────────────
curl -N -X POST "$BASE_URL/api/sessions/$SESSION/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  -d '{"message": "把刚才的分析结果导出为 summary.md"}'

# ──────────────────────────────────────────────
# 6) 查看所有会话
# ──────────────────────────────────────────────
curl -s "$BASE_URL/api/sessions" \
  -H "Authorization: Bearer $TOKEN" | jq .

# ──────────────────────────────────────────────
# 7) 删除会话（开始新对话前）
# ──────────────────────────────────────────────
curl -s -X DELETE "$BASE_URL/api/sessions/$SESSION" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### JavaScript 客户端示例

```javascript
const BASE_URL = "http://localhost:3000";
const TOKEN = "your-api-token";

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${TOKEN}`,
};

// 创建会话
async function createSession(provider = "claude") {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ provider }),
  });
  const { sessionId } = await res.json();
  return sessionId;
}

// 上传文件
async function uploadFiles(sessionId, files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/upload`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOKEN}` },
    body: formData,
  });
  return res.json();
}

// 发送消息 — 流式接收回复
async function chat(sessionId, message, onEvent) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith(":")) continue;           // 注释行（:ok, :ping）
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ") && currentEvent) {
        const data = JSON.parse(line.slice(6));
        onEvent(currentEvent, data);
        currentEvent = null;
      }
    }
  }
}

// 删除会话
async function deleteSession(sessionId) {
  await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers,
  });
}

// ────────────────────────────────────────────────
// 使用示例
// ────────────────────────────────────────────────
(async () => {
  // 创建会话
  const sessionId = await createSession("claude");
  console.log("会话已创建:", sessionId);

  // 第一轮对话
  console.log("\n--- 第 1 轮 ---");
  await chat(sessionId, "你好，帮我写一个快速排序", (event, data) => {
    if (event === "assistant.text") {
      process.stdout.write(data.text);
    }
  });

  // 第二轮对话（上下文保留，AI 知道之前写了快速排序）
  console.log("\n--- 第 2 轮 ---");
  await chat(sessionId, "给刚才的代码加上单元测试", (event, data) => {
    if (event === "assistant.text") {
      process.stdout.write(data.text);
    }
  });

  // 结束会话
  await deleteSession(sessionId);
  console.log("\n会话已删除");
})();
```

### Python 客户端示例

```python
import requests
import json

BASE_URL = "http://localhost:3000"
TOKEN = "your-api-token"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}",
}


def create_session(provider="claude"):
    """创建会话"""
    res = requests.post(
        f"{BASE_URL}/api/sessions",
        headers=HEADERS,
        json={"provider": provider},
    )
    res.raise_for_status()
    return res.json()["sessionId"]


def upload_files(session_id, file_paths):
    """上传文件"""
    files = [("files", open(p, "rb")) for p in file_paths]
    res = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/upload",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files=files,
    )
    for _, f in files:
        f.close()
    res.raise_for_status()
    return res.json()


def chat(session_id, message, search=False, model=None):
    """发送消息，流式打印回复，返回全部事件列表"""
    body = {"message": message}
    if search:
        body["search"] = True
    if model:
        body["model"] = model

    res = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/chat",
        headers=HEADERS,
        json=body,
        stream=True,
    )
    res.raise_for_status()

    events = []
    current_event = None
    for line in res.iter_lines(decode_unicode=True):
        if not line or line.startswith(":"):
            continue
        if line.startswith("event: "):
            current_event = line[7:]
        elif line.startswith("data: ") and current_event:
            data = json.loads(line[6:])
            events.append((current_event, data))

            # 实时打印文本
            if current_event == "assistant.text":
                print(data.get("text", ""), end="", flush=True)
            elif current_event == "done":
                print(f"\n[完成] exit_code={data.get('exitCode')}")

            current_event = None

    return events


def delete_session(session_id):
    """删除会话"""
    res = requests.delete(
        f"{BASE_URL}/api/sessions/{session_id}",
        headers=HEADERS,
    )
    res.raise_for_status()


# ────────────────────────────────────────────────
# 使用示例
# ────────────────────────────────────────────────
if __name__ == "__main__":
    sid = create_session("claude")
    print(f"会话已创建: {sid}\n")

    # 可选：上传文件
    # upload_files(sid, ["./data/report.csv"])

    # 第 1 轮
    print("--- 第 1 轮 ---")
    chat(sid, "用 Python 写一个斐波那契数列生成器")

    # 第 2 轮（上下文延续）
    print("\n--- 第 2 轮 ---")
    chat(sid, "加上缓存优化，并对比性能")

    # 想开始新对话？删除旧会话，创建新的
    delete_session(sid)
    print(f"\n会话 {sid} 已删除")

    new_sid = create_session("codex")
    print(f"新会话已创建: {new_sid}（全新上下文）")
    chat(new_sid, "你好，这是一个全新的对话")
    delete_session(new_sid)
```

---

## 环境变量配置

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `CODEX_API_KEY` | 是* | — | Codex 中转服务的 API 密钥 |
| `ANTHROPIC_BASE_URL` | 是* | — | Anthropic API 端点 |
| `ANTHROPIC_AUTH_TOKEN` | 是* | — | Anthropic API 认证令牌 |
| `PORT` | 否 | `3000` | HTTP 服务端口 |
| `SESSION_TIMEOUT` | 否 | `1800` | 会话空闲超时（秒） |
| `MAX_CONCURRENT` | 否 | `10` | 最大并发 AI 进程数 |
| `MAX_QUEUED` | 否 | `100` | 最大排队请求数 |
| `QUEUE_TIMEOUT_MS` | 否 | `30000` | 排队等待超时（毫秒） |
| `PROCESS_TIMEOUT_MS` | 否 | `300000` | AI 进程超时（毫秒） |
| `SSE_HEARTBEAT_MS` | 否 | `15000` | SSE 心跳间隔（毫秒） |
| `MAX_BUDGET_USD` | 否 | `1` | Claude 单次调用最大费用（美元） |
| `CLAUDE_MODEL` | 否 | — | Claude 默认模型 |
| `API_TOKEN` | 否 | — | API 认证令牌，为空则不启用 |
| `CORS_ORIGIN` | 否 | `*` | CORS 允许的源 |
| `REDIS_URL` | 否 | — | Redis 连接地址（多副本部署时使用） |

> \* 根据使用的 provider 决定：用 Codex 需要 `CODEX_API_KEY`，用 Claude 需要 `ANTHROPIC_*`。
