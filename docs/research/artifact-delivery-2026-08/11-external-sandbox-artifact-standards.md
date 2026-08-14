# 11 · 外部沙箱基础设施与产物寻址标准

> 调研范围：沙箱/工作区基础设施（E2B / Cloudflare Sandbox / Daytona / Modal / Fly / Northflank）、
> 模型厂商的产物寻址（OpenAI Files+Containers / Anthropic Files API）、MCP 的 Resources 与
> tool-result content blocks、内容寻址与 GC、流式产出。
> 结论落在最后一节的 **产物模型 schema 草案**。
>
> 日期：2026-08-07 ｜ 口径：只写真读过的内容，每条带 `file:line` 或 URL。
> 未读过的一律标注「未验证」。

---

## 〇、一句话结论

业界在 2025–2026 已经收敛到一套相当一致的产物模型，而我们**三条痛点分别对应它的三个缺失件**：

| 用户痛点 | 业界的对应件 | 我们现在 |
|---|---|---|
| 「文件输出在用户端看不到」 | **产物声明发生在 tool_result 那一刻**（Anthropic `bash_code_execution_result.content[].file_id`）而不是轮次结束；沙箱层有 **fs watch 事件流**（E2B / Cloudflare 都有，Cloudflare 直接是 SSE） | `emitArtifacts` 在 `message_complete` **之前**跑一次，靠 `size+mtimeMs` diff（`agent/src/turn/artifacts.ts:340`、`:187`） |
| 「编辑文件容易出错、修改不到」 | 编辑工具**返回结构化 diff**：`old_start / old_lines / new_start / new_lines / lines`，create 返回 `is_file_update`（Anthropic code execution tool result） | 未在本次调研中核对我们 Edit 的返回契约（见 05 号报告；此处标未验证） |
| 「agent 说文件输出到 out 目录」 | **产物寻址是不透明句柄**：`file_011CNha8…` / `cfile_682d…`，MCP 2026-07-28 更把「句柄必须 opaque」写进规范正文 | `out/` 不只在提示词里 —— 它是**前端 API 契约的字段和 query 参数**（`frontend-user/src/features/claw/api/artifacts.ts:23`、`:87-96`），改提示词治不好 |

第四件事（我们完全没有、业界普遍有）：**内容寻址 + 不可变版本**。
我们算了 `sha256` 却用它做变更检测，对象 key 仍是路径（`backend/internal/claw/artifact_harvest.go:112-114`、`:173-175`），
身份锚是 `sha256(sessionID \0 relPath)`（`backend/internal/agentartifact/model.go` `DedupAnchorFor`），
**同名覆盖 = 原地改内容、无历史**。OCI 的做法是 digest 寻址不可变 blob + tag 作可变指针，两者分离。

---

## 一、先把我们的现状钉死（对比基线）

只列本次真读过的代码，作为后面每条外部结论的对照锚点。

### 1.1 检测：轮次结束的 size+mtime diff

```
agent/src/turn/artifacts.ts:340  emitArtifacts(workDir, baseline, sink)
agent/src/turn/artifacts.ts:98   snapshotOut() — 列 ./out 顶层 + 会话根可交付扩展名文件
agent/src/turn/artifacts.ts:187  if (prev && prev.size === cur.size && prev.mtimeMs === cur.mtimeMs) continue;
```

- 检测粒度 = **一轮一次**。模块头注释自陈：「turnLoop 开头 snapshot ./out/，结尾 diff」（`artifacts.ts:4`）。
- 判等依据 = `size + mtimeMs`（`:187`）。**内容改回原样且 size 相同** → 漏报；这是快照 diff 的固有代价。
- 有三道预算上限：`ROOT_SCAN_MAX_DEPTH=6` / `ROOT_SCAN_MAX_FILES=400` / `ROOT_SCAN_MAX_DIRS=2000`（`:39-42`），
  以及 `ARTIFACT_MAX_FRAMES=20`（`:46`）。预算耗尽只打一条 `log.warn`（`:163-171`），**用户侧无感知**。
