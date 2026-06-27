# Scholar Agent 服务架构分析

> 2026-06-27 · 架构师视角的整体分析。方法:8 个 Explore agent 读代码 + 8 个研究 agent 对标开源 → 综合 → 对抗式批判(拿代码逐条核查)→ 定稿。共 19 agent / ~1.6M tokens。
> 注:这是对**现存 agent 服务**的架构评审,区别于 `docs/research/agent-architecture-2026-06/` 那批(早先的设计调研)。

## 1. 这是什么(架构总览)

Scholar 的 AI agent 服务是一个**把单机版 Claude Code CLI(fork 代号 cc-haha)改造成无头多租户守护进程**的系统,前面套一层 Go 写的通用桥接(agentbridge),用一套 `FeatureSpec` 抽象支撑 4 个产品功能。它不是 SDK 集成,而是**把整个 CLI harness 当黑盒运行,backend 通过 HTTP/WS 与它对话**。

核心不变量(必须先理解,否则后面的风险看不懂):

- **一个 session = agent 容器里一个长期存活的子进程 + 一份 jsonl**。jsonl 必须**单写者**——两条 agent WS 同时驱动同一 session 会双写损坏(`hub.go` 顶部注释明确写了这条)。
- **backend 完全黑盒对待 jsonl**:`agent_sessions` 表只存 `(user_id, feature_key) → agent_session_id` 的映射,transcript 真源在容器里。这是整个架构最关键、也最有争议的一个选择(见 §3、§4)——它派生出后面一整串问题。
- **多端实时同步靠 Hub 扇出**:同一 `(feature, sessionID)` 只保留一条上游 agent WS,backend 把帧扇出给 N 个浏览器订阅者。这是为了在「单写者」约束下还能支持多 tab/多设备同步(取代了旧的 displacement 抢占模型)。**但 Hub 的进行中轮状态(`replayBuf` + `inFlight`)纯在内存,不落任何持久层**——这是后面 §3.3 那个数据丢失 bug 的根。

```
┌────────────────────────────────────────────────────────────────┐
│ 浏览器 (N tabs / N devices, 同一 session)                          │
│   useAgentSocket → WS ?ws_token=<30s 一次性票>                     │
└───────────────┬────────────────────────────────────────────────┘
                │  fan-out (每订阅者独立 out chan 256 + 写超时)
┌───────────────▼────────────────────────────────────────────────┐
│ Go backend — internal/agentbridge/                              │
│  ws.go HandleWS / wstoken.go ws-ticket / hub.go 扇出 Hub         │
│  bridge.go Bridge.For(spec) + tokenWatermarks(sync.Map,内存)     │
│  bridge.client (agent.Client, bootstrap 注入) ← 可插拔 seam      │
│  hooks.go PreUserMessage(配额) / OnMessageComplete(计费)          │
│  http_handler.go 5 个通用端点 + IssueWSTicket                     │
│  ┌──────────┬──────────┬──────────┬─────────────────────────┐   │
│  │smartsearch│  claw   │  prism   │ peerreview              │   │
│  │ (thin 55行)│(上传/引用/│(LaTeX IDE │ (server-side 编排        │   │
│  │           │ artifact)│ DB真源)   │  service.go 2119行)      │   │
│  └──────────┴──────────┴──────────┴─────────────────────────┘   │
│         │ HTTP (internal/agent/client.go ~1020行)                │
│         │ CreateSession/GetMessages/PushConfig                  │
└─────────┼───────────────────────────────────────────────────────┘
          │  唯一上游 WS / session (单写者)
┌─────────▼───────────────────────────────────────────────────────┐
│ scholar_agent 容器 (cc-haha, Bun, :3456)                          │
│  src/server/ (REST + /ws/* 客户端)                                │
│  conversationService.ts: 每 session spawn 一个 CLI 子进程          │
│  jsonl @ ~/.claude/projects/ (共享 fs, 单容器, 单写者)             │
│  --disallowed-tools 硬白名单(create 时定死) + Minicod MCP 预装    │
└──────────────────────────────────────────────────────────────────┘
          │ egress-proxy (tinyproxy, allowlist 可选, 默认 open)
          ▼  DeepSeek(Anthropic 兼容) / Minicod
```

