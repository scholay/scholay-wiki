# 现状架构测绘与妥协清单 (Current Architecture & Compromise Inventory)

> 文档定位:Scholay AI agent 平台的「当前架构基线」keystone 文档。核心论点 ——
> **agent 是一个桌面 Claude-Code 风格 CLI(代号 cc-haha)外面套了一层 HTTP+WS 守护进程,
> 再被 Go 后端 `agentbridge` 适配成多用户 Web 服务,被 4 个 feature 消费。**
> 本文逐层测绘,并在 §8 集中列出「因桌面工具改 web/多用户」而产生的妥协。
> 所有结论均来自子系统读取者的 `file:line` 引用,不做发明;地图间冲突或不明处会显式标注。

---

## 1. 总览 (Architecture at a Glance)

### 文字架构图

```
┌─────────────┐
│   浏览器     │  React 19 SPA (frontend-user)
│ (多 tab)    │  - useAgentSocket.ts: WS 状态机 (idle/connecting/open/reconnecting/
└──────┬──────┘    closed/error/displaced)
       │           - 先 POST /<feature>/session/ws-ticket 拿 30s 一次性票
       │ HTTPS / WSS  - 再用 ?ws_token=<...> 升级 WS
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  nginx (同源反代, 整站唯一入口 5411)                                  │
│  - /api/*  → backend:8080        - CheckOrigin 的事实依赖在这一层      │
│  - WS 升级透传                                                       │
└──────┬──────────────────────────────────────────────────────────┘
       │ (scholar-network)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  backend (Go/Gin) —— agentbridge 适配层                            │
│  - FeatureBridge: 用户↔session 映射 + WS pipe + 鉴权 + 配额 + 用量    │
│  - agent.Client: 纯 HTTP 客户端 (黑盒, 从不读 jsonl)                  │
│  - displacement: activeWSConns sync.Map (进程内, 单实例假设)         │
│  - 数据落点: MySQL agent_sessions(映射) / agent_config(单行provider)  │
│              Redis quota:tokens:* + agent:ws_ticket:*               │
│              MinIO (claw artifact / prism PDF)                      │
│  后端横跨 scholar-network + scholar-agent-net 两网(单向可达 agent)    │
└──────┬──────────────────────────────────────────────────────────┘
       │ HTTP /api/{sessions,agents,providers,models}  +  WS /ws/<sessionId>
       │ (scholar-agent-net, internal:true 无公网)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  agent 容器 (scholar_agent, Bun, :3456) —— cc-haha 桌面 CLI        │
│  - src/server/ (Web 加层): HTTP router + ws/handler + 子进程管理      │
│  - 每个 session 起一个 CLI 子进程 (Bun.spawn, --print 无头流式)        │
│  - query loop (query.ts): model 调用 + tool 执行 + 压缩 + 续轮         │
│  - 子 agent (AgentTool/runAgent): 递归 query()                       │
│  - skills / slash commands / CLAUDE.md memory (桌面原生)             │
│  - 数据落点: ~/.claude/projects/.../<sessionId>.jsonl (单一共享盘)     │
│  - 每 session cwd 隔离: ~/sessions/<id> (SCHOLAY_ISOLATE_SESSIONS)   │
│  - 预装 MCP: minicod (学术检索, 唯一 mcp__* )                         │
└──────┬───────────────────────────────────┬──────────────────────┘
       │ HTTPS_PROXY 强制                    │ (shared volume /work)
       ▼                                    ▼
┌──────────────────┐               ┌────────────────────┐
│ scholar_egress_  │               │ scholar_prism_tex  │
│ proxy (tinyproxy)│  唯一出网口     │ network_mode:none  │ LaTeX 编译沙箱
│ → 上游模型/MCP    │  SSRF 过滤      │ read_only rootfs   │ (air-gapped)
└──────────────────┘               └────────────────────┘
```

### 数据落点小结

| 数据 | 位置 | 真值归属 |
|---|---|---|
| 会话 transcript | agent 容器 `~/.claude/projects/.../<sid>.jsonl` | **agent 自管,backend 黑盒** |
| 用户↔session 映射 | MySQL `agent_sessions` | backend |
| provider/model 配置 | MySQL `agent_config`(单行 id=1)→ 推送到 agent `providers.json` | backend 为源,agent 为副本 |
| 每日 token 配额计数 | Redis `quota:tokens:<uid>:<YYYYMMDD>`(TTL 25h, fail-open) | backend(Redis,无 SQL 表) |
| token 账本 | MySQL `llm_token_usage` | backend |
| WS 一次性票 | Redis `agent:ws_ticket:<token>`(persist pool, TTL 30s, fail-closed) | backend |
| 交付物/编译产物 | MinIO(claw `agent_artifacts` / prism PDF) | backend |
| prism LaTeX 正文 | MySQL(`prism_*`,**DB-as-truth**) | backend |

---

## 2. 后端 agentbridge 层

`agentbridge` 是把单机 CLI 适配成多用户 Web 的核心。一个进程一个 `Bridge` 单例
(`bridge.go:33-123`),持有 `client *agent.Client` + `repo *Repository` +
`activeWSConns sync.Map` + `llmRec`。`Bridge.For(spec)`(`bridge.go:99`)返回轻量值视图
`*FeatureBridge`,所有方法按 `spec.Key` 自动 scope。

### 2.1 FeatureBridge 抽象与会话生命周期

会话方法(全部 `bridge.go`):
- `GetOrCreateSession`(`:194`):`repo.Get` → `ErrNotFound` 则 `createAndPersist`;**不探活**,把自愈推给下游 404 分支。
- `GetSessionID`(`:208`):只读,无则返空,**绝不创建**(用于「reset 前抓旧 sid 去清残留」)。
- `ResetSession`(`:223`):建新 → 更新 DB → 失败回滚新 session → 删旧(404=ok)→ 异步 `cleanupGhostCache`。
- `GetSessionMessages`(`:279`):get-or-create → 取;agent 404 **自动重建空 session** 返回。
- `GetSessionMessagesByID`(`:306`):多会话,**强制 `OwnsSession`**;agent 404 **不自愈**,清理孤儿 DB 行。
- `PaginateSessionMessages`(`:336`):**无归属检查**(留给 prism 在自己业务表里校验);404→空结果优雅降级。
- `OwnsSession`(`:443`):核心 authz 原语,经 `repo.GetByAgentSessionID`,多会话任一匹配行即拥有。
- 多会话 API(claw):`ListSessions`/`CreateNewSession`/`RenameSession`/`DeleteSessionByID`/`ActivateSession`(`:481`–`:612`),其中 `ActivateSession` **故意不 Touch**,看历史不应重排列表。
- 实体级绑定(prism/peerreview 双写):`BindOwnerSession`/`UnbindOwnerSession`(`:133`/`:139`)。