- 越界写入靠 `relocateStrays` **物理 copyFile 进 out/**（`:225-289`）—— 因为下游只认 `out/`。

### 1.2 真源：on-list 拉取，与帧无关

```
backend/internal/claw/artifact_harvest.go:34   harvestSession → ListWorkspaceFiles(ctx, sessionID, "out")
backend/internal/claw/artifact_harvest.go:29   收割是 upsert-only：绝不按 live 工作区删已持久化的产物
```

`agent/src/turn/artifacts.ts:306` 的注释把这条讲得很直白：

> backend 的产物收割是 on-list 的 —— `claw/artifact.go:201` GetSessionArtifacts → `artifact_harvest.go:34`
> harvestSession 直接 ListWorkspaceFiles(out/)，**与 artifact 帧无关**。

也就是说我们有**两条并行的产物路径**：`artifact` 帧（对话里的卡片）与 on-list 收割（产物列表 + MinIO）。
两者只在「都扫 `out/`」这一点上对齐，没有共同的实体标识。这是很多不一致的结构性来源。

### 1.3 寻址：路径即身份，无版本

```
backend/internal/agentartifact/model.go  DedupAnchorFor(sessionID, relPath) = sha256(sessionID + "\x00" + relPath)  // uniqueIndex
backend/internal/claw/artifact_harvest.go:112-114  sum := sha256.Sum256(data);  key := artifactStorageKey(ownerID, sessionID, relPath)
backend/internal/claw/artifact_harvest.go:173-175  artifactStorageKey = "claw/<ownerID>/<sessionID>/<relPath>"
```

- `ContentSHA256` 只用于「内容变了没有」的判断（`:118`），**不参与寻址**。
- MinIO key 是路径派生。**同一份字节在两个会话 = 两个对象**，零去重。
- 同名再交付 → `Upsert` 同一行、覆盖同一个 key → **上一版不可恢复**。

### 1.4 泄漏：`out/` 是前端契约的一部分

```
frontend-user/src/features/claw/api/artifacts.ts:23   /** 相对会话 cwd: 文件 out/xxx.md, 目录 out/proj */  path: string;
frontend-user/src/features/claw/api/artifacts.ts:87-96  agentArtifactUrl(sessionId, path) → ?session_id=..&path=out/xxx.md
frontend-user/src/features/claw/api/artifacts.ts:99-106 agentArtifactZipUrl(sessionId, dir) → ?dir=out/proj
```

以及后端 `backend/internal/claw/artifact.go:15` 的安全注释：「`artifactRelPath` 只放行 `out/<basename>`」。

🔴 **这条是本报告最有行动价值的单条发现**：用户抱怨「agent 说文件输出到 out 目录」，
直觉解法是改提示词。但 `out/` 已经渗进了 DTO 字段名（`path`）、URL query（`?path=out/…`、`?dir=out/…`）、
后端路径白名单、以及 agent 侧的 `OUT_DIR` 常量（`agent/src/turn/artifacts.ts:19`）。
只要 `path` 还在对外 DTO 里，模型在对话里说出 `out/` 就永远是「自洽」的——它说的和 API 里写的是同一个词。
**要根治必须换寻址层，不是改文案层。**

---

## 二、沙箱基础设施横评：文件 API / 变更事件 / 导出

### 2.1 总表

| 平台 | list/read/write | **fs 变更事件** | 事件传输 | 产物导出 | 持久化 |
|---|---|---|---|---|---|
| **E2B** | `files.read/write/list` | ✅ `watchDir()` / `watch_dir()` | JS=回调；Python=**轮询** `get_new_events()` | `downloadUrl()` **预签名 URL**（需 `secure: true`，可设过期） | 沙箱 TTL |
| **Cloudflare Sandbox** | 有 | ✅ `sandbox.watch(path, opts)` | **SSE 流**，可直接 `return new Response(stream)` 给浏览器 | 未在本次读到 | Durable Object |
| **Daytona** | 全套（含 `findFiles`/`replaceInFiles`） | ❌ 未见 | — | `downloadFile` / `downloadFileStream`（Node Readable，**浏览器不支持**）；**无签名 URL** | Volumes，支持 detached 直传 |
| **Modal** | `write_text/read_text/list_files/stat/remove/copy_to_local` | ❌ **文档里是被注释掉的「File Watching」章节 = 计划中未实现** | — | `copy_to_local()` / Volume / `sb.exec` 管道 | Volume（**仅在 Sandbox 终止时回写**） |
| **Fly** | 无专用 FS API（微 VM） | — | — | — | 根 FS 临时；Volumes 持久；Sprites 休眠后 FS 存活 |
| **Northflank** | 无专用 FS API（通用 workload） | — | — | 挂 S3 兼容对象存储放 artifact | Volume 4GB–64TB + S3 |

### 2.2 关键读出

**(a) 实时 fs 事件是真实存在的能力，且 Cloudflare 已经做到「直通浏览器」。**

Cloudflare 2026-03-03 的变更日志明确：`sandbox.watch(path, options)` 返回 SSE 流，
事件含 `type`（create/modify/delete/move）与 `path`，move 还带 `from`；
底层是原生 inotify；文档给的两个示例分别是「把 stream 直接塞进 Response 发给浏览器」和「Worker 内 `parseSSEStream` 消费」。
过滤支持 `include` / `exclude` glob，**在 inotify 层生效**（不是拿到事件再过滤）。
生命周期事件有四种：`watching`（带 `watchId`）/ `event` / `error` / `stopped`。

E2B 同样有 `watchDir`，但两个 SDK 语义不一致（JS 回调、Python 轮询 `get_new_events()`），
且文档自陈三条限制：**事件异步追踪、投递可能延迟**；网络挂载上的事件不可靠（需 `allowNetworkMounts` 显式打开）；
**快速创建嵌套目录时非 CREATE 事件可能被吞**。另外它只感知沙箱内部变更，外部改动不上报。

→ 对我们的意义：**「实时」是可达的，但 fs 事件不是可靠的产物真源。**
inotify 的丢事件、延迟、以及「写到一半就触发 modify」是公认坑。业界的正解不是拿 watch 当唯一通道，
而是 **watch 做「实时提示」、tool_result / 显式声明做「权威账」**（见第三、四节）。
这恰好也解释了为什么 Anthropic 自家的 code execution 走的是 tool_result 附带 file_id，而不是 fs 事件。

**(b) 导出的标准答案是「预签名 URL」，而且要沙箱显式进入 secure 模式。**

E2B 的形态最完整：`Sandbox.create(template, { secure: true })` 之后
`await sandbox.downloadUrl('demo.txt', { useSignatureExpiration: 10_000 })`
生成带签名、带过期的 URL，**可以在浏览器里直接 fetch**。
Daytona 相反 —— 有 `downloadFileStream` 但明确「不支持浏览器与 serverless 环境」，且没有签名 URL，
意味着字节必须过一次你自己的后端。

→ 我们现在是 Daytona 模式（后端中转 + cookie 鉴权，`frontend-user/src/features/claw/api/artifacts.ts:109-117` 的
`agentArtifactByIdUrl` 走同源 cookie）。这没错，但**大文件会把 backend 变成瓶颈**：
`backend/internal/claw/artifact.go:54` 的 `maxArtifactBytes = 12 * 1024 * 1024` 就是这个约束的体现——
12MB 上限不是产品决策，是「backend 全量读进内存」的实现约束。走 MinIO 预签名 URL 可以直接拆掉这个天花板。

**(c) 持久化边界要显式设计，别指望沙箱。**

Modal 的 Volume 有一条很有杀伤力的语义：**文件只在 Sandbox 终止时才同步回 Volume**。
Fly Machine 的根 FS 是临时的。这与我们 `artifact_harvest.go:29-33` 那段注释描述的事故完全同构：

> executor 会话工作区是临时的（/home/bun/sessions，容器重启/重部署即清空），而产物的耐久真源是 MinIO+DB。
> 早先的「on-list 对账删除」会在重启后工作区为空时把已交付产物全清掉 → 重进会话产物消失。

我们已经吃过这个亏并用「upsert-only 永不删」补上了。代价是**永远无法回收**：agent 中途删掉的产物会
在列表里一直挂着（该注释自己承认了）。新模型必须把「工作区状态」和「产物账本」彻底解耦，
让删除有一个合法的、非工作区驱动的表达（见 §7 的 `state` 字段）。

---

## 三、模型厂商的产物寻址：OpenAI vs Anthropic

两家的形态高度一致，差异主要在生命周期。

### 3.1 Anthropic Files API + code execution

- 上传返回：`{"id": "file_011CNha8iCJcU1wXNR6q4V8w", "type": "file", "filename", "mime_type", "size_bytes", "created_at", "downloadable": false}`
- **`downloadable` 是一个方向位**：用户上传的文件 `downloadable: false`，**只有 skills / code execution 产生的文件才可下载**；
  下载自己上传的文件返回 400。
- 产物如何被声明：**在 tool_result 里**。`bash_code_execution_tool_result.content` 是
  `bash_code_execution_result`，其 `content` 字段是「**该命令创建的每个文件一项**，每项带 `file_id`」。
  官方 SDK 示例就是遍历 `response.content` → 找 `bash_code_execution_tool_result` → 取 `output_block.file_id` → `files.download()`。
- 生命周期：文件**持续到你显式 DELETE**；不可修改不可改名（要改内容 = 传新文件 + 删旧的）。
  容器：**创建后 30 天过期**，约 5 分钟不活动会 checkpoint，30 天内带 ID 重发可恢复；磁盘 5 GiB。
- 配额：单文件 500 MB，组织总量 500 GB；Files API 操作**免费**，只有内容进 Messages 才按 input token 计价。
- 🔴 安全警告值得抄：**「上传的文件对整个 workspace 可见，不按 end user / 会话 / session 隔离。
  永远不要接受终端用户传来的 file_id」**。这正是我们必须保留 `OwnsSession` 校验（`backend/internal/claw/artifact.go:14`）的原因，
  且换成不透明 ID 后**仍然要校验归属**——不透明 ≠ 授权。

### 3.2 OpenAI Code Interpreter

- 产物如何被声明：**assistant 消息的 annotation**：
  ```json
  { "type": "container_file_citation",
    "file_id": "cfile_682d514b2e00819184b9b07e13557f82",
    "container_id": "cntr_682d513bb0c48191b10bd4f8b0b3312200e64562acc2e0af",
    "filename": "cfile_682d514b2e00819184b9b07e13557f82.png" }
  ```
- 下载：`containers/{container_id}/files/{file_id}/content`。**寻址是二元组**（container + file），不是路径。
- 生命周期：**容器 20 分钟无活动即过期，数据「discarded and not recoverable」**；任何容器操作会刷新 `last_active_at`。
  文档直说：「趁容器还活着，把你需要的文件下载走。」

### 3.3 两家的共同点（这就是「标准」）

1. **对外寻址一律是不透明 ID，从不是路径。** `file_011C…` / `cfile_682d…` 里没有任何目录结构。
2. **产物声明挂在 tool_result / message annotation 上，不是「轮次结束扫目录」。**
   声明的时刻 = 产生的时刻，颗粒度 = 单次工具调用。
3. **执行环境（container）与产物存储（Files）是两个生命周期。**
   OpenAI 容器 20 分钟就没了，但 file 得单独取走；Anthropic 容器 30 天、文件到你删为止。
4. **产物不可变。** Anthropic 明说文件上传后不能改不能改名。要新内容就是新 `file_id`。

对照我们：我们的 `path` 是路径、声明在轮末、产物身份 = 路径（可原地覆盖）、
生命周期与会话绑死（`backend/internal/claw/artifact.go:10-11`：「生命周期 = 会话生命周期」）。
**四条全部相反。**

---

## 四、MCP：这是不是现成的「产物声明」标准？

### 4.1 三块可用的料

**(a) Resource（`resources/list` + `resources/read`）**
字段：`uri`（唯一标识）/ `name` / `title`（展示用）/ `description` / `mimeType` / `size`。
内容二选一：`text` 或 `blob`（base64）。
`annotations` 有三个字段很值钱：
- `audience`: `["user"]` / `["assistant"]` —— **「这东西是给用户看的还是给模型看的」**。
- `priority`: 0.0–1.0。
- `lastModified`: ISO 8601。

URI scheme 规范给了明确指导：`https://` **只在客户端能自己直接抓时用**；
其他情况「SHOULD 用别的 scheme 或自定义一个」。`file://` 可以不对应真实文件系统，
目录可以用 XDG MIME `inode/directory` 表示。自定义 scheme 必须符合 RFC3986。