关键文件:`agentbridge/{spec,bridge,hub,ws,wstoken,hooks,http_handler}.go`、`agent/client.go`、`agentconfig/`、各 feature 的 `spec.go`。`agent/src/server/{index.ts, ws/handler.ts, services/conversationService.ts}` 是容器侧的承接层。

---

## 2. 设计亮点(genuinely well-architected)

这套系统**不是草草搭起来的**,有几处明显高于行业平均水平:

**2.1 FeatureSpec 抽象 + bridge/feature 边界(最强资产)**
`spec.go` 把一个功能的「全部差异」收敛成一个声明式 struct(key / agent / picker / PermissionMode / AllowBash / DisallowedTools / 三个 hook),`Bridge.For(spec)` 返回绑定视图。结果是 smartsearch 只有 ~55 行 handler。这正是 LibreChat Agents / Open WebUI Pipes / Coze bot 收敛出的「many apps, one engine」工业标准——而 Scholar 用 Go 静态 struct 实现,**没有 init 顺序坑**(hook 用 closure 懒绑 `vipChecker`/`usageRecorder`,`SetVIPChecker` 可在 `BuildSpec` 之后跑)。**而且这层抽象天然是接口隔离的**:`Bridge` 不透明,它显式暴露 `For/MemoryBlocks/Client/AgentClient`,且底层执行后端 `bridge.client (agent.Client)` 是在 bootstrap 用 `New(client, repo)` 注入的——这意味着换执行后端(现 `agent.Client` → 未来 SDK 或 sandbox-per-session)**只动 `internal/agent` + `internal/agentbridge/{bridge,http_handler}`,4 个 feature 模块零改动**(详见 §6 选项 B)。

**2.2 多端扇出 Hub(行业里几乎没人这么做)**
这是真正的原创点。调研里 Vercel AI SDK / assistant-ui / CopilotKit **都假设一个 stream 一个 viewer**——因为它们把 transcript 写进共享 DB,客户端轮询/refetch 就天然多端同步,不需要 fan-out。Scholar 选了 jsonl 黑盒,**于是被迫**自己造扇出:`hub.go` 的 user_echo 合成、inFlight busy 锁、`coalesceReplay`(相邻 text content_delta 合并,replayBuf 保持 O(blocks) 不是 O(tokens))、每订阅者独立 out 队列 + 写超时(慢客户端单独丢、不拖累广播)、补帧与注册同锁(每帧要么在补帧要么在 live,不重不漏)。这些细节都对、都精巧。**但要清醒:Hub 是 jsonl 黑盒选择的「债务」,不是白赚的能力,而且这层「能力」本身带着一个数据丢失 bug(§3.3)**。

**2.3 ws-ticket 鉴权(标准做法、做到位了)**
`wstoken.go`:30s 一次性 token,`GETDEL` 原子消费,per-feature 校验(smart_search 的票不能升级 claw 的 WS),`IssueWSTicket` 先验 `OwnsSession`。这正是 Ably/托管 realtime 的「short-lived token request」最佳实践,且严格优于被他们删掉的「裸 JWT 落 URL」(会被 nginx access log 长期暴露 + 可重放)。无可改进。

**2.4 单一账本计费 + 配额(水位线自愈)**
`accrueTurnUsage` 用 per-session 水位线 `[input,output,cacheRead,cacheCreation]`,对比 agent 返回的 `session_total` 算 delta,gap 自动补 `(reconciled)` 行。掉帧/重连/CLI 重启都不会重复计或漏计。`PreUserMessage`(只读门)与 `AddUsage`(异步扣)分离,fast-path 干净。`bootstrap.go` 264-287 行还有**启动期 wiring 断言**(漏 `SetVIPChecker` 直接 fail-fast),把「新功能白嫖」从生产事故提前到启动报错。
⚠️ **注意账本水位本身也是 process-local**:`tokenWatermarks`(`bridge.go:70`,`sync.Map`)按 sessionID 存。它能扛单 hub drop(条目活到 `deleteTokenWatermark`,即会话删除/reset 时才清),但**跨 pod 重启整张表丢失**——重启后第一次记账会把 agent 返回的 `session_total` 全量当 delta(因水位归零),除非有 `(reconciled)` 兜底逻辑校正。这是除 hubs map 外的**第二处单实例承重状态**(见 §3.1)。