### 2.2 会话映射模型(`repository.go`,详见 §5)

表 `agent_sessions`(`SessionRow`,`repository.go:31-51`)。schema 演进是关键:migration
0070 把 PK 从复合 `(user_id, feature_key)` 改为代理键 `id` 自增(`:32`)—— 这使 claw 能一个
`(user_id, feature_key)` 多行(多会话),但也**移除了单会话 feature 的 DB 唯一约束**,改由应用层
`GetLatestByUserFeature` + get-or-create 维护「只一行」。唯一硬全局唯一性只剩
`uk_agent_session_id`(`:35`)。

### 2.3 WS / streaming(`ws.go`,详见 §6 前端侧)

- 后端→agent dial:专用 `agentDialer`(10s 握手,独立连接池),带 `Authorization: Bearer`(`ws.go:120`)。
- 前端 upgrade:`frontUpgrader` 的 `CheckOrigin → true`(`ws.go:109`),依赖 nginx 同源。
- `pipe`(`ws.go:210`):两个 goroutine 桥接 front↔agent + 一个 ping goroutine。**无应用层队列**,逐帧同步转发,背压靠 deadline 不靠缓冲。
- 应用层 ping `{"type":"ping"}` 每 25s(`PingInterval`,`spec.go:144`),因为 agent 的 Bun.serve `idleTimeout=60s` 只数应用数据、不认控制帧(`ws.go:57-64`)。
- read deadline:agent 腿 60s、front 腿 10min;front write deadline 30s(背压修复,`ws.go:70-74`)。
- 廉价分帧 `frameType`(`ws.go:420`):只有 `permission_request`/`message_complete` 全量重解析,海量 `content_delta` 只付一次极小 unmarshal。

### 2.4 鉴权:ws-ticket(`wstoken.go`)

前端先 POST `/<feature>/session/ws-ticket` → `IssueWSTicket`(`:51`,经 `OwnsSession`)→
`mintWSTicket`(`:81`):`crypto/rand` 32 字节 hex(64 字符),payload =
`<feature_key>:<user_id>:<session_id>`,存 **Redis persist pool**(`noeviction`,TTL 30s,
key `agent:ws_ticket:<token>`)。升级时 `ConsumeWSTicket` 做 **GETDEL** 原子一次性消费
(`:104,112`);跨 feature 守卫 `parts[0] != f.spec.Key` → invalid(`:120`);消费后再校验
`sid == pathSessionID`(`ws.go:668-674`)纵深防御。

**裸 JWT 回落已被移除**(`ws.go:83-86`):旧 `?token=<jwt>` 把长 TTL JWT 放进 URL,(a) nginx
access log 长期暴露可重放整场会话;(b) 已吊销 JWT 仍能从 URL 升级 WS、绕过 HTTP 中间件
(吊销在那执行)。现缺/错 `ws_token` 一律 401。浏览器无法给 WS 设 `Authorization` 头,故采用
ticket-in-query。ws-ticket 路径 **fail-closed**(Redis 挂 → 拒,因为这是 authn,`:83-85`)。

### 2.5 配额(`spec.PreUserMessage` + `OnMessageComplete`)

> **⚠️ CLAUDE.md drift:** 文档里的 `agentbridge.NewRedisDailyCap`/`RedisDailyCap`
> **在代码中不存在**(`grep` 无果)。真实配额走 `internal/vip`,见 §5。

- `PreUserMessageFn(ctx, userID, content) error`(`spec.go:50-55`),每 feature 接 `preUserMessageChain`(vip 每日限额 + usagestat「question」事件)。只在 `user_message` 帧触发(ping/permission_response/stop 不消费,`ws.go:328-344`)。
- 拒绝 → 发 `{type:error, code, message, retryable}`,`code` 由 `classifyPreUserMessageError`(`ws.go:749-756`):`ErrQuotaExceeded`→`"quota_exceeded"`(不可重试),否则 `"hook_error"`。**不关 WS**,下一轮可重试。
- 配额钩子 **fail-open**(与 ws-ticket 的 fail-closed 形成有意分裂,`wstoken.go:50` 注释)。
- `OnMessageCompleteFn`(`spec.go:57-59`):仅在带非空 usage 的 `message_complete` 上、**经 `safego.Go` 异步**触发(不阻塞 pipe,`ws.go:439-446`),最终汇入 `recordAgentTokens`(`hooks.go:51-74`,跨 WS/server-side/callback 三路的唯一 token 构造点,被标记为「未来 per-user token 预算的唯一 decrement 点」,**当前只记录不扣减**)。

### 2.6 displacement(多窗口接管)

- `activeWSConns sync.Map`(`bridge.go:47`),**进程内**(`:44-46`)。显式「best-effort,非硬互斥」;跨实例真互斥需 Redis 锁(Plan B,**未实现**)。**整个 displacement 正确性假设单实例部署。**
- 键 `displacementKey = featureKey + ":" + sessionID`(`bridge.go:74-76`)—— **按 session 不按 user**(有意修复):危害是一个 *agent session* 被两 WS 同时驱动 → jsonl 双写损坏;按 user 键会误踢同用户的另一个 claw 会话/prism 项目 tab(曾报「并发误弹 displaced」)。
- `registerAndDisplaceOldWS`(`bridge.go:83`):`Swap` 进新 conn,旧的 `safego.Go(old.displace)` 异步踢;`displace()`(`displacement.go:81`)`closeOnce` 幂等,写业务帧 `{"type":"displaced","reason":"session_taken_over"}` 后发 `CloseMessage(1000)`(前端不自动重连),3s 超时兜底。`DisplacedReason` 预留 `token_revoked`/`quota_exhausted`/`server_shutdown` 但只发 `session_taken_over`。

### 2.7 Picker(prompt 选择)+ 首条消息前缀注入