**(b) Tool result content blocks**
2026-07-28 版列了五种：`text` / `image` / `audio` / **`resource_link`** / **`resource`（embedded）**。

```json
{ "type": "resource_link",
  "uri": "file:///project/src/main.rs",
  "name": "main.rs",
  "description": "Primary application entry point",
  "mimeType": "text/x-rust" }
```

```json
{ "type": "resource",
  "resource": { "uri": "...", "mimeType": "...", "text": "...",
                "annotations": { "audience": ["user","assistant"], "priority": 0.7,
                                 "lastModified": "2025-05-03T14:30:00Z" } } }
```

规范还有一条注脚很关键：**「tool 返回的 resource_link 不保证出现在 `resources/list` 里」**
—— 即「一次性产物」与「常驻资源目录」被明确区分开了。

**(c) 变更推送：2026-07-28 把 `resources/subscribe` 换成了 `subscriptions/listen`**
这是本次调研里对我们最有指导性的协议演进。changelog 第 4 条：

> Replace the HTTP GET endpoint and `resources/subscribe`/`resources/unsubscribe` with `subscriptions/listen`:
> a single long-lived POST-response stream for opted-in server-to-client change notifications.

细节：
- 客户端在 `params.notifications` 里**显式列出想要的类型**：`toolsListChanged` / `promptsListChanged` /
  `resourcesListChanged` / `resourceSubscriptions: string[]`（具体 URI 列表）。
- **服务端 MUST NOT 发客户端没要的类型。**
- 服务端**必须**先回 `notifications/subscriptions/acknowledged`，其中 `notifications` 字段
  **是服务端实际同意honor的子集**（不支持的类型直接省略）；客户端 SHOULD 比对自己要的和被确认的。
- 所有通知在 `_meta.io.modelcontextprotocol/subscriptionId` 上带订阅 ID 做多路复用。
- 关闭有「优雅」与「非优雅」之分：服务端主动结束时 SHOULD 回一个空 result 作为信号；
  **没有这个 result 的断流 = 意外断开，客户端 MAY 据此重连**。
- ⚠️ 同一版还**删掉了 SSE 的可恢复性**（`Last-Event-ID` 和 event ID）：
  「断流即丢失在途请求，客户端 MUST 用新 request ID 重发」。