**2.5 记忆真源在 DB(对的反转)**
`user_memory_blocks`(profile/preferences,char-limited,OnConflict upsert)是真源,agent 只做「建议者」、后端独占写库。这比 Letta 的「agent 自编辑」更安全。调研里 Anthropic 的 multi-tenant 文档恰好警告:fork 自带的桌面记忆(`src/memdir`/`getUserContext`/注入 CLAUDE.md)在共享容器里会跨租户泄漏——Scholar 的 memory note 已识别它「读到空」,这是正确判断(但有个陷阱见 §3.6)。

**2.6 peerreview 的 server-side 编排(durability 做得最重)**
`service.go` 的 orchestrator-worker 模式(methodology 路由 → alpha/beta/gamma worker → chief 聚合)正是 Anthropic multi-agent research system 的标准形。而且三层 durability:per-goroutine panic recover + `ReconcileStaleOnBoot`(部署后重启 orphan 行,`resumeConcurrency=2` 限流)+ `StartStaleSweeper`(每 5min 把 computing_* 卡超 15min 复位 failed),`UpsertReport` OnConflict 幂等。`chatWithRetry`(2 次有界重试 + 失败降级到 raw markdown)+ scoring 会话禁 Skill/Agent/Task(防工具叙述击碎 JSON)是非显然但关键的护栏。**这是全系统唯一有真正 server-side durability 的 feature**——但它的 durability 粒度是 per-submission/per-draft 行,**不是 per-round**:单 pod 崩在「reviewer 1 完成、聚合前」,reconcile 会从头 resume 整条审稿、重烧 reviewer 1 的 token(见 §3.5)。

---

## 3. 核心风险与弱点(ranked, grounded)

### 🔴 风险 1(CRITICAL):单守护进程 / 单实例假设是承重墙
**问题**:**三处** process-local 状态把整个系统钉死在单容器:`hub.go` 的 hubs map(`sync.Map`)、`bridge.go:70` 的 `tokenWatermarks`(`sync.Map`)、`peerreview/stream.go` 的 broker。jsonl 又强制单写者。
**代码**:`hub.go` 顶部注释自己写了——「若横向扩容,同一 session 订阅者落到不同实例 → 各开上游 → jsonl 双写」。
**为什么对 web 产品致命**:这不是「以后优化」,是**横向扩容的硬封顶**。一旦上 2 个 backend 副本:
- (a) 同 session 的两个 tab 落不同 pod → 各开一条上游 WS → **jsonl 双写损坏会话**;
- (b) `tokenWatermarks` 在每个 pod 各存一份 → **同一 session 在不同 pod 各自从 0 起算水位 → 重复记账或漏账**;
- (c) `peerreview.ReconcileStaleOnBoot` 在两个 pod 上同时跑 → 同一 submission 被双重 resume(`resumeConcurrency=2` 是**单进程** sem,挡不住跨 pod)——这正是 Diagrid「checkpoints are not durable execution」点名的「两进程 resume 同一 thread_id 双执行」。

**爆炸半径**:全站 agent 功能。单点故障 + 不可水平扩。**修复路径见 P1#8(一致性哈希 affinity)+ P1#9(分布式租约)**。

### 🔴 风险 2(HIGH):代码/文件执行 agent 的多租户隔离只有「逻辑 cwd」一层
**问题**:所有租户的 session 都在**同一个 scholar_agent 容器、同一份 `./data/agent` 卷**上,隔离只靠 per-session cwd(`/home/bun/sessions/<id>`)。claw 开了 `AllowBash=true`(为 pandoc/python);其余 feature 经 `SessionDisallowedTools(baseDisallowed, allowBash=false)` 在 create 时把 Bash 三件套追加禁掉。`EGRESS_FILTER_MODE` 默认 `open`(docker-compose.yml:404 核实)。
**代码**:`conversationService.ts:59-62` 明说 Docker Desktop/LinuxKit 内核跑不了非特权 userns(三档加固/松绑实测全失败),bubblewrap **二进制已预装但本地未启用**——限制是**内核侧**(hypervisor + kernel config 不开 `unprivileged_userns_clone`),不是缺二进制。
**为什么对 web 产品 bites**:cwd 是目录边界**不是安全边界**。
- **主向量(claw,最现实)**:一次成功的 prompt injection 让 claw 跑 Bash,就能 `cat ~/.claude/projects/*.jsonl`(读所有用户会话)、`printenv`(偷 `MINICOD_API_KEY`/`ANTHROPIC_*`),若 egress open 再 `curl` 外带。
- **次向量(所有 feature,常被忽略)**:**即便 Bash 被禁,`Read`/`Glob`/`Grep` 三个内建工具仍能遍历文件系统**——只要构造的路径绕过 per-session cwd 的 auto-approve 逻辑,就能读到别的 session 的 jsonl。Bash 不是唯一的文件访问通道,沙箱化必须覆盖这三个工具。