- Picker(`picker.go`)实现 `Pick(ctx, PickInput)`,**必须报错不静默返空**(`:36-38`):`BySlugPicker`(固定 slug)、`StaticPicker`(Go const,smart_search/claw/prism 实际用的)、`PersonaRandomPicker`(peerreview alpha/beta/gamma/chief,`crypto/rand` 加权随机)。`WeightedRandomPicker` 头部声明但**未实现**(`picker.go:7`)。
- 首条注入(`spec.InjectPromptOnFirstMsg`):已注入快路读 `prompt_injected` 标志(`ws.go:133-164`);首条 `user_message` 时 `Picker.Pick` 失败 → `{code:"prompt_unavailable",retryable:true}` 并丢帧(`ws.go:351-362`,**fail-closed**,防 agent 不受约束乱跑);`atomic.Bool` CAS 保证每连接恰好改写一次,前缀用 `buildInjectionPrefix` 标记 `[AGENT BRIDGE — STRICT RULES…]`(`ws.go:504-510`)。`prompt_injected` 只在首个 `message_complete`(agent 已持久化首轮)才落库,避免崩在 flush 前 stale-true。

### 2.8 server-side streaming 变体(peerreview)

`ServerSideChatStreaming`(`ws_serverside.go:62`):后端做 WS *客户端*,无真实用户 WS;由后台
goroutine 驱动(审稿、元数据抽取)。`onDelta` 把 delta 喂进 peerreview 自己的
`StreamBroker → SSE → 前端`。token **故意不在此记账**(`ws_serverside.go:224-228`,agent 侧 per-call
已覆盖,避免双计)。

---

## 3. agent 容器(cc-haha 守护进程)

**「桌面工具改 web」在此字面成立**:`src/` 下几乎所有文件(QueryEngine、query、Task、tools、
commands、skills、context、history、main.tsx、replLauncher)是桌面 CLI 原样,只有 `src/server/` 是
Web 加层。server 不重写 agent —— 它**每会话 spawn 一个未修改的 CLI 子进程**再桥接。

### 3.1 守护进程如何服务会话

- 入口 `src/server/index.ts:69` `Bun.serve()`(注意 `src/server/server.ts` 是生成的 no-op stub)。路由:`/ws/<sessionId>`(Scholay backend 连这里,auth-gated)、`/sdk/<sessionId>`(spawn 出来的 CLI 子进程回连)、`/api/*`(router.ts)、`/health`、`/callback`。
- 子进程模型(`conversationService.ts`):每 session 一个 CLI 子进程,`Bun.spawn`(`:321`)无头流式:`--print --verbose --sdk-url ws://.../sdk/<id> --input-format stream-json --output-format stream-json --include-partial-messages (--session-id|--resume) --permission-mode --disallowed-tools [--add-dir]`(`:185-215`)。`bin/claude-haha` → `exec bun ./src/entrypoints/cli.tsx` 与桌面用户跑的同一二进制。
- 断连不立即杀 CLI:10min grace(`handler.ts:140`)让生成跑完,在飞输出缓冲在 `liveTurnBuffers`,重连 `resyncSessionOutput` 回放。预热、运行时切模型/provider(重启子进程)、停止生成(interrupt + 3s 强杀,含跨轮 timer 泄漏修复 `handler.ts:57-66`)都在此。

### 3.2 query loop(`query.ts`,CLI 子进程内,Web 层不碰)

`query()`(`:219`)→ `queryLoop()`(`:241`):`async function*` 的 `while(true)`。每轮:
applyToolResultBudget(`:379`)→ snip(`:401`)→ microcompact(`:414`)→ context-collapse(`:440`)→
**autocompact**(`:454`)→ model 调用(`deps.callModel`,`:659` 流式)→ 工具执行
(`streamingToolExecutor` / `runTools`,每个过 `canUseTool` 权限钩子,`:1380`)→ 构造 `next` State 递归
(`:1715`),`maxTurns` 在 `:1508`/`:1705` 检查。CLI 的 stream-json 输出在
`ws/handler.ts:translateCliMessage`(`:1070`)译成 Web `ServerMessage`:`stream_event`→content_*,
`control_request(can_use_tool)`→`permission_request`,`result`→`message_complete`(带 token usage,
`computeTurnUsage` `:1026` 从累计 `session_total_usage` 推算,**含子 agent/压缩/advisor**)。

### 3.3 子 agent / Task

- `src/Task.ts` 只是**后台任务/teammate 的状态类型**(`TaskType=local_bash|local_agent|...|dream`),不是子 agent loop。
- **子 agent** 是 `Agent`/`Task` 工具:`tools/AgentTool/runAgent.ts:15` 导入 `query` 并**递归跑同一 query loop**(fork context、独立工具子集、独立 sidechain transcript)。子 agent 定义从 `.claude/agents` 加载,内置在 `tools/AgentTool/built-in/`。
- **Scholay 关键决定**(`conversationService.ts:62-68`):容器**重新开放** Task/Agent,因为无头 `--print` 模式下子 agent **同步**跑,其工具调用**会回到 backend 权限裁决**(非旁路)。

### 3.4 skills / slash commands / custom agents

- slash commands(`commands.ts`,~80 个)大多 `feature()`-gated;server 从 system-init 捕获 CLI 广告的 `slash_commands` 转发前端,但只 `/clear` 被服务端拦截(`handler.ts:347`)。
- skills(`src/skills/`):bundled + `loadSkillsDir`(载 `<dir>/.claude/skills`)。**Web 适配**:per-feature skill 作用域靠 `--add-dir`(`conversationService.ts:209-214`),如 peerreview methodology session 载审稿 skill 而 claw 不载;持久化进 `session-meta.addDirs` 跨 resume 携带。
- custom agents:`.claude/agents` 加载,经 `src/server/api/agents.ts` CRUD。

### 3.5 jsonl 会话 + 桌面遗留物

- 会话 state 在 `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`,**CLI 自管,server 只读/写这些 jsonl 文件**(`sessionService.ts`),只持有易失内存 map(活跃 socket、stream state)。注释明确「确保 Desktop App 与 CLI 数据完全互通」(`:3-6`)—— Web server 读的正是桌面 CLI 产的文件。子 agent transcript 在 `<sessionId>/subagents/<agent-id>.jsonl`。
- **桌面遗留物**(Web 不用、因是完整 CLI 而存在):`main.tsx`(Ink TUI 入口)、`replLauncher.tsx`、`dialogLaunchers.tsx`、`ink.ts`、`history.ts`(REPL 上箭头历史)、`localRecoveryCli.ts`,以及大量 `feature()`-gated 的 `bridge/buddy/coordinator/proactive/remote/ssh/voice/vim/daemon` 等模块 —— Web 流均不可达。
- **Web 加层**:全 `src/server/`、`agentBridgePreamble.ts`(剥离 backend 前缀生成标题)、per-session cwd 隔离、全局工具加固、输出脱敏(`redactProcessOutput`)、resync/grace/prewarm/runtime-switch。