**(d) MCP Apps（SEP-1865，Final，Extensions Track）**
`ui://` scheme 声明的 HTML 资源（`text/html;profile=mcp-app`），tool 通过 `_meta.ui.resourceUri` 关联，
host 在 **sandboxed iframe** 里渲染，iframe 与 host 用 **postMessage 上的 JSON-RPC** 通信。
设计取舍写得很清楚：**选「预声明资源」而不是「tool 结果里内嵌资源」也不是「resource link」**，
理由是预声明允许 host 预取模板、把「模板」与「数据」分离便于缓存、以及**允许对 UI 做安全审查**。

### 4.2 判断：能借什么，不能照抄什么

**能直接借（强烈建议）：**

1. **`uri` + `mimeType` + `size` + `title` + `description` 这套字段集**。我们的 `ArtifactDTO`
   （`backend/internal/claw/artifact.go:62-71`）已经有 Path/Name/Kind/Mime/Size/Title/Description，
   差的就是把 `Path` 换成 `uri`。这是一次字段改名 + 语义换血，不是重写。
2. **`annotations.audience`**。我们现在靠 `ROOT_SKIP_FILES`（`agent/src/turn/artifacts.ts:38`：
   `document.md` / `references.bib` / `terminology.md` / `index.html` / `README.md`）和
   `inReservedLexical`（`:242`，evidence/ 保留区）**用文件名黑名单猜「这是不是给用户的」**。
   `audience: ["assistant"]` vs `["user"]` 是同一个语义的**显式表达**。让生产者声明，比让消费者猜准得多。
   （`artifacts.ts:230-241` 那段 evidence/INDEX.md 被反复复制成 `out/INDEX-3.md` 的事故，
   本质就是「猜」的失败模式。）
3. **`resource_link` 作为 tool_result 的一等公民**，而不是轮末另起一路帧。
   这与 Anthropic 的 `bash_code_execution_result.content[].file_id` 是同一个形状，两个独立标准撞到一起 = 强信号。
4. **「tool 返回的 link 不保证在 list 里」这条区分**。对应我们「本轮新产出的卡片」vs「会话产物清单」两个面，
   现在这两个面是靠各自扫 `out/` 巧合对齐的（`agent/src/turn/artifacts.ts:306` 的注释），应当变成
   「同一实体的两种查询」。
5. **`subscriptions/listen` 的「显式 opt-in + 服务端回执实际支持的子集」握手**。
   这是治「护栏永远绿」类问题的通用手法：**不要让订阅方假设自己订到了**。
6. 🔴 **2026-07-28 「Stateful Tools」一节的原文，几乎是替我们写的**：
   > **Opacity.** Handles that encode internal structure invite parsing or guessing; opaque identifiers do not.
   >
   > **Lifetime.** Because handles outlive any single connection, the server's retention policy
   > should be **stated in the creation tool's description** so the model can see it when deciding to create state.
   >
   > **Expiry errors.** A call against an expired or unknown handle should return a tool execution error that says so.

   三条全中：① 句柄要不透明（治「out/ 泄漏」）；② **保留策略写进工具描述让模型看见**
   （治「模型乱说文件在哪、活多久」）；③ 过期句柄要返回**可自纠的 tool error**（治「修改不到」）。

**不能照抄：**

- **MCP 的传输语义不适用**。2026-07-28 把 MCP 变成**无状态**（删 `initialize` 握手、删 session、
  删 SSE 可恢复性）。我们的 agent↔backend 是长连 WS pipe（`backend/internal/agentbridge/ws.go`，未在本次细读），
  会话状态是产品的核心。**借它的数据形状，别借它的连接模型。**
- **MCP Apps 的 `ui://` 目前对我们收益低**。它解决的是「第三方 server 给未知 host 送 UI」的信任问题
  ——预声明模板是为了让 host 能审查。我们的 agent 和前端是同一个团队的一等公民，
  这层信任隔离换来的是可观的复杂度。**但它的「模板/数据分离」思想值得用在 HTML 类产物预览上**
  （我们已有 `shared/components/chat/HtmlRender.tsx`，未在本次细读）。
- **`resources/read` 返回 base64 `blob` 的方式不能用于大产物**。docx/pptx/pdf 走 base64 会把
  内存放大 4/3 倍并穿过整条 JSON 管道。业界大文件一律是「元数据走协议、字节走 HTTP + 签名 URL」。

---

## 五、内容寻址、去重、版本、GC

### 5.1 OCI 的模型（业界最成熟的产物仓库）

核心命题：**「everything is addressed by digest」→ registry 对同一 blob 只存一份，
即使多个 artifact 引用它。** 并且：

> if you have a blob's SHA-256 digest, you can verify its integrity regardless of which server you
> downloaded it from, because two registries serving the same digest are provably serving the same bytes.

由此得到的结构性分层（这是我们最该抄的一条）：

```
不可变层：blob    ← 由 sha256 digest 寻址，永不原地改
可变层：  tag     ← 可变指针，指向某个 digest
中间层：  manifest ← 描述「一个逻辑产物由哪些 blob 组成 + 元数据」
```

去重实现：本地 FS 用硬链接，远程存储用 blob 引用的 cache DB；上传前先按 digest 探测是否已存在（HEAD blob）。
GC：**引用计数 + mark-and-sweep**。业界公认的难点是「分布式去重下的 GC」——
错删一个被共享的 chunk 会跨多个租户炸开。

### 5.2 对照我们

| 维度 | OCI | 我们 |
|---|---|---|
| 寻址 | digest（内容） | 路径（`artifactStorageKey(ownerID, sessionID, relPath)`，`artifact_harvest.go:173-175`） |
| 不可变性 | blob 永不改 | 同 `DedupAnchor` 覆盖同一行 + 同一 key（`:118-128`） |
| 可变指针 | tag → digest | 无（行本身既是身份又是内容） |
| 去重 | 跨 artifact 全局 | **零**（sha256 只做 change detection，`:112-118`） |
| 版本 | 天然有（digest 历史） | **无** |
| GC | refcount / mark-sweep | 会话 delete 时全清（`cleanupArtifacts`，`:151-161`）；平时 upsert-only 永不回收 |