**缓解现状(诚实评估)**:已有纵深(内网无 NAT、cap_drop ALL、no-new-privileges、`pids:512` fork 炸弹防护——核实**确实已设**,docker-compose.yml:384)对**租户内 prompt-injection 外带**基本够。真正缺口是**跨租户读文件**(Bash + Read/Glob/Grep 双通道),利用 cwd 越界或 kernel CVE。结论:先**在真 Linux 生产机上打开已预装的 bubblewrap 沙箱**(FS allowlist 覆盖 Bash + Read/Glob/Grep,seccomp),并**把 egress allowlist 设为生产默认**,比上 gVisor/microVM 性价比高得多。

### 🔴 风险 3(HIGH,re-ranked ↑):进行中轮的部分内容只在内存,subs 归零即永久丢失
> **这是从原 risk#3 拆出并升级的核心点**:不是「以后做的 durability」,是**当下就在掉数据的 bug**。

**问题**:交互功能(smartsearch/claw/prism)的「一轮对话的进行中部分」**只活在 `hub.go` 的内存**里(`inFlight` bool + `replayBuf`,`hub.go:63`)。`replayBuf` **不落 `agent_sessions` 表、不落任何日志**。两个触发点都会让它蒸发:
- (a) **subs 归零**:`removeSubscriber` 摘到 0 → `shutdown()` → 关上游 WS + 清状态(`hub.go:232-244`)。用户关掉所有 tab,这一轮在前端的可见部分就没了。
- (b) **agent 容器崩**:`upstreamLoop` defer `h.shutdown()`(`hub.go:344`),`endTurn()` 把 `replayBuf=nil`(`hub.go:337`)——崩溃前已产出的 partial 助手内容**连重连都看不到**。

**精确边界(避免和 §3.4「不可见」混淆)**:
- 对**已完成的历史轮**,smartsearch/claw 重连**有 durability**:`agent.GetSessionMessages(sessionId)` 从 jsonl 拉回历史(`bridge.go:564/593/621`),用户能看到过去的轮。
- 丢的是**「正在进行那一轮、`message_complete` 之前的 partial 内容」**——这部分只在 `replayBuf`,从不落盘。
- 对比 peerreview:它有 **DB 行级 checkpoint**,崩了能 resume;hub 系**这一层完全没有**。

**为什么 bites**:这正是 memory 里 `agent-history-reentry-staletime` bug 的底层根源——reconnect 回不到刚结束/进行中的实时对话。LangGraph `stream_resumable` / vercel/resumable-stream 把「run 即使没人看也跑完、落进可游标寻址的事件日志、迟到/重连/多端都能续」产品化了。**修复见 P0#3(止血:不杀进行中轮 + 续尾)+ P0#6(per-turn Redis Stream 持久化 replayBuf)**。

### 🟠 风险 4(MEDIUM-HIGH):断连让进行中轮「对客户端不可见」(非「杀死」)
**问题**:`shutdown()` 在 subs 归零时关上游 agent WS。但**agent 子进程在容器内仍继续跑**——jsonl 会在 session 最终退出/超时时被 flush。
**精确措辞(纠正原草稿的「杀掉这一轮」)**:不是杀死 agent 的计算,是**让这一轮对客户端不可见**——agent 可能在后台把它跑完落进 jsonl,但**没有任何重连路径能续回那一轮的尾巴**(尾部 partial 在 hub 内存里已被 `endTurn` 清掉,且 hub 已 shutdown)。用户体验:切走再回来,刚才那轮的实时尾巴消失,只能看到 jsonl 里已 flush 的部分。
**为什么 bites**:浪费的 agent 计算(token 已烧但用户看不到)+ 破碎的多端/重连 UX。这与风险 3 是同一病灶的两面(可见性 vs 持久性),修复合并在 P0#3/P0#6。