### 3.6 context 压缩 + memory/CLAUDE.md(全在 CLI 侧)

- 压缩全在 query loop(各 `feature()`-gated):tool-result budget、snip、microcompact、context-collapse、autocompact(阈值全量摘要,发 `compact_boundary`)。**守护进程从不压缩**,只读 jsonl(带 tail-read 上限防 OOM)并算 display-only context 估算。`--resume` 的实际 context 由 CLI 自己读。
- **memory/CLAUDE.md**:`context.ts:getUserContext`(`:155`)调 `getMemoryFiles()`/`getClaudeMds()` 注入 `claudeMd`;`src/memdir/` 提供 auto-memory 目录(`loadMemoryPrompt`)。git status 注入 `getSystemContext`。settings 分层(policy/user/project/plugin/managed)。**这些都是 CLI 桌面能力,Scholay Web 层未对接 per-user 的长期记忆**(见 §8)。

---

## 4. 四个 feature 的编排模式对比

四者都基于 `agentbridge.FeatureSpec`,但**只有前三者用 bridge 的 WS pipe**;peerreview 故意绕开、
服务端驱动。

| 维度 | smart_search | claw | prism | peerreview |
|---|---|---|---|---|
| FeatureKey | `smart_search` | `claw` | `prism` | `peerreview` |
| Picker | StaticPicker(const) | StaticPicker(const) | StaticPicker(agent-native 协议) | **nil**(业务自管) |
| InjectPromptOnFirstMsg | true | true | true | **false** |
| AutoApprovePermission | true(只读 MCP) | true | true(路径感知) | true |
| SessionOptions.DisallowedTools | 无 | 无 | **Bash,NotebookEdit,Task,Agent** | (per-call) Skill,Agent,Task / methodology 无 |
| AddDirs | 无 | 无 | `/prism-add`(写作 skill) | (per-call) `/peerreview-add` |
| Transport | WS pipe(`HandleWS`) | WS pipe | WS pipe + round 事务 | **ServerSideChatStreaming→SSE broker** |
| Prompt 风格 | 单 persona | 单 persona | agent-native 协议 | **多 persona(4 槽)** |
| 读/写 | 只读 | 读写 | 经 apply-gate 写入 DB | 只读(稿件) |
| Artifact/MinIO 交付 | 无 | **有(harvest+zip)** | 有(编译 PDF,独立) | 无 |
| 多文件 patch | n/a | n/a | **有 + per-hunk overrides** | n/a |
| 多会话 | 单 | **有(sidebar CRUD)** | per-project | per-submission |
| 配额接入 | `PreUserMessage` | `PreUserMessage` | `PreUserMessage` | **手放在 `Submit`** |
| 用量记录 | slog only | slog only | slog only | ServerSideChat 内 per-round |
| 会话归属 | bridge `agent_sessions` | bridge | 双写 + Trusted fallback | 双写(`bindOwnerSession`) |
| Handler 规模 | ~60 行(纯委托) | ~340 + artifact/upload | service-heavy | 2093 行 service |

关键差异说明:
- **smart_search** 是参考实现(~120 行,纯委托 `agentbridge.SessionHandler`)。`SessionOptions=nil`,纯靠 prompt + auto-approve(只 `mcp__minicod__*` 只读)而非工具 denylist。
- **claw** 在 bridge 之上加了多会话 sidebar、上传(plan B,推原始字节不抽文本,SVG 硬拒 XSS)、artifact harvest→MinIO(sha256 去重 + 目录递归 zip,存储禁用时 live 回读只给文本/图片)。
- **prism** 在 WS pipe 上叠 **DB↔cwd round 事务**(truth=DB):`PrepareRound` 物化 DB→cwd,agent 改 cwd 流式出 live diff,**round 结束不自动持久化**,用户 `ApplyRound`(支持 per-hunk `overrides` 子集接受)或 `RejectRound`。每项目独立 agent session,编译走独立 sandbox/MinIO 管线(与 agent 正交)。
- **peerreview** 完全服务端驱动:`StreamBroker` 按 `(submissionID, slot)` 分流(meta/letter/methodology/reviewer:alpha/beta/gamma/chief),4 轮串行,审稿人选择移进 agent(emit JSON,backend 解析 + 从磁盘 `SKILL.md` 读 persona 不信 agent 回显),JSON-with-retry,**配额手放在 `Submit`**(在合法性守卫之后,免非法提交烧配额)。

---

## 5. 多用户数据模型

### 5.1 `agent_sessions`(用户↔agent session 绑定)

合并 schema 在 `docker/mysql/migrations/0001_baseline.sql:64-76`;演进史在 archive:

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | bigint unsigned AUTO_INCREMENT | **PK**(代理键,archive/0070,原为复合 PK) |
| `user_id` | bigint unsigned NOT NULL | `users.id`,**无 FK**(服务层完整性) |
| `feature_key` | varchar(64) | 无 enum |
| `agent_session_id` | varchar(64) | agent session UUID |
| `reset_count` | int unsigned | 累计重置(实体 session 因 GORM 字母序坑永不自增) |
| `last_accessed_at` | datetime | 近活排序键 |
| `owner_kind` / `owner_id` | varchar(32)/bigint NULL | `project`/`submission`;用户级 session 留 NULL(0014) |
| `prompt_injected` | tinyint(1) | 优化标志(0024) |

键:`uk_agent_session_id`(唯一)、`idx_user_feature_accessed`、`uk_owner(owner_kind, owner_id)`。
**归属机制**:用户级 session 把 owner 两列留 NULL,MySQL 下 `(NULL,NULL)` 互不相等 → 一用户可 N 个
claw session;实体级 session 填 owner → `uk_owner` 保证一实体一行。归属检查经 `OwnsSession` →
`GetByAgentSessionID(userID, featureKey, agentSessionID)`(三列过滤),阻止用户 A 抓用户 B 的 sid。