一个具体的量化后果：同一份 30MB 的 docx 被用户在三个会话里各生成一次 = MinIO 三份 90MB。
`artifact_harvest.go:86` 的注释还自陈目录产物「每轮重建 zip，但 sha256 去重仍挡住 MinIO 重传」——
说明作者已经意识到 sha256 有去重价值，只是**去重只在「同一行的前后两版之间」生效，没有跨行/跨会话**。

### 5.3 GC 策略的业界做法（可直接落地的三档）

1. **blob 层 refcount**：`agent_blobs.refcount`，版本行增删时 ±1，归零进 `pending_gc` 队列，
   延迟一个安全窗口（例如 24h）后再删对象。**延迟是必须的** —— 并发上传同一 digest 时
   「一个在删、一个刚引用」是经典竞态（OCI 的 registry 都栽过）。
2. **版本层保留策略**：`keep last N versions per artifact` + `keep versions newer than T`。
   我们的类比参照：`workdir 默认 30 天 GC`（记忆里 data-analysis 报告的结论，**未在本次调研中核对代码**，标未验证）。
3. **artifact 层软删**：`state = deleted` + `deleted_at`，用户可见的「删除」不物理删字节，
   给一个撤销窗口。这同时解决了 §2.2(c) 那条「upsert-only 导致永不回收」的死结 ——
   删除有了一个**不依赖工作区当前状态**的合法表达。

---

## 六、大文件与流式产出（「边生成边可见」）

### 6.1 业界的三种做法

**(a) fs watch → SSE 直通浏览器**（Cloudflare）。最直接，但见 §2.2(a) 的可靠性坑：
inotify 会在「写到一半」触发 modify、快速嵌套创建会吞事件、E2B 自陈投递可能延迟。
**适合做「正在生成」的提示，不适合做交付判定。**

**(b) 同 ID 增量 data part 自动 reconcile**（Vercel AI SDK 5）。
服务端流式写一个 `data-<type>` part 并指定 ID，**同 ID 再写会在客户端自动 reconcile 更新那一份**。
还有 `transient: true`：发给客户端但**不进消息历史**，流结束后自动移除，只留最终结果。
这套语义对我们特别贴：`artifact.progress`（transient，不落 journal）+ `artifact.sealed`（持久，落 journal）。

**(c) 版本化文档 + 侧栏面板**（Vercel AI Chatbot Artifacts）：
`createDocument` 工具带 `title` + `kind`（text/code/image/sheet），
产物在独立面板渲染、**全部保留版本历史 + 可视化 diff**。

### 6.2 我们的可行边界（诚实评估）

- **文本类产物（.md / .csv / .html / .svg）可以真正流式**：agent 侧本来就是自己在写，
  在 Write/Edit 工具里插一条 `artifact.chunk` 帧几乎零成本。
- **二进制类（docx/pptx/pdf/xlsx）不可能流式**：它们是 `ExportDocument` / `BuildDeck` 一次性构建产物
  （`agent/src/turn/artifacts.ts:294-308` 的注释说得很明确：二进制产物「内容已经定型」，
  引用句柄的闸只能设在生成时刻）。对它们只能做**状态流**：`generating → sealed`，不是内容流。
- **大文件下载必须绕开 backend 内存**。现在 `maxArtifactBytes = 12MB`（`backend/internal/claw/artifact.go:54`），
  且 `harvestFile` 是 `ReadWorkspaceFileRaw` 全量读进 `[]byte` 再 `PutObject`（`artifact_harvest.go:78-82`、`:119-121`）。
  MinIO 预签名 GET（E2B 那种形态）能把下载路径完全拆掉；上传路径要拆则需要 agent 直传 MinIO，改动更大。

---

## 七、产物模型 schema 草案

### 7.1 设计原则（每条都对应上面的证据）

| 原则 | 依据 |
|---|---|
| **对外只有不透明句柄，路径永不出 agent 容器** | Anthropic `file_011C…` / OpenAI `cfile_…`；MCP 2026-07-28「Opacity」 |
| **声明在 tool_result 时刻，不在轮末** | Anthropic `bash_code_execution_result.content[].file_id` |
| **字节内容寻址不可变，逻辑产物是可变指针** | OCI digest/tag 分离 |
| **audience 由生产者声明，不由消费者猜文件名** | MCP `annotations.audience`；对照我们 `ROOT_SKIP_FILES` / evidence 事故（`artifacts.ts:38`、`:230-241`） |
| **执行环境生命周期 ≠ 产物生命周期** | OpenAI 容器 20min vs file 独立；我们 `artifact_harvest.go:29-33` 的事故复盘 |
| **保留策略写进工具描述让模型能看见** | MCP 2026-07-28「Lifetime」 |
| **订阅显式 opt-in + 服务端回执实际支持的子集** | MCP `subscriptions/listen` acknowledged 语义 |

### 7.2 实体（三张表）