### 🟠 风险 5(MEDIUM-HIGH):peerreview 单 pod 编排崩溃 = 整条审稿重烧,无 per-round 续点
**问题**:peerreview 的 durability 是 **per-submission/per-draft 行**,不是 per-round。若 backend pod 崩在「reviewer 1 完成、aggregation 之前」,`ReconcileStaleOnBoot` 重启后会 resume 这条审稿,但**从 round 1 重跑**(reviewer 1 的工作没有 cached result 行 → 重新调一次 worker → 重烧 token + 非确定性模型下结论可能漂移)。
**与风险 1(c) 的区别**:这是**单 pod 的编排状态持久性**(crash mid-orchestration → 整条重放),风险 1(c) 是**多 pod 的双 resume**;两者根因不同但都因「编排进度没 journal 到 per-round 持久行」。
**为什么 bites**:审稿是最贵的 feature(3 reviewer + methodology + chief,4 轮串行),整条重烧的成本最高。**修复见 P1#10(per-round 可 journal 步骤 + cached result)**。

### 🟠 风险 6(MEDIUM-HIGH):fork 一整个桌面 CLI 的维护负担 + 工具黑名单漂移
**问题**:`agent/src/` 带着 `commands/`(~93–114 个子目录)、`components/`(150 个)、`interactiveHelpers.tsx`(57KB)、`teamWatcher`/`cronScheduler`/`pluginService`/`desktopCliLauncherService`/`hahaOAuth`/computer-use——**全是单机桌面交互功能,在多租户 web 流里是死重 + 攻击面**。`QueryEngine.ts` 48KB。
**为什么 bites**:
- (a) 跟上游同步极痛;
- (b) **工具硬化靠手维护黑名单**:`conversationService.ts:40-91` 的 `resolveDisallowedTools()` 全局注入 `--disallowed-tools`,**上游新增一个内建工具不会被自动过滤、无 CI 检查**——哪天漏一个就是 Bash 级口子。注意控制流是**create 时定死**:`SessionDisallowedTools(base, allowBash)` 在 `BuildSpec` 算一次传给 `CreateSession`,**运行中 session 不会感知 spec 改动**(改 `AllowBash` 后只有新 session 生效),所以漂移检查必须在启动期/CI,而非寄望运行时纠偏;
- (c) `sessionService.ts`(1800+ 行 jsonl 手解析)+ `agent/client.go` 是**两层手写**,重复了 Agent SDK 现成的 `listSessions/getSessionMessages/...`。

### 🟡 风险 7(MEDIUM):prism/peerreview 逃离 thin-feature 模式后的耦合与重复
**问题**:peerreview 的编排脚手架(`runMethodologyPhase`/`chatWithRetry`/`reconcile`/model-tiering/panic-isolation)全在 `internal/peerreview` 里,**没下沉到 agentbridge**。下一个多 agent 功能会重新发明一遍。
**为什么 bites**:`FeatureSpec` 抽象本来很干净,但「重型 server-side 编排」这条路径没有对应的共享抽象,违背了 thin-feature 的初衷。

### 🟡 风险 8(MEDIUM):经济控制 = 每用户每日额度,缺 per-session/per-conversation 上限
**问题**:`CheckDailyQuota(userID)` 跨所有 session 求和,**没有 per-conversation 的 turn / token 封顶**(对标 OpenHands AgentController / Temporal budget)。一个失控的 claw 会话能快速烧完用户整天额度;也没有 top-level `maxTurns`。
**次要(记忆抽取成本)**:记忆抽取每轮让 LLM 输出**整块合并全文**(`service.go:177`),输出 token 随累积记忆线性增长,且廉价模型每轮都可能悄悄改写已有好记忆(对标 Mem0 的 ADD/UPDATE/DELETE/NOOP 增量,且能 NOOP 早退)。