### 5.2 `agent_config`(单行 provider/model + 异步推送)

`0001_baseline.sql:45-60`,Go 模型 `agentconfig/model.go:25-39`,**永远只 id=1**。列:`base_url`/
`api_key`/`main_model`/`haiku_model`/`sonnet_model`/`opus_model`/`enabled` + push-status 三件套
(`push_status`/`last_pushed_at` 只记成功/`push_error`)。异步推送:`UpdateConfig` 置
`push_status='pending'` 后 `safego.Go` 推 `PushConfig`→agent `/api/providers`(**HTTP 响应不等推送**),
成败更新 status。**Minicod MCP key 不在此表**,容器 boot 时从 `${MINICOD_API_KEY}` env 烤入,非热更。

### 5.3 配额(Redis + vip)

> 真实配额是 `internal/vip`,不是 CLAUDE.md 写的 `NewRedisDailyCap`(不存在)。

- Redis key `quota:tokens:<uid>:<YYYYMMDD>`(`vip/quota.go:37`),用 persist pool,TTL 25h,**fail-open**(Redis 挂→0 已用→放行)。
- 门 `CheckDailyQuota`(`:60`)只读比较;真实扣减 post-hoc 经 `AddUsage`(`:83`,唯一增点,由 `llmusage.Record` 喂)。
- **reset lock key `quota:reset:<uid>:<day>` 计划用但当前是进程内 256-shard mutex**(`:24-34`),注释说多副本需 Redis SETNX —— **未实现**(多租户缺口)。
- 接入:`PreUserMessage` 调 `vipChecker.CheckDailyQuota`,`vip.ErrQuotaExceeded`→`agentbridge.NewQuotaError`。`bootstrap.go:237-239` **vipService 为 nil 则 panic**(拒绝无计费启动)。

### 5.4 多用户如何映射到一个共享 agent 容器的 `~/.claude`

**一个共享 `scholar_agent` 容器,N 用户,M 会话**,多路复用全在 `agent_sessions`(DB 映射)+
per-session cwd 隔离:
- backend 从不跑 agent 代码,纯 HTTP 客户端;每会话 `client.CreateSession` 拿 UUID 落
`(user_id, feature_key, agent_session_id)` 行。
- agent 侧每会话 `crypto.randomUUID()` + 隔离 cwd `~/sessions/<id>`
(`SCHOLAY_ISOLATE_SESSIONS`,默认开),Read/Glob/Grep 限于该子树。
- 但所有用户 transcript 都写在**单一共享** `~/.claude/projects/.../<sid>.jsonl` 树下,隔离靠
随机 sid + cwd 限制,**不是 OS user 或容器隔离**。

---

## 6. 前端 agent 层

### 6.1 WS hook 生命周期(`useAgentSocket.ts`)

三个 feature(smart-search/claw/prism)共用的连接状态机。状态:`idle|connecting|open|reconnecting
|closed|error|displaced`。
- **ws-ticket 连接**(`:184-228`):`connect()` 先 await `fetchTicket()`(每次连/重连一发新 30s 一次性票),再 `new WebSocket(…?ws_token=)`。`isCurrent()` 守卫(`:208`)让陈旧 WS 的异步帧(如切会话后才到的 displaced)不污染新 socket —— 「幽灵 displaced 横幅」的修复。
- **心跳 25s**(`:218-220`),与后端对齐、低于 agent 60s idle。
- **停滞看门狗 45s/10s**(`:78-85`):任何帧(含 pong)更新 `lastFrameAtRef`,每 10s 查,>45s 无帧则强 `ws.close()` 触发重连+resync,救「半死连接」(TCP 活但投递死)。
- **重连退避**:`1,2,4,8,16,32,60,60s`,**8 次**(≈3-4min)后 `error`;displaced 不重连。
- **resync**:控制帧(displaced/resync_start/resync_user/resync_end)绕过 rAF 批、先 `flushNow()`;`resync_start`→`truncateToLastComplete` 砍掉在飞半轮让 agent 重放不重复。
- **streaming 批处理**:content 帧入 `pendingEvents` 每动画帧 flush(避免 per-token 全量 re-fold),相邻 text delta 合并。

### 6.2 streaming fold(实时,`features/claw/components/chat/fold.ts`)

`foldMessagesIntoTurns` 线性回放 WS 帧进 `Turn[]`:`content_start`(开 text 块或 push ToolBlock,
Map 索引 O(1))、`content_delta`(追加)、`tool_use_complete`、`tool_result`、`status`、`thinking`、
`message_complete`/`error`(`markPendingToolsAborted` 把永不返回的在飞工具标 aborted,turnIdx++)。
`permission_request` 在用户 feature **不 fold**(后端 auto-approve)。

### 6.3 history replay 同构契约(`agent-history.ts`)

`replayHistoryAsTurns` 把 jsonl 折成**同一** `Turn[]` 形状,跳 system + isSidechain,`stripAgentBridgePrefix`
剥后端注入前缀。**同构契约是 load-bearing**(`:1-21`):相邻 assistant 文本合并、但被工具块分隔的文本须
保持独立块 —— 否则重入分叉。**实时 fold 改分块逻辑时,history fold 必须同步改。**(曾经 prism「截肢式」
回放 join 全文本致重入看起来不同,已统一到此函数。)

### 6.4 多 tab + displaced 横幅

- `BroadcastChannel('scholay:<feature>')`:reset/lazy-create 后 `notifySessionChanged()`,其他 tab invalidate `[feature]` query 前缀刷新。**故意不跨 tab 同步 WS turns、不替代后端 displacement**(两独立机制)。
- `AgentDisplacedBanner.tsx`:琥珀顶栏 + 「切回这里」→ `takeOver()`(smart-search/claw 共用;prism 用自己的紧凑 pill)。
- **displaced 自动恢复**(`:340-401`):只 `visible` tab 重试、4s + 抖动、`AUTO_RECOVER_MAX_ATTEMPTS=4` 后转手动横幅、稳定 15s 重置计数。

### 6.5 chat 渲染组件(`shared/components/chat/`)