```sql
-- ① 内容寻址的字节层。跨会话、跨用户、跨 feature 全局去重。
CREATE TABLE agent_blobs (
  sha256        CHAR(64)     NOT NULL,           -- 主键 = 内容
  size_bytes    BIGINT       NOT NULL,
  mime          VARCHAR(160) NOT NULL DEFAULT '',
  storage_key   VARCHAR(200) NOT NULL,           -- blobs/<sha[0:2]>/<sha[2:4]>/<sha>
  refcount      INT          NOT NULL DEFAULT 0, -- 被 versions 引用的次数
  unref_at      DATETIME     NULL,               -- refcount 归零时刻;GC 延迟窗口起点
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (sha256),
  KEY idx_gc (refcount, unref_at)                -- GC 扫 refcount=0 AND unref_at < now-24h
);

-- ② 逻辑产物。用户看到的「一份东西」,可以有多个版本。
CREATE TABLE agent_artifacts_v2 (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id     CHAR(26)     NOT NULL,           -- 对外唯一寻址:art_<base32(128bit random)>
                                                 -- 🔴 不可从 session/path 派生 —— 派生 = 可猜 = 可枚举
  owner_kind    VARCHAR(32)  NOT NULL DEFAULT 'user',
  owner_id      BIGINT UNSIGNED NOT NULL,
  feature_key   VARCHAR(64)  NOT NULL,           -- claw / boltslides / sci_draw / stat_lab / prism
  session_id    VARCHAR(191) NOT NULL,

  slot          VARCHAR(512) NOT NULL,           -- 幂等锚:生产者稳定标识(通常是容器内相对路径)。
                                                 -- 🔴 内部字段,绝不出现在任何对外 DTO / URL / 提示词
  display_name  VARCHAR(255) NOT NULL,           -- 「MBI分析结果.docx」—— 给用户看的名字,无目录
  title         VARCHAR(255) NOT NULL DEFAULT '',
  description   VARCHAR(1024) NOT NULL DEFAULT '',

  kind          VARCHAR(16)  NOT NULL DEFAULT 'file',   -- file | bundle(原 dir)
  audience      VARCHAR(16)  NOT NULL DEFAULT 'user',   -- user | assistant | both  (MCP annotations.audience)
  state         VARCHAR(16)  NOT NULL DEFAULT 'ready',  -- generating | ready | quarantined | superseded | deleted
  origin        VARCHAR(32)  NOT NULL DEFAULT 'declared',-- declared(工具显式) | detected(兜底扫描) | relocated

  current_version BIGINT UNSIGNED NULL,          -- → agent_artifact_versions.id
  version_count INT          NOT NULL DEFAULT 0,

  expires_at    DATETIME     NULL,               -- 保留策略的显式表达(工具描述里要把它告诉模型)
  deleted_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_public (public_id),
  UNIQUE KEY uk_slot (session_id, feature_key, slot),   -- 幂等:同一 slot 再交付 = 加版本,不是新产物
  KEY idx_owner (owner_id, feature_key, state),
  KEY idx_session (session_id, state)
);

-- ③ 不可变版本。产物的每一次交付 = 一行,永不更新。
CREATE TABLE agent_artifact_versions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  artifact_id   BIGINT UNSIGNED NOT NULL,
  version_no    INT          NOT NULL,           -- 1,2,3... 同 artifact 内递增
  blob_sha256   CHAR(64)     NOT NULL,           -- → agent_blobs
  size_bytes    BIGINT       NOT NULL,
  mime          VARCHAR(160) NOT NULL,

  produced_turn_id  VARCHAR(64) NOT NULL DEFAULT '',  -- 归因:哪一轮
  produced_tool_id  VARCHAR(64) NOT NULL DEFAULT '',  -- 归因:哪一次工具调用(tool_use_id)
  produced_tool     VARCHAR(64) NOT NULL DEFAULT '',  -- Write / Edit / ExportDocument / BuildDeck / Bash
  note          VARCHAR(255) NOT NULL DEFAULT '',     -- 「按审稿意见补了第3节」

  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ver (artifact_id, version_no),
  KEY idx_blob (blob_sha256)
);
```

### 7.3 寻址

**对外（前端 / URL / 用户可见文案）唯一形态：**

```
GET  /api/v1/user/artifacts/{public_id}              → 元数据(当前版本)
GET  /api/v1/user/artifacts/{public_id}/content      → 字节(302 到 MinIO 预签名 URL)
GET  /api/v1/user/artifacts/{public_id}/v/{n}/content→ 指定版本字节
GET  /api/v1/user/sessions/{sid}/artifacts           → 会话产物清单
```

- `public_id` 形如 `art_01J9K3M7QW8ZXV4T2NBHRC5PGD`（26 字符 base32）。
  **绝不能从 `session_id + slot` 哈希派生** —— 我们现有的 `DedupAnchorFor` 就是派生的
  （`backend/internal/agentartifact/model.go`），它做内部幂等锚很好，做对外 ID 会变成可枚举面。
  两者必须是**不同的两个字段**：`slot` 管幂等（内部），`public_id` 管寻址（外部）。
- 🔴 **不透明 ≠ 授权**。Anthropic 的 workspace 警告说得很清楚：
  「never accept file_id values from end users」。`OwnsSession` 那类校验一条都不能少
  （对照 `backend/internal/claw/artifact.go:14`）。

**对内 / 对模型（agent 容器内、工具参数、句柄）：**

```
artifact://art_01J9K3M7QW8ZXV4T2NBHRC5PGD          # 当前版本
artifact://art_01J9K3M7QW8ZXV4T2NBHRC5PGD@3        # 固定版本
```

符合 MCP 自定义 scheme 的要求（RFC3986），且规范明确「除非客户端能自己直接抓，
否则 SHOULD 用自定义 scheme 而不是 https://」—— 正是我们的情况。

**模型侧的关键约束（治痛点三）：**
`publish_artifact` 工具的 `tool_result` **只回 `artifact://art_…` 和 `display_name`，不回路径**。
模型上下文里从此不存在 `out/` 这个词，它就说不出来。
这是**结构性的**，比在提示词里写「不要提 out 目录」可靠一个数量级 ——
参照记忆里那条铁律：「否定式规则没用，须正面模板」（ASCII 框图复发事件）。

### 7.4 声明通道（治痛点一）

**主通道 —— 显式声明工具**（对齐 Anthropic tool_result 时刻声明）：

```ts
publish_artifact({
  path: "MBI分析结果.docx",        // 容器内路径,只在这一次调用里出现
  title: "MBI 量表信效度分析结果",
  description: "含三线表与 Methods 段",
  audience: "user",
})
// → tool_result:
// { artifact: "artifact://art_01J9K…", version: 2, display_name: "MBI分析结果.docx",
//   note: "已交付给用户,可在对话右侧产物区查看。此产物保留至 <expires_at>。" }
```

工具 description 里必须写明保留策略（MCP「Lifetime」那条），
这样模型在决定要不要交付、要不要提醒用户下载时能看到真实的过期时间，而不是编一个。

**副通道 —— 兜底检测**，保留现有 snapshot/diff 逻辑（`agent/src/turn/artifacts.ts:98/183`），
但两处改动：
1. 产出 `origin='detected'` 的 artifact，在 UI 上与 `declared` 可区分（用于观测「模型有多少次没走主通道」）。
2. **`relocateStrays` 的 copyFile 整个删掉**（`artifacts.ts:225-289`）。
   它存在的唯一理由是「backend 只认 `out/`」（`:212-214` 的注释自陈）。
   一旦寻址换成 `public_id`，任意路径都能被登记，物理搬运就没有意义了 ——
   连带消掉「同名加 `-2` 后缀」「覆盖已有 out/ 文件」那一整族坑（`:269-279`）。

**实时通道 —— 流式提示**（对齐 Vercel AI SDK 的 transient data part）：