---

## 4. 对标开源(借鉴什么)

| 维度 | Scholar 现状 | 最佳 OSS 对标 | 偷哪个具体点 |
|---|---|---|---|
| **Serving 模型** | 单守护进程 / session,扇出给 N 浏览器 | [Anthropic Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting):subprocess-per-session + 按 RAM 定容量 + 一致性哈希 session pinning | **consistent-hashing 路由** `(feature,sessionId)→daemon`,把「单实例」变成「daemon 池」,保住单写者又能扩容。`startup()` 预热池砍首消息延迟。 |
| **持久化 / resume** | jsonl 黑盒在容器,重启丢;**replayBuf 仅内存** | [Anthropic SessionStore](https://code.claude.com/docs/en/agent-sdk/session-storage)(jsonl→S3/Redis/Postgres dual-write + mirror_error);[OpenHands V1 事件溯源](https://arxiv.org/html/2511.03690v1) | **backend 自有的 append-only 事件日志**(per feature+session,Redis Stream),把 hub 的 replayBuf 升级成持久游标日志 → 跨实例/跨重启 resume,顺带修风险 3/4。 |
| **运行时隔离** | 单容器 + cwd + cap_drop + pids | [E2B](https://e2b.dev)(Firecracker/session)、[OpenAI Codex](https://developers.openai.com/codex/concepts/sandboxing)(两阶段:setup 有网有密钥,agent 阶段离线、密钥剥离) | **Codex 两阶段思路**(无需新基建):model-driven 轮默认 allowlist egress + 密钥最小暴露;**bubblewrap fs jail**(覆盖 Bash + Read/Glob/Grep)是「先买的更强隔离」。 |
| **durable execution** | peerreview 手写 reconcile/sweeper,per-draft 行非 per-round | [Temporal](https://temporal.io/solutions/ai)、[Restate](https://www.restate.dev/blog/durable-orchestration-for-ai-agents-with-restate-and-openai-sdk)(Virtual Object per-key 串行 + 自动 resume + 防双执行) | 把 peerreview 的**每个 review round 建成可 journal 的步骤**(per-round DB 行 + cached result),crash 后只重放未完成 round,而非从 round 1 重烧。 |
| **记忆** | 2 固定块 + 整块重写抽取 | [Mem0](https://github.com/mem0ai/mem0)(增量 fact ops + NOOP);[Zep/Graphiti](https://arxiv.org/html/2501.13956v1)(invalidate 不删 + 审计);[Letta](https://docs.letta.com/guides/agents/multi-agent-shared-memory/)(org/team 共享块) | **增量 delta 抽取 + NOOP 早退**(砍成本/防回归);**memory_block_history**(invalidate 不删可恢复 + 审计);per-feature 选择性注入(scoring 已正确排除记忆,推广之)。 |
| **streaming 传输** | 私有帧方言 + 自造 Hub | [AG-UI](https://github.com/ag-ui-protocol/ag-ui)(17 个 typed events);[vercel/resumable-stream](https://github.com/vercel/resumable-stream);[Ably resume token](https://ably.com/blog/resume-tokens-last-event-id-llm-streaming-reconnection) | **per-turn 单调 seq / Last-Event-ID** → 廉价 gap 检测 + 「发我 ID N 之后的」增量续传;把帧方言**文档化成版本化契约**(可 drop 进 assistant-ui,省掉 ~330 个手写 TS 镜像 interface)。 |
| **多 agent 编排** | peerreview orchestrator-worker | [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) | orchestrator 给每个 reviewer 写**per-worker 任务契约/focus brief**(现在只给共享 commonContext + persona,3 人关注点重叠);3 reviewer 本是 embarrassingly parallel,可 errgroup + per-tenant 信号量并行,chief 做 barrier。 |
| **多 tab 同步** | server-side Hub | [BroadcastChannel manager-tab](https://developer.mozilla.org/en-US/blog/exploring-the-broadcast-channel-api-for-cross-tab-communication/) / SharedWorker | **同浏览器多 tab** 用 leader-tab + BroadcastChannel 折叠成 1 个 Hub 订阅者(省 backend socket);**跨设备**仍留 Hub(BroadcastChannel 够不着)。标准混合方案。 |

---

## 5. 优先级建议(actionable roadmap)

### P0 —— 加固存量 + 止血(不重构,但堵住会出事故/正在丢数据的洞)

1. **生产强制 `EGRESS_FILTER_MODE=allowlist` + 打开 bubblewrap 沙箱(覆盖 Bash + Read/Glob/Grep)**(claw 受益最大,但 fs allowlist 对所有 feature 都堵住跨租户读 jsonl)。把「改模型 provider 前先改 egress allowlist」写进部署自动化,不让人能跳过。*Effort: 1-2 天(配置 + 真 Linux 验证)。Files: `docker-compose.yml`、`egress/`、`agent/src/server/services/conversationService.ts`。*
2. **agent 容器加 seccomp profile**(配合已有 cap_drop/pids)。*Effort: 1 天。Files: `docker-compose.yml`、`agent/Dockerfile`。*
3. **断连不杀进行中轮 + 重连可续尾**:`shutdown()` 在 subs 归零时改为**让上游轮跑完落 jsonl** 再延迟关,reconnect 走 agent resync 补尾。直接修 §3.3/§3.4(`agent-history-reentry` 类 bug)。*Effort: 2-3 天。Files: `hub.go`(removeSubscriber/shutdown)、前端 `useAgentSocket`。*
4. **工具黑名单漂移 CI/启动检查**:启动期或 CI 比对 agent 实际可用工具集 vs 期望白名单,新工具未显式放行就 fail(因黑名单 create 时定死、运行时不纠偏,必须前置)。*Effort: 1 天。Files: `conversationService.ts`、CI。*
5. **per-feature 工具一致性启动断言**:加 `bootstrap.ValidateToolConsistency`,逐 feature 抽检 session options 含正确 deny list(prism/smartsearch 必含 Bash deny,只有 claw 不含)。防有人误配 spec 把 Bash 在 prism/smartsearch 重新打开。*Effort: 0.5 天。Files: `bootstrap.go`、`spec.go`。*
6. **per-turn 持久化 replayBuf(Redis Stream,P1#12 的轻量前身)**:每轮把 `replayBuf` 帧 append 到 `rebuild:sessionId:turnId` Redis Stream,reconnect 时 `rebuild` 恢复 partial 内容。**这是修 §3.3 数据丢失的最小工程**,远低于全量事件溯源(P1#12),但当下就解锁「重连到进行中轮」UX。*Effort: 3-5 天。Files: `hub.go`、新 `agentbridge/turnlog.go`、前端 reconnect。*
7. **per-conversation turn/token 上限**:在 `hooks.go` PreUserMessage 之上加 per-session 累计封顶 + top-level `maxTurns`。*Effort: 1-2 天。Files: `hooks.go`、`spec.go`(加字段)、`ws.go`。*

### P1 —— 解锁可扩 + 把 durability 补全

8. **session 级一致性哈希路由**:`(feature,sessionId)` → 固定 daemon(或固定 backend pod),把「单实例」从隐式假设变成**显式 affinity**——同时解决 hubs map + `tokenWatermarks` 两处 process-local 状态的扩容封顶。最低成本去掉 §3.1 footgun(保住单写者)。*Effort: 1-2 周。Files: `bridge.go`/`hub.go` 的 getOrCreateHub、部署层 LB 配置。*
9. **peerreview reconcile 加分布式租约**(Redis `SET ... NX EX 30` per submissionID),消除多副本双 resume(补 §3.1(c))。*Effort: 3-5 天。Files: `peerreview/service.go` 的 ReconcileStaleOnBoot。*
10. **peerreview per-round journaling**:每个 review round 建独立 DB 行 + cached result,crash 后只重放未完成 round 而非整条重烧(修 §3.5)。*Effort: 1-2 周。Files: `peerreview/service.go`、迁移。*
11. **记忆增量抽取(delta + NOOP)**:把整块重写改成 `{adds, removes}`,no-change 跳过写库。*Effort: 3-5 天。Files: `usermemory/service.go`(prompt + parseUpdates)、agent 侧抽取 prompt。*
12. **append-only 事件日志(Redis Stream)全量替代内存 replayBuf**:per-turn seq + 持久游标,跨实例/重启可续。这是 P0#6 的工业化版,也是 P1#8 之后真正多副本的前提。*Effort: 2-3 周。Files: `hub.go`、新 `agentbridge/eventlog.go`、前端 reconnect。*

### P2 —— 收口与减重

13. **把 peerreview 编排脚手架下沉到 `agentbridge/orchestrator.go`**(contract+retry+degrade、model-tiering、reconcile、panic-isolation),供未来多 agent 功能复用。*Files: `peerreview/service.go` → `agentbridge/`。*
14. **裁剪 fork 的桌面子系统**(teamWatcher/cronScheduler/pluginService/desktopCliLauncher/hahaOAuth/computer-use):删或 guard-rail,缩攻击面和同步负担。*Files: `agent/src/server/services/`。*
15. **帧方言版本化契约 + 单监控**:文档化 ServerMessage 类型,Hub 加订阅者 churn/慢客户端/广播积压指标。*Files: `agent/src/server/ws/events.ts`、`hub.go`。*

---

## 6. 前瞻:架构演进选项

**选项 A —— 保 fork,做 per-session/per-instance 隔离(渐进硬化)**
路线:P0 + P1#8/9/10。保持现有 FeatureSpec/bridge/Hub 不动,只加沙箱 + affinity 路由 + 租约 + per-round journal。
- 优点:四个 feature 模块零改动;风险最低;周级见效。P0#6 当下就止住数据丢失。
- 缺点:仍背着 800KB 级 fork 维护负担;jsonl 黑盒的「自造扇出/自解析/无 server-side 搜索」债务全留着;只是「能跑多副本」不是「真 HA」。

**选项 B —— 把执行后端做成可插拔,逐步迁向 Agent SDK / 隔离 runtime**
`internal/agent` + `agentbridge` 已经是「HTTP/WS 薄客户端打一个 runtime」——**这个可插拔 seam 已经存在,不需要新造**:`Bridge` 在 bootstrap 用 `New(client, repo)` 注入 `agent.Client`(`bridge.go:166`),`Bridge` 接口已分离暴露 `For/MemoryBlocks/Client/AgentClient`。换执行后端**只动 `internal/agent` + `internal/agentbridge/{bridge,http_handler}`,4 个 feature 模块一行不改**。现守护进程是其一,可加「per-user daemon」或「sandbox-per-session(E2B/Daytona 式)」,并用 [Agent SDK SessionStore](https://code.claude.com/docs/en/agent-sdk/session-storage) 思路给持久化兜底。
- 优点:四个 feature 模块不动就能换底;`sessionService.ts` + `client.go` 两层手写有机会大幅删除;隔离 + HA 一并解决。
- 缺点:Agent SDK 实验性 `createSession` V2 已在 0.3.142 移除(你们 `createSession` 形状正镜像那个死 API),迁移有适配成本;月级工程。

**选项 C —— 给 server-side 编排引 durable execution 引擎(Temporal/Restate)**
只把 peerreview(及未来批量/多 agent 功能)迁到 Temporal/Restate,交互功能仍走 Hub。
- 优点:peerreview 的手写 reconcile/sweeper/双执行/单 pod 重烧隐患被引擎根除,获得 per-step resume + 时间旅行调试。
- 缺点:引入重基建,仅服务一个功能,ROI 取决于未来多 agent 功能数量。

**推荐:A 现在做(P0 是止血——尤其 P0#6 是正在丢数据的 bug,不是优化;P1#8/9/10 解扩容与 durability),同时朝 B 演进**。理由:Scholar 最深的债务不是隔离也不是编排,而是**jsonl 黑盒选择**——它派生出自造 Hub(且 Hub 的进行中轮纯内存→数据丢失)、双层手写 session 层、无 resume、单写者扩容封顶这一整串问题(§3.1/3.3/3.4/§4)。A 是堵漏,B 才是拆掉债务的根。而 B 的可插拔 seam **已经摆好且经过接口隔离验证**(`bridge.client` bootstrap 注入),这是低风险走向 B 的现成跳板。C 暂缓,等第二个重型多 agent 功能出现再评估——届时把 P2#13 的共享编排脚手架直接建在引擎上。