纯渲染原子(feature-agnostic):`Bubbles`(memo)、`MarkdownRenderer`(react-markdown + gfm/math/
highlight/katex,design-token 覆盖)、`ToolCallBlock`(4 态 + aborted)、`ThinkingFold`/`ProcessFold`、
`StreamingIndicator`、`ContextMeter`(conic 水位环)等。渲染窗口化在 feature 侧:只渲染末
`RENDER_WINDOW=60` 轮,两段「加载更早」(内存窗 → 后端页 `HISTORY_WINDOW=100`)。

---

## 7. 安全与沙箱

三容器协作:`scholar_agent`(LLM 运行时)+ `scholar_egress_proxy`(唯一公网出口)+
`scholar_prism_tex`(LaTeX 编译沙箱)。分层防御:网络拓扑 + egress 代理 + 能力剥离 + 工具 denylist +
per-session cwd 隔离。

### 7.1 工具加固(三层 union)

- **Layer A — agent 全局 denylist**(`conversationService.ts:77-97`):`DEFAULT_DISALLOWED_TOOLS` 作 `--disallowed-tools` 注入**每个** CLI 子进程,**硬移除**非提示。禁:`PowerShell/Cron*/Task{Create..}(任务管理)/Team*/Send*/RemoteTrigger/Monitor/PushNotification/AskUserQuestion` 等。**有意重开**:全 `mcp__*`、文件工具(plan B)、**Bash/BashOutput/KillShell**(2026-05 为 office 转换重开)、**WebFetch/WebSearch/Skill/Task/Agent**(2026-06 egress proxy 落地后重开)。
- **Layer B — per-feature denylist**(union 进 Layer A):prism `["Bash","NotebookEdit","Task","Agent"]`、peerreview scoring `["Skill","Agent","Task"]`。
- **Layer C — 后端权限门**(`agentbridge/ws.go:575-604`):每个 tool_use 裁决。`mcp__*` 恒 allow;`Bash*` allow 但**无法路径限制**;`WebFetch/WebSearch/Skill` allow(SSRF 委托 egress);文件工具 `pathWithin(p, sessionWorkDir)` 路径检查;其余默认拒。

> **⚠️ 地图冲突(需运行时确认):** `ws.go:590-591` 注释仍称「Task/Agent 仍全禁……旁路本裁决」,
> 但 `conversationService.ts:65-68` 称 Task/Agent **已重开**,因无头 `--print` 下子 agent 同步跑、
> 工具调用**会回到** `decidePermission`。agent 侧全局 denylist 也已不含 Task/Agent。**ws.go 注释相对
> conversationService 决定已陈旧,实际 Task/Agent 事实上 allow。**

### 7.2 网络隔离 / egress / SSRF

- `scholar-agent-net` 是 `internal: true`(无 NAT、无公网路由),agent 只在此网,**够不到 mysql/redis/minio**;backend 横跨两网单向可达 agent(「即便 agent 被攻陷也够不到数据面」)。
- **唯一出网**:`scholar_egress_proxy`(tinyproxy),agent 强制 `HTTPS_PROXY=http://scholar_egress_proxy:3128`。`ConnectPort 443` only 挡端口探测;两模式 `open`(deny-list,默认)/`allowlist`(`FilterDefaultDeny Yes`,prod 推荐,当前只 `deepseek.com`/`minicod.com`)。SSRF deny 基线含云元数据(169.254.169.254、100.100.100.200)、RFC1918、loopback、compose 服务名 —— 文件自警**仅字符串匹配,DNS rebinding 可绕**,prod 应用 allowlist。
- 容器加固:agent/egress/prism_tex 全 `cap_drop: ALL` + `no-new-privileges`;agent 资源限 `1.5G/2 cpu/512 pids`(fork-bomb 防护)。

### 7.3 MCP

唯一 MCP server **minicod**(学术检索),build 时烤进 `~/.claude.json`,命令 `bun /app/node_modules/
@minicod/mcp-server/...`(vendored 进 node_modules,故 `minicod.com` 是唯一非 LLM allowlist 项)。
暴露 `mcp__minicod__*`,是唯一在全局 denylist 中幸存的工具(设计意图:「无论用户怎么诱导,模型手里
只有学术检索工具」+ 后续重开的 builtin)。

### 7.4 secret 注入与暴露

- 上游 LLM creds:`.env` 仅冷启 bootstrap,**真值在 DB `agent_config`**,backend 推到 `~/.claude/cc-haha/providers.json`。
- 内部互信:`ANTHROPIC_API_KEY` 在 compose 被强覆盖为 `${AGENT_INTERNAL_TOKEN}` 须等于 backend `AGENT_AUTH_TOKEN`,双向 Bearer 校验。
- **暴露 caveat(团队已记录)**:因 Bash 开放,被 prompt-injected 的模型可 `cat ~/.claude/cc-haha/providers.json`(真 LLM key)、`printenv` MINICOD_API_KEY、读其他 session 的 jsonl —— 路径感知 approve 守 Read/Glob/Grep 但**不守 Bash**。接受的缓解是未来 bubblewrap 沙箱,不是权限门。

### 7.5 prism_tex(per-feature 硬沙箱,`network_mode: none`)

最锁死容器:`network_mode: none`(air-gapped,只经共享卷 `/work` 与 backend 通信)+ `read_only: true`
rootfs + 仅 `/tmp` tmpfs + `user: 1001:1001` + `cap_drop: ALL` + 资源限 + `COMPILE_TIMEOUT`。
**这是 agent 容器注释说 Bash *应该*最终被包进去(bubblewrap + no-net)的模型**,但当前本地 Docker
Desktop 的 LinuxKit kernel 跑不了 unprivileged userns,故暂不能。

---

## 8. 妥协清单 (THE KEY SECTION)

> 逐条列出「**因为是桌面工具改 web/多用户**」而做的妥协。等级:高/中/低;维度:编排/记忆/多用户/调度/前端/安全。
> 排序大致按风险。

### 8.1 妥协总表