```
{ type: "artifact.progress", artifact: "artifact://art_…", state: "generating",
  bytes_written: 12034, transient: true }     ← 不落 journal,流结束即消失
{ type: "artifact.sealed",   artifact: "artifact://art_…", version: 2 }  ← 落 journal,权威
```

fs watch（E2B/Cloudflare 那种）**可以**用来驱动 `artifact.progress`，
但**绝不能**用来驱动 `sealed` —— 见 §2.2(a) 的丢事件/半写触发问题。

### 7.5 生命周期

| 阶段 | 动作 |
|---|---|
| 产生 | `publish_artifact` → 计算 sha256 → blob 存在则 refcount+1（**跨会话去重**），否则上传 → 新 version 行 → 更新 `current_version` |
| 变更 | 同 `slot` 再次 publish → **新 version 行**，旧版本保留可访问 |
| 隔离 | 交付闸（`agent/src/turn/artifacts.ts:363-374` 的 `runDeliveryGate`）命中 → `state='quarantined'`，不物理搬文件 |
| 用户删除 | `state='deleted'` + `deleted_at`，字节不动（撤销窗口） |
| 会话重置/删除 | 所有 artifact → `deleted`，versions 行删除 → blob refcount-1 |
| GC | 每日扫 `refcount=0 AND unref_at < now-24h` → 删 MinIO 对象 → 删 blob 行 |
| 过期 | `expires_at` 到期 → 同「用户删除」路径 |

🔴 关键收益：**「删除」终于有了一个不依赖工作区当前状态的合法表达。**
`artifact_harvest.go:29-33` 那条「upsert-only 绝不按 live 工作区删」的死结解开了 ——
它之所以必须永不删，是因为**唯一的删除信号是「工作区里没有了」，而工作区会因为容器重启而全空**。
新模型里删除是**显式动作**（用户点删 / agent 调 `unpublish_artifact` / 会话销毁），
与工作区是否存活完全正交。

### 7.6 事件帧契约

```ts
type ArtifactFrame =
  | { type: "artifact.created";  artifact: string; version: number;
      display_name: string; mime: string; size: number;
      kind: "file" | "bundle"; audience: "user" | "assistant" | "both";
      title?: string; description?: string; origin: "declared" | "detected" }
  | { type: "artifact.updated";  artifact: string; version: number;
      size: number; note?: string }
  | { type: "artifact.progress"; artifact: string; bytes_written: number; transient: true }
  | { type: "artifact.removed";  artifact: string; reason: "quarantined" | "deleted" | "expired" };
```

对照现在的单一帧（`agent/src/turn/artifacts.ts:379`）：
`{ type: "artifact", name, path, kind, mime, size }` —— **`path` 字段直接删掉**，
`name` → `display_name`，新增 `artifact`（句柄）/ `version` / `audience` / `origin`。

### 7.7 编辑可靠性（治痛点二，方向性建议）

Anthropic code execution 的两个 tool_result 形状值得直接对齐：

```json
// create → 明确告诉模型「这是新建还是覆盖」
{ "type": "text_editor_code_execution_create_result", "is_file_update": false }

// str_replace → 返回结构化 diff,模型能自查改对没有
{ "type": "text_editor_code_execution_str_replace_result",
  "old_start": 3, "old_lines": 1, "new_start": 3, "new_lines": 1,
  "lines": ["-  \"debug\": true", "+  \"debug\": false"] }
```

「改不到」的典型根因是**编辑成功与否只有模型自己的叙述**。
返回 `new_start/new_lines/lines` 相当于让工具替模型做了一次验证，
而且这个 diff 可以**直接喂给前端渲染**（我们已有 diff 渲染，记忆里 prism 有 diff 块）。
⚠️ 我们当前 Edit 工具的返回契约本次未读，**这条标未验证**，请与 05 号报告交叉核对。

---

## 八、迁移路径（按「能单独上线」切）

| 阶段 | 内容 | 独立价值 | 风险 |
|---|---|---|---|
| **P0** | 建 `agent_blobs` + `agent_artifacts_v2` + `versions` 三表；harvest 写双份（老表继续、新表并行） | 零用户可见变化，先把数据攒起来 | 低。迁移铁律：新表新编号 SQL，老表不动 |
| **P1** | DTO 加 `public_id`，前端**优先**用它；`path` 标 deprecated 但保留 | 前端可以先切下载/预览 URL | 中。`agentArtifactUrl` 有多个调用点（`frontend-user/src/features/claw/api/artifacts.ts:152-180` 有 4 个 feature 的具名实例） |
| **P2** | 上 `publish_artifact` 工具 + 帧换新契约；提示词从「写进 ./out」改成「调 publish_artifact」 | **痛点三根治** | 中高。要同时改 agent 提示词 + 帧 + 前端 fold。⚠️ 改 prompt 必须 `restart scholar_agent`（记忆里的坑） |
| **P3** | 删 `path` 字段与 `relocateStrays`；blob refcount GC 上线 | 去重 + 存储回收 + 消掉一整族越界搬运坑 | 高。**必须确认 P1 的前端切换已 100% 完成**，否则老卡片全变死链 |
| **P4** | MinIO 预签名 URL 直下，拆掉 `maxArtifactBytes = 12MB`（`backend/internal/claw/artifact.go:54`） | 大文件不再撑爆 backend | 中。要处理签名过期 + 前端重取 |
| **P5**（可选） | `artifact.progress` 流式帧 | 「边生成边可见」 | 中。只对文本类产物有意义 |

**不建议做的：**
- 不建议引入 fs watch（inotify）当作交付判定通道。E2B 自己的文档就列了三条不可靠性；
  我们连 watch 的运维面（每会话一个 inotify watch、bwrap 内的 inotify 可用性）都还没验证过。
- 不建议上 MCP Apps / `ui://`。它解决的是跨组织信任问题，我们没有这个问题。
- 不建议为了对齐 MCP 而改造 agent↔backend 的连接模型。2026-07-28 的无状态化是为了
  HTTP 中间件可缓存/可路由，与我们长连 WS 的诉求相反。

---

## 九、证据清单

### 内部（本次真读过的文件与行号）