| # | 妥协 | 现状 | 为何是妥协 | 风险 | 维度 |
|---|---|---|---|---|---|
| C1 | **Bash 无条件 auto-approve** | `ws.go:579-585` allow Bash/BashOutput/KillShell,显式注「无法路径限制」 | 桌面 CLI 假设用户=机主信任 shell;Web 多租户下 Bash 旁路全部路径检查 → 可 `cat providers.json`(真 LLM key)/`printenv`/读他人 jsonl。真隔离须 bubblewrap+断网,本地 Docker Desktop LinuxKit 跑不了 unprivileged userns,故未启用 | **高** | 安全/多用户 |
| C2 | **displacement 进程内、单实例假设** | `activeWSConns sync.Map` 进程内(`bridge.go:44-46`),Redis 锁未实现 | 桌面无并发驱动概念;Web 单 agent session 须防双 WS 双写 jsonl。多实例后端下两实例可同时驱动同一 session → jsonl 双写损坏。**整个 displacement 正确性押在单实例部署** | **高** | 多用户/编排 |
| C3 | **单实例横向扩展全面失效** | displacement(C2)+ 配额 reset lock 进程内 256-shard mutex(`vip/quota.go:24-34`,Redis SETNX 未实现) | 多个押单实例的不变量叠加,平台无法水平扩展;扩了就 jsonl 损坏 + 配额双扣 | **高** | 多用户/调度 |
| C4 | **无 per-user 长期记忆** | CLI 有 CLAUDE.md/memdir/getUserContext(`context.ts:155`)但 Web 层未对接;`~/.claude` 是单一共享树(单行 agent_config + 全局 skills/OAuth) | 桌面记忆是「机主一个人的」;Web 多租户需 per-user 记忆隔离与持久。当前所有用户共享一份配置/记忆面,无 per-user 模型选择、无 per-user 花费隔离,token 归属靠事后 `FindByAgentSessionID` 反查 | **高** | 记忆/多用户 |
| C5 | **会话 state = 共享文件系统 jsonl** | 全用户 transcript 在单容器单 `~/.claude/projects/.../<sid>.jsonl`,隔离靠随机 sid + cwd 限制(`SCHOLAY_ISOLATE_SESSIONS`),非 OS user/容器隔离 | 桌面单盘单用户天然合理;Web 把它当多租户存储,隔离=「Claude Code 尊重 cwd 边界 + 后端路径感知 approve」的软约定,非硬边界。`SCHOLAY_ISOLATE_SESSIONS=0` 直接塌成共享 cwd | **高** | 多用户/安全 |
| C6 | **首次 get-or-create 可双行** | 代理键 schema(0070)后 `(user_id,feature_key)` 无 DB 唯一约束;`createAndPersist` 的 race 恢复只在 insert *出错* 时触发(`bridge.go:634`),而重复 (user,feature) 不再碰撞 | 为支持 claw 多会话去掉了单会话的 DB 硬约束;并发首次创建可建两行,`GetLatestByUserFeature` 静默取新者,旧者成良性孤儿。无硬守卫 | 中 | 多用户/编排 |
| C7 | **配额前置检查与扣减解耦** | `PreUserMessage` 前置只读检查;实际 token post-hoc 经 `OnMessageComplete`/`AddUsage` 记;WS usage 行 `request_id` 为空(`hooks.go:78,84`) | 桌面无计费;Web 计费需精确归属。一轮长生成可在下次 PreUserMessage 看到前超额;WS turn 无法关联到具体 turn/session,审计/per-session 计费困难 | 中 | 多用户/编排 |
| C8 | **配额 fail-open** | Redis 挂 → 0 已用 → 全员无限免费(`vip/quota.go:59,73`) | 可用性取舍合理,但事故期成本敞口;桌面无此概念 | 中 | 多用户/安全 |
| C9 | **prompt 注入前缀 in-band** | 系统规则以文本标记 `[AGENT BRIDGE — STRICT RULES…]` prepend 进用户 `content`(`ws.go:504-510`),非独立 system role | 桌面用真 system prompt;Web 桥接只能改用户消息内容。精心构造的用户消息可含同一结束标记伪造规则边界、解除约束 —— 标准 in-band prompt-injection 敞口 | 中 | 安全/编排 |
| C10 | **bridge 抽象漏:SessionOptions 不覆盖 server-side** | `spec.SessionOptions` 只对 WS 路径生效(`bridge.go:234,539,624`);peerreview 绕开 bridge,须 per-`CreateSession` 重传 DisallowedTools/AddDirs(`service.go:311,354,554`) | bridge 为 WS pipe 设计,server-driven feature 重新实现 session 创建。任何未来 server-driven feature 继承此重复 | 中 | 编排 |
| C11 | **bridge 抽象漏:配额钩子无 server-side 等价** | `PreUserMessage` 只在 WS pipe 触发(`ws.go:329`);peerreview 须手放配额在 `Submit`(`service.go:1456`) | 同 C10;每个 server-driven feature 自行手放配额,易漏(spec 注释自认 `spec.go:44`) | 中 | 编排/多用户 |
| C12 | **prism 与 bridge 的 user↔session 假设冲突** | bridge 假设 session=(user_id,feature_key);prism 需 per-project,自管 `prism_projects.agent_session_id` + 双写 + **Trusted ws-ticket 后门**(`ws_round.go:47-56`,`IssueWSTicketTrusted` 跳 OwnsSession) | 桌面无「实体级会话」;Web 多实体下 bridge 模型不够用。Trusted 后门是显式技术债(「降级是 warning」),任何忘记自校验归属的未来调用方 = 跨用户会话劫持 | 中 | 多用户/安全/编排 |
| C13 | **artifact 交付是 claw 私有** | harvest→MinIO→dedup→reconcile + live-fallback + dir-zip 只在 claw(`artifact_harvest.go`);`agentbridge` 不知 artifact | 「agent 写 `./out/`,交付给 web 用户」是通用 agent-native 模式(prism 编译产物、未来 feature 都想要),桌面无此需求故 bridge 未抽象 | 中 | 编排/前端 |
| C14 | **AutoApprovePermission 单 bool 语义分裂** | 同一 `true` 对 smart_search=「approve 一切(只读 MCP)」,对 prism/claw/server-side=「路径感知 `decidePermission`」(`ws.go` / `ws_serverside.go:209`) | 单 bool 掩盖真实 gating 是 cwd-fence + denylist 而非该 flag;桌面无多策略需求 | 低 | 编排/安全 |
| C15 | **无后台/异步任务面 + 无完成通知** | 前端 `busy` 纯靠前台 WS(`lastTurn && !complete`);导航离开则 WS 关、`pendingTurns` 丢,只能回到该 session 经 resync 恢复;无 PushNotification/标题闪/声音/toast on `message_complete`(且 `PushNotification` 在全局 denylist) | 桌面前台 TUI 全程在线;Web 用户多任务/切路由时长任务可被「孤儿化」(backgrounded tab 的 displaced 不自动恢复 `:383`),长跑完成无任何提醒 | 中 | 调度/前端 |
| C16 | **CheckOrigin 恒 true** | `ws.go:43-47` 无 WS origin 白名单,CSWSH 防护全委托 nginx 同源 + ws-ticket | 桌面 WS 无跨站概念;Web 缺该层纵深防御(影响被有效 ticket 约束,但层内无防护) | 低 | 安全 |
| C17 | **逐帧同步转发无缓冲** | 两腿纯同步逐帧转发,无应用层队列;30s `frontWriteDeadline` 兜底(`ws.go:74`) | 桌面无背压问题;Web 下仅慢(非停滞)客户端会给 agent 腿读加最多 30s/帧延迟、间接节流 agent | 低 | 前端/编排 |
| C18 | **大量桌面遗留物随容器装运** | `main.tsx`/Ink TUI/replLauncher/history/localRecoveryCli + bridge/buddy/voice/vim/ssh/daemon 等 `feature()`-gated 模块,Web 流均不可达 | 因 spawn 的是完整桌面 CLI 二进制,镜像体积/攻击面携带大量死代码(虽 feature-gated 可 DCE,但运行时仍是同一进程) | 低 | 安全/编排 |
| C19 | **死代码:llmUsageRecorder 注入但不用** | 三 WS feature 仍 `SetLLMUsageRecorder` 但 `onMessageComplete` 不再用(per-call 记账移到 agent,`smartsearch/spec.go:66-68`);三处 `preUserMessageChain`/`onMessageComplete` 近乎逐字重复 | 被抛弃的「ledger-from-bridge」设计残留;呼唤 `agentbridge.StandardHooks(feature, action, vip)` 共享 helper | 低 | 编排 |
| C20 | **文档 drift:`RedisDailyCap` 不存在** | CLAUDE.md 写的配额机制 `NewRedisDailyCap`/`RedisDailyCap` 代码中无;真实是 per-feature `preUserMessageChain`(vip-tier) | 照 CLAUDE.md 接新 feature 会引用缺失 helper | 低 | 编排/记忆 |
| C21 | **无 user_id/owner_id 外键** | `agent_sessions` 引用完整性仅服务层;删用户/项目可留孤儿行(靠自愈重建 + 0014 清理缓解,非强制) | 桌面无关系完整性需求 | 低 | 多用户 |
| C22 | **api_key 掩码基于内容** | `agentconfig/handler.go:54` 判 `contains "****"`;真 key 若含 `****` 会被静默丢弃 | 正确性边缘 case | 低 | 安全 |

### 8.2 重点妥协说明

**最大的一条是 C1(Bash auto-approve)+ C5(共享 jsonl)+ C4(无 per-user 隔离)构成的「软隔离三角」。**
桌面 CLI 的根本假设是「机器=机主一个人的,shell 和文件系统可信」。Scholay 把它原样搬上多租户 Web,
隔离全部退化为**软约定**:随机 sessionId + cwd 路径检查 + 后端权限门 —— 而 Bash 直接绕开路径门
(`conversationService.ts:53-55`)。团队**自己已记录**真正的硬隔离应是 prism_tex 那样的
`bubblewrap + network_mode:none`,但本地 Docker Desktop 的 LinuxKit kernel 跑不了 unprivileged
userns,故暂以「egress proxy 断内网 + cap_drop + 接受风险」兜底。这意味着:**当前安全姿态对
prompt-injection 是「检测+网络层缓解」,而非「代码层硬隔离」**。

**第二组是 C2/C3(单实例押注)。** displacement(防同一 agent session 双写 jsonl)和配额 reset lock
都是进程内状态,Redis 跨实例锁均「计划但未实现」。**这把平台钉死在单实例后端**:一旦水平扩展,
立即出现 jsonl 双写损坏 + 配额双扣。这是桌面工具(本就单进程)与 Web(需水平扩展)最根本的张力。

**第三组是 bridge 抽象的几处漏洞(C10/C11/C12/C13)。** bridge 为「WS pipe + user↔session」的 happy path
设计得很干净(smart_search ~120 行即接上),但一旦 feature 偏离这条路 —— peerreview 服务端驱动、
prism per-project 实体会话、claw artifact 交付 —— 都得绕开或私有实现,SessionOptions/配额钩子/会话归属
三处契约都漏。这是「为单一桌面交互模式设计的桥」适配多样 Web 编排需求时的必然摩擦。

---

## 附:关键文件索引(绝对路径)

后端 bridge:
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/{bridge,ws,ws_serverside,wstoken,displacement,hooks,picker,repository,spec,skill,http_handler,internal_handler,admin_monitor}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agent/{client,config,httpclient,skill}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentconfig/{model,repository,service,handler}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/vip/quota.go`

四 feature:
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/smartsearch/{spec,handler}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/claw/{spec,handler,upload,artifact,artifact_harvest}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/prism/{spec,ws_round,edit,service,workspace}.go`
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/peerreview/{spec,stream,service,service_reviewers}.go`

agent 容器:
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/{index.ts,ws/handler.ts,services/conversationService.ts,services/sessionService.ts,services/agentBridgePreamble.ts}`
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/{query.ts,QueryEngine.ts,Task.ts,context.ts,setup.ts}`
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/tools/AgentTool/{AgentTool.tsx,runAgent.ts}`
- `/Users/youngp/mypro/fuck_副本/scholar/agent/{Dockerfile,preinstalled-mcp.json,bin/claude-haha}`

前端:
- `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/shared/hooks/useAgentSocket.ts`
- `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/shared/lib/{agent-stream,agent-history,agent-session-broadcast,agent-prefix}.ts`
- `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/shared/components/{AgentDisplacedBanner.tsx,chat/*}`
- `/Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/claw/components/chat/fold.ts`

部署/安全:
- `/Users/youngp/mypro/fuck_副本/scholar/docker-compose.yml`
- `/Users/youngp/mypro/fuck_副本/scholar/egress/{entrypoint.sh,filter,filter-deny-internal,tinyproxy.base.conf}`
- 迁移:`/Users/youngp/mypro/fuck_副本/scholar/docker/mysql/migrations/{0001_baseline,0014_agent_sessions_owner,0024_agent_sessions_prompt_injected}.sql` + `archive/{0047,0051,0052,0070}*.sql`