| 位置 | 结论 |
|---|---|
| `agent/src/turn/artifacts.ts:4` | 模块头自陈：turnLoop 开头 snapshot、结尾 diff |
| `agent/src/turn/artifacts.ts:19` | `const OUT_DIR = "out"` |
| `agent/src/turn/artifacts.ts:38` | `ROOT_SKIP_FILES` = 用文件名黑名单猜 audience |
| `agent/src/turn/artifacts.ts:39-42` | 扫描三档预算 6 / 400 / 2000 |
| `agent/src/turn/artifacts.ts:46` | `ARTIFACT_MAX_FRAMES = 20` |
| `agent/src/turn/artifacts.ts:163-171` | 预算耗尽只 log.warn，用户无感 |
| `agent/src/turn/artifacts.ts:187` | diff 判等 = `size && mtimeMs` |
| `agent/src/turn/artifacts.ts:212-214` | `relocateStrays` 存在的唯一理由 = backend 只认 `out/` |
| `agent/src/turn/artifacts.ts:230-241` | evidence/INDEX.md 被反复复制成 out/INDEX-N.md 的事故 |
| `agent/src/turn/artifacts.ts:269-279` | 同名加后缀 / 覆盖告警 |
| `agent/src/turn/artifacts.ts:306` | **on-list 收割与 artifact 帧无关**（两条并行路径） |
| `agent/src/turn/artifacts.ts:363-374` | `runDeliveryGate` → quarantined 过滤 |
| `agent/src/turn/artifacts.ts:379` | 现帧形状 `{type:"artifact", name, path, kind, mime, size}` |
| `backend/internal/claw/artifact.go:10-11` | 「生命周期 = 会话生命周期」 |
| `backend/internal/claw/artifact.go:15` | `artifactRelPath` 只放行 `out/<basename>` |
| `backend/internal/claw/artifact.go:44` | `const artifactDir = "out"` |
| `backend/internal/claw/artifact.go:54` | `maxArtifactBytes = 12MB` |
| `backend/internal/claw/artifact.go:62-71` | `ArtifactDTO` 字段集 |
| `backend/internal/claw/artifact_harvest.go:29-33` | upsert-only 的事故复盘与代价 |
| `backend/internal/claw/artifact_harvest.go:34` | on-list `ListWorkspaceFiles(out)` |
| `backend/internal/claw/artifact_harvest.go:78-82` | `ReadWorkspaceFileRaw` 全量读进内存 |
| `backend/internal/claw/artifact_harvest.go:86` | 目录产物每轮重建 zip |
| `backend/internal/claw/artifact_harvest.go:112-128` | sha256 只做变更检测，key 是路径派生 |
| `backend/internal/claw/artifact_harvest.go:151-161` | `cleanupArtifacts` 会话级全清 |
| `backend/internal/claw/artifact_harvest.go:173-175` | `artifactStorageKey = claw/<owner>/<sid>/<relPath>` |
| `backend/internal/agentartifact/model.go` | `Artifact` 全字段 + `DedupAnchorFor = sha256(sid \0 relPath)` uniqueIndex |
| `frontend-user/src/features/claw/api/artifacts.ts:23` | DTO `path` 注释直接写 `out/xxx.md` |
| `frontend-user/src/features/claw/api/artifacts.ts:87-96` | URL query `?path=out/…` |
| `frontend-user/src/features/claw/api/artifacts.ts:99-106` | URL query `?dir=out/…` |
| `frontend-user/src/features/claw/api/artifacts.ts:152-180` | 4 个 feature 的具名实例（迁移面） |

### 外部（URL）

- E2B 目录监听：https://e2b.dev/docs/filesystem/watch
- E2B 下载与预签名 URL：https://e2b.dev/docs/filesystem/download
- Cloudflare Sandbox 文件监听：https://developers.cloudflare.com/sandbox/guides/file-watching
- Cloudflare 实时文件事件变更日志（2026-03-03）：https://developers.cloudflare.com/changelog/post/2026-03-03-sandbox-watch-file-events/
- Daytona TypeScript FileSystem：https://www.daytona.io/docs/en/typescript-sdk/file-system/
- Modal Sandbox 文件系统：https://modal.com/docs/guide/sandbox-files
- MCP Resources（2025-06-18，字段/annotations/URI scheme 原文）：https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP Tools（2026-07-28，content blocks / resource_link / Stateful Tools「Opacity·Lifetime·Expiry」）：https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- MCP 2026-07-28 changelog（无状态化、`subscriptions/listen` 取代 `resources/subscribe`、删 SSE 可恢复性）：https://modelcontextprotocol.io/specification/2026-07-28/changelog
- MCP Subscriptions 模式（opt-in / acknowledged 子集 / 优雅关闭）：https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
- MCP Apps SEP-1865（`ui://`、预声明 vs 内嵌的取舍）：https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
- Anthropic Files API（file_id / downloadable / 500MB·500GB / workspace 隔离警告）：https://platform.claude.com/docs/en/docs/build-with-claude/files
- Anthropic code execution tool（`bash_code_execution_result.content[].file_id`、`str_replace` 结构化 diff、容器 30 天 / 5GiB）：https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- OpenAI Code Interpreter（`container_file_citation`、容器 20 分钟过期）：https://developers.openai.com/api/docs/guides/tools-code-interpreter
- Vercel AI SDK 自定义 data part（同 ID reconcile / transient）：https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data
- OCI 内容寻址与去重论述：https://nesbitt.io/2026/02/18/what-package-registries-could-borrow-from-oci.html
- Fly Volumes：https://fly.io/docs/volumes/overview/
- Northflank 沙箱产品页（持久卷 + S3 兼容对象存储放 artifact）：https://northflank.com/product/sandboxes

### 明确未验证的

1. 我们 Edit / Write 工具的 `tool_result` 返回契约（§7.7 的建议基于外部标准，没读我们的实现）—— 见 05 号报告。
2. `backend/internal/agentbridge/ws.go` 的帧传输细节（只从 CLAUDE.md 得知形态）。
3. `prompts/claw.go` 里「成果交付」段的原文（只从 `artifact.go:5-8` 的注释转述得知）。
4. 前端产物卡片/预览面板的渲染实现（`ClawPreview` / `artifact-format.ts` 等）。
5. workdir 30 天 GC 的具体实现（§5.3 引自记忆，未核对代码）。
6. `docs/research/artifact-delivery-2026-08/` 下 01–07 号兄弟报告的内容，**本报告未与之交叉核对**，
   若结论冲突以读过代码的一方为准。
