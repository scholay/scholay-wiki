> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 编排与后端组织 (Orchestration & Backend Organization)

> 本篇只回答一个问题:**后端应该如何组织 agent 的控制流与编排?** 隔离/沙箱细节交给安全维度,
> 记忆细节交给记忆维度,调度执行底座的运维取舍交给 06(调度)文档——本篇只在编排面与它们衔接。
> 推荐落点全部具体到「我们仓库哪张表/哪个 `agentbridge` 文件/agent 容器哪个 handler」,并标注影响的 C 编号。

---

## 1. Landscape:把控制流收归后端,默认单线程

业界对 agentic 系统的第一刀分水岭(Anthropic「Building Effective Agents」,findings B-orchestration §1):

- **Workflows** —— "LLMs and tools are orchestrated through predefined code paths",控制流写死在代码里。
- **Agents** —— "LLMs dynamically direct their own processes and tool usage",LLM 自驱。

推论是 **software-first**:HumanLayer 12-Factor Agents 的核心是「多数好 AI 产品 are mostly deterministic
code, with LLM steps sprinkled in at just the right points」。对编排最承重的四条 factor:**#5 Unify
execution state and business state**、**#12 stateless reducer**(把 agent 建成纯函数 `(state,event)→state`,
状态落自己 DB)、**#8 Own your control flow**(后端拥有 loop,可在轮次间中断/检查点/注入)、**#6 Launch/
Pause/Resume with simple APIs**。这四条直接否定我们当前「agent 自管 jsonl、backend 黑盒」的设计。

**单线程 vs 多 agent 的调和**(B-orchestration §单线程 vs 多 agent):

- 默认 **单线程线性 agent**(Cognition「Don't Build Multi-Agents」+ 12-factor #10 Small, Focused Agents)。
  并行子 agent 会让每个 worker 在「看不见彼此选择」下做隐式决策,逼最终 agent 去调和不兼容的工作
  ——"Actions carry implicit decisions, and conflicting decisions carry bad results"。Claude Code 是正面
  范例:它**避免并行子 agent**,子 agent「只回答有界问题、从不写代码」。
- **只在只读、独立、可并行的 fan-out 才上 orchestrator-workers**(Anthropic「Multi-Agent Research
  System」):lead agent「分析查询、制定策略、spawn 子 agent 并行探索、再综合」,典型 3–5 个并行子
  agent,子 agent 回 **condensed summary(1–2k token)**。代价是 **~15× token**(单 agent 约 4× chat);
  提速可达「复杂查询 −90% research time」。强耦合的写作/编辑(论文撰写、审稿报告拼装)**绝不**用多 agent。
- 一句口诀(多源印证,具体 ±81%/−70% 数字 [UNVERIFIED]):**顺序/有状态 → 单 agent;真正可并行的只读 → fan-out,启用前先按 15× 预算。**

**这对我们意味着**:Scholay 四个 feature 里只有 smart_search 的「多论文/多来源检索」天然适合 fan-out;
claw 的写作交付、prism 的论文编辑、peerreview 的报告拼装全是强耦合,应坚持单线程。当前我们已通过
`conversationService.ts:62-68` 在无头 `--print` 下重开 Task/Agent 且子 agent 工具调用会回到后端裁决——
这是个好底子,但**编排策略(何时 fan-out、子 agent 回什么)目前完全交给了 prompt,后端不参与**。

---

## 2. 我们的现状与差距

### 2.1 根因:backend 黑盒 + agent 自管 jsonl(违反 12-factor #5/#12)

01 文档 §1 数据落点表写得很清楚:会话 transcript 的真值在 agent 容器 `~/.claude/projects/.../<sid>.jsonl`
——「**agent 自管,backend 黑盒**」。后端 `agent.Client` 是纯 HTTP 客户端,**从不读 jsonl**(01 §2/§3.5)。
这正是 12-factor #5(统一 execution state 与 business state)与 #12(stateless reducer)要消灭的反模式:
我们的「execution state」是 agent 进程私有的不透明 jsonl,「business state」散在 MySQL `agent_sessions`
(只是映射)+ Redis 配额 + MinIO artifact,两者**没有单一真源**。后果具体而言:

- token 归属靠事后 `FindByAgentSessionID` 反查(C7:WS usage 行 `request_id` 为空,`hooks.go:78,84`);
- 配额前置检查与扣减解耦(C7),一轮长生成可在下次 `PreUserMessage` 才看到超额;
- 状态隔离退化为软约定(C5:随机 sid + cwd-fence,`SCHOLAY_ISOLATE_SESSIONS`),非硬边界;
- 横向扩展全失效(C2/C3:displacement `sync.Map` 进程内 + 配额 reset 256-shard mutex,Redis 锁未实现)
  ——本质是「权威状态在进程内/在 agent 私有 FS」的连带症,**只要状态还不在共享 DB,扩展就无解**。

对标里两个项目刚做完这次迁移、可作信心来源:**Goose 自 1.10.0 用 SQLite `sessions.db` 取代逐个 jsonl**
(B-goose §关键架构,verified 官方);**Hermes 是 SQLite-everywhere**(B-hermes §关键架构)。两者都验证了
「jsonl → 关系型 store」是可行且收益明确的方向。

### 2.2 bridge 抽象只覆盖 WS pipe happy path

`agentbridge` 为「WS pipe + user↔session」这一条 happy path 设计得很干净——smart_search ~120 行纯委托即接上
(01 §2.1)。但一旦 feature 偏离这条路就开始漏:

- **C10 SessionOptions 不覆盖 server-side**:`spec.SessionOptions` 只对 WS 路径生效(`bridge.go:234,539,624`);
  peerreview 绕开 bridge,须 per-`CreateSession` 重传 `DisallowedTools/AddDirs`(`service.go:311,354,554`)。
- **C11 配额钩子无 server-side 等价**:`PreUserMessage` 只在 WS pipe 触发(`ws.go:329`);peerreview 须手放
  配额在 `Submit`(`service.go:1456`),spec 注释自认易漏(`spec.go:44`)。
- **C13 artifact 交付是 claw 私有**:harvest→MinIO→dedup→reconcile + live-fallback + dir-zip 全在 claw
  (`artifact_harvest.go`),`agentbridge` 完全不知 artifact——但「agent 写 `./out/` → 交付 web 用户」是
  通用 agent-native 模式,prism 编译产物、未来 feature 都想要。
- **C19 死代码 + 重复**:三 WS feature 仍 `SetLLMUsageRecorder` 但已不用(per-call 记账移到 agent);三处
  `preUserMessageChain`/`onMessageComplete` 近乎逐字重复,呼唤一个共享 helper。

### 2.3 四 feature 各自编排(01 §4 对比表要点)

| 维度 | smart_search | claw | prism | peerreview |
|---|---|---|---|---|
| Transport | WS pipe | WS pipe | WS pipe + **round 事务** | **ServerSideChat→SSE broker**(绕开 bridge) |
| Picker / persona | 单 persona | 单 persona | agent-native 协议 | **4-persona 随机** |
| SessionOptions | 无 | 无 | denylist + AddDirs(WS 路径生效) | **per-CreateSession 重传**(C10) |
| 配额接入 | `PreUserMessage` | `PreUserMessage` | `PreUserMessage` | **手放 `Submit`**(C11) |
| Artifact 交付 | 无 | **harvest→MinIO**(C13) | 编译 PDF(独立管线) | 无 |
| 会话归属 | bridge | bridge | 双写 + **Trusted ws-ticket 后门**(C12) | 双写 |
| 多会话 | 单 | sidebar CRUD | per-project(与 bridge user↔session 冲突,C12) | per-submission |

要点:**peerreview server-side 完全绕开 bridge**(自管 session 创建、配额、SSE broker),把 C10/C11 全
继承给「任何未来 server-driven feature」;**prism 的 round 事务自管**(`PrepareRound` 物化 DB→cwd,
agent 改 cwd 出 live diff,**round 结束不自动持久化**,用户 `ApplyRound`/`RejectRound`,支持 per-hunk
overrides)——这其实是 prism 自己实现了一套「human-in-the-loop 审批 + DB-as-truth」,而 bridge 没有把它
抽象出来,导致 prism 还得开 **Trusted ws-ticket 后门**(`ws_round.go:47-56`,跳 `OwnsSession`,C12)。

**结论**:bridge 抽象的层级选错了——它抽象了「WS 字节搬运」,却没抽象「编排契约」(session 选项 /
配额钩子 / 审批 / 交付 / 归属)。prism 的 round 事务恰恰证明了正确的抽象边界应该更高。

---

## 3. 目标设计(给我们的栈)

### 3.1 state 出 jsonl 进 DB:选项 A(渐进)vs 选项 B(彻底)

这是本维度最大的一根承重柱,对应 12-factor #5/#12 与 B-orchestration「值得借鉴 #1」。两条路:

**选项 A —— 保留 jsonl,DB 记权威 event/checkpoint 索引(渐进)。**
agent 继续写 jsonl(不动 agent 容器的 query loop),但后端在 WS pipe 里**旁路落库**:每个 `message_complete`
帧(已含 token usage,01 §3.2)在 `recordAgentTokens`(`hooks.go:51-74`,跨三路的唯一 token 构造点)旁
追加写一张新表 `agent_turns`(见 §5),记 `(agent_session_id, turn_idx, role, request_id, token_usage,
checkpoint_ref, created_at)`。jsonl 仍是 transcript 真值,DB 是「权威 event 索引 + checkpoint 指针」。
- 收益:**立即修 C7**(每 turn 有 `request_id`,配额可精确归属、可做 per-session 计费、可前置预扣);
  为「后台任务面」(§4)提供可查询的进度真源;不碰 agent 容器、风险低。
- 不动:C5 隔离仍是软约定、C2/C3 横向扩展仍卡(state 索引在 DB 但 displacement 锁还在进程内)。
- 触点:`agentbridge/hooks.go`(旁路写)、`agentbridge/ws.go:439-446`(`OnMessageComplete` 钩子点)、
  新表 `agent_turns`、新迁移。

**选项 B —— DB-as-truth,jsonl 降为派生(彻底)。**
后端拥有每轮 loop(12-factor #8),transcript 权威落 MySQL,agent 容器从「自管 jsonl」降级为「无状态
reducer」:每轮后端把 `(state, user_event)` 喂进去,agent 出 `next_messages + tool_calls`,后端落库后再
驱动下一轮。jsonl 只作 agent 进程内的临时副本/调试派生。
- 收益:**从根上修 C5/C2/C3/C4**——状态在共享 DB,隔离是租户分区不是 cwd 软约定;displacement/配额锁可
  改 Redis(state 不在进程内了);per-user 记忆有了挂载点。这是 prism 已经局部做到的(`prism_*` 是
  DB-as-truth,01 §1 数据落点表),把它推广到全平台。
- 代价:**重写 agent 容器的状态模型**(query loop 现在自管 context/压缩/resume,01 §3.2/§3.6),且要求
  determinism 才能 replay(B-orchestration §调度,LangGraph/Restate/Temporal 都要求把非确定操作包成步骤)——
  把这套硬塞进一个会随意写 FS 的 CLI 风格 agent「并不简单」(B-orchestration §局限,明确告诫)。
- 触点:agent 容器 `query.ts`/`conversationService.ts` 大改;`agent_sessions` 从映射表升级为权威状态;
  `agent.Client` 从「黑盒 HTTP」变「reducer 驱动」。

**推荐:A 先行、B 为北极星,中间设一个「checkpoint 索引」过渡态。**
理由:B 的 ROI 集中在「隔离 + 横向扩展」,而那两条更该由**沙箱维度(per-session 容器/microVM)** +
**Redis 分布式锁(C2/C3 的直接修法)** 优先解决,不必为它们先把 agent 重写。先做 A 拿到 `request_id`/
event 索引(解锁计费精度 + 任务面),把 displacement/配额锁单独迁 Redis(不依赖 B),再视沙箱进度决定是否
走 B。**别为了「DB-as-truth 的纯洁」一次性重写 agent**——01 §8.2 已点明这是桌面与 Web 最根本的张力,
分步拆解比一把梭安全。

### 3.2 bridge 抽象补齐(治 C19/C10/C11/C13/C12)

把 bridge 的抽象层级**从「WS 字节搬运」抬到「编排契约」**。四个具体动作:

1. **`agentbridge.StandardHooks(featureKey, action, vip)` 共享 helper(治 C19)。**
   把三处逐字重复的 `preUserMessageChain`(vip 每日限额 + usagestat「question」事件)+ `onMessageComplete`
   收成一个 helper;同时删掉三处不再用的 `SetLLMUsageRecorder` 死注入。这是纯重构、零行为变更,先做。
   触点:新建 `agentbridge/hooks.go` 里的 `StandardHooks`,改 `smartsearch/spec.go`、`claw/spec.go`、
   `prism/spec.go` 引用。

2. **server-side 路径的 SessionOptions / 配额对等(治 C10/C11)。**
   把 `SessionOptions` 与 `PreUserMessage` 钩子从「只 WS 路径」提升为「session 创建 + 每轮的统一契约」,
   让 server-driven feature(peerreview)走同一条。具体:`agent.Client.CreateSession` 接受 `SessionOptions`
   并由 bridge 在**两条路径**(WS pipe 与 `ServerSideChatStreaming`)统一注入;`PreUserMessage` 在
   server-side 的每个 round 入口也调用(而非让 peerreview 手放在 `Submit`)。
   触点:`agentbridge/bridge.go:234,539,624`(SessionOptions 注入点)、`agentbridge/ws_serverside.go:62`、
   `peerreview/service.go:311,354,554,1456`(删手放、改走 bridge)。

3. **artifact 交付上抽为 bridge 一等能力(治 C13)。**
   把 claw 的 harvest→MinIO→dedup→reconcile + dir-zip(`claw/artifact_harvest.go`)抽成
   `agentbridge.ArtifactDelivery`(由 `FeatureSpec` 开关 + 配 bucket/前缀),让 prism 编译产物、未来 feature
   复用同一管线。借 Hermes 的 **workspace kinds**(`scratch` 完成即删 / `dir:<path>` 保留 / `worktree`,
   B-hermes §编排)给「agent 写到哪、交付完清不清」一个干净抽象——正对我们「删 session → 清 cwd」的需求。
   触点:新建 `agentbridge/artifact.go`,claw 改为薄封装;prism 编译管线接入。

4. **把 prism round 事务抽象成 bridge 的「审批回合」原语(治 C12)。**
   prism 的 `PrepareRound/ApplyRound/RejectRound` + per-hunk overrides 实质是「human-in-the-loop 审批 +
   DB-as-truth round」,这正是 12-factor #7(Contact humans with tool calls)与 LangGraph interrupt 的形态
   (B-orchestration §值得借鉴 #6)。把它抽成 bridge 的 `ReviewRound` 原语后,**Trusted ws-ticket 后门
   可以退役**——归属校验由 bridge 在 round 入口统一做(经 `OwnsSession`),不再需要 prism 自己跳过。
   触点:`prism/ws_round.go:47-56`(删 `IssueWSTicketTrusted`)、`agentbridge` 新增 round/审批契约。

### 3.3 何时引入多 agent + 工具表面收敛

- **多 agent 只给 smart_search 的只读 fan-out。** lead agent 收到「检索 transformer 相关近三年高被引」后
  spawn 3–5 个子 agent 并行打 `mcp__minicod__*`(不同子查询/不同来源),每个子 agent **只回 1–2k token
  condensed summary**,lead 综合(Anthropic Multi-Agent + B-orchestration §值得借鉴 #4)。我们已重开
  Task/Agent 且子 agent 工具调用回到后端裁决(`conversationService.ts:62-68`),底子在;缺的是**后端在
  `PreUserMessage` 钩子里按 ~15× 预算把 fan-out 圈进配额**(否则一次 fan-out 就把用户日额烧光)。其余三
  feature(claw/prism/peerreview)保持单线程。
- **工具/MCP 表面收敛**(Anthropic「Writing Tools for Agents」,B-orchestration §3):我们当前唯一 MCP
  是 minicod(01 §7.3),表面已经很小,但仍可借四条原则——**namespacing**(`mcp__minicod__papers_search`
  vs `mcp__minicod__authors_search`)、**返回高信号**(论文标题/作者而非不透明 ID)、**`response_format`
  (`concise`/`detailed`)** 让 agent 自选啰嗦程度、**分页/截断默认值** 压 token。这是 minicod MCP server
  侧的改动(vendored 进 agent 容器 node_modules),不在我们 Go 后端,但应作为编排成本控制的一环列入。

---

## 4. Kanban 作为统一编排底座(借 Hermes)

我们当前有 **C15**:无后台/异步任务面 + 无完成通知(前端 `busy` 纯靠前台 WS,导航离开则 WS 关、
`pendingTurns` 丢;`PushNotification` 还在 denylist)。这不是一个孤立缺口——它和「多 agent 编排」「定时
任务」其实是同一个底座问题。Hermes 给了最值得偷的模型(B-hermes §编排/调度):

**一张任务板,三种执行态走同一 pipeline。** 把交互态(用户在前台 WS 等)、后台态(用户切走了,任务接着
跑)、定时态(cron 触发)统一建模成**同一张任务表的行**,用一个 `execution_mode` 字段区分,经同一个
dispatcher 流转。这正是 12-factor #11(Trigger from anywhere)+ #6(Launch/Pause/Resume),也呼应 Goose
路线图「在边界处把一切都当 Recipe、用单一 executor 收敛 chat/scheduler/subtask」(B-goose §编排 #4389)。

Hermes Kanban 的可借鉴结构(均官方确认,B-hermes §编排):
- **状态机** `triage | todo | ready | running | blocked | done | archived`;父任务 `done` 时把子任务
  `todo → ready`(依赖满足才 promote)。
- **`task_events` append-only**(单调 id + `run_id` 指针):既驱动实时看板又做永久审计——正好补我们
  缺的「任务进度真源」(与 §3.1 选项 A 的 `agent_turns` 同源思想)。
- **`task_links`** 父→子依赖:这就是多 agent fan-out 的持久化形态(lead 任务 spawn 子任务行,而非进程内
  蜂群——Hermes 明确「no in-process subagent swarms」,每个被指派 profile 拉起独立进程)。
- 任务字段:`assignee`(对我们=feature/persona)、`tenant`(对我们=`user_id` 命名空间)、**idempotency
  key**(治 C6 双行那类并发问题的通用手法)、`priority`、`max_runtime_seconds`、`max_retries`、`workspace`、
  可选 `scheduled_at`。
- **Promptware Defense**:对「被存储/被调度的任务体」在执行前做提示注入扫描——我们目前完全缺失,而一旦
  允许定时/后台任务,任务体就是个新的注入面,必须有这层(与 C9 in-band 注入是同类风险的不同入口)。

**对我们的具体落法**:在已有 **MySQL + Redis**(不引入 Temporal,保持 docker-compose 轻量)上建一张
`agent_tasks` 表 + `agent_task_events` append-only 表,dispatcher 复用我们已有的 `safego.Go` + Redis 锁
(C2/C3 要修的那把锁正好这里复用)。交互态任务直接由 WS pipe 创建并标 `execution_mode=interactive`;用户
导航离开时任务**不销毁**而是转 `background`(修 C15 的孤儿化);cron 触发的标 `scheduled`。完成时经站内信/
WS 推 `message_complete` 通知(`PushNotification` 仍留 denylist,改用我们自己的 `internal/message` 站内信
通道,01 未涉及但属现成基建)。

> **与 06 的衔接**:本节只定义**编排面**——任务板的数据模型、状态机、依赖、execution_mode 三态统一。
> dispatcher 的**调度细节**(claim/heartbeat/reclaim、cron 解析、durable execution 运行时是否上 Temporal/
> 仅 Redis-lock-on-MySQL、per-job fresh agent)交叉引用 06(调度)文档。两篇共用 `agent_tasks` 表,
> 本篇负责「任务长什么样、怎么编排」,06 负责「任务怎么被可靠地跑起来」。

---

## 5. 分期选项 + 取舍 + 改动触点

> 排序按「ROI / 风险」。每期标注影响的 C 编号与改动触点。前两期是低风险高回报、应尽快做;
> P3/P4 是结构性投资;P5 是北极星、按沙箱进度决定是否启动。

### P0 — 纯重构,零行为变更(治 C19)
- `agentbridge.StandardHooks` 收口三处重复 hook,删 `SetLLMUsageRecorder` 死注入(C19)。
- **取舍**:无风险、立刻减负;不解决任何功能缺口,但为后续每一期减少改动面。
- **触点**:`agentbridge/hooks.go` 新增 helper;`smartsearch/spec.go`、`claw/spec.go`、`prism/spec.go`。

### P1 — DB 记权威 event 索引(选项 A)+ 横向扩展解锁(治 C7、C2、C3)
- 新表 `agent_turns(id, agent_session_id, turn_idx, role, request_id, prompt_tokens, completion_tokens,
  checkpoint_ref, created_at)`,在 `recordAgentTokens` 旁路写;`request_id` 在 WS pipe 入口生成并随帧透传。
- displacement `activeWSConns` 与配额 reset 锁改 **Redis(SETNX/租约)**——这两把锁不依赖选项 B,可独立
  迁移(`displacementKey = featureKey + ":" + sessionID` 直接做 Redis key)。
- **取舍**:渐进、不碰 agent 容器;立即拿到精确 token 归属(可前置预扣、per-session 计费)+ 解开单实例
  钉死(C2/C3);**不**解决 C5 隔离(那是沙箱维度)。代价是多一张表 + 一次写放大(可异步)。
- **触点**:`agentbridge/hooks.go:51-74`、`ws.go:439-446`、`bridge.go:44-46,74-76`(displacement 锁)、
  `vip/quota.go:24-34`(reset 锁)、新迁移建 `agent_turns`、`agent_sessions` 补 `request_id` 关联。

### P2 — bridge 编排契约补齐(治 C10、C11、C13、C12)
- server-side SessionOptions/配额对等(C10/C11);artifact 上抽为 `ArtifactDelivery`(C13)+ Hermes
  workspace kinds 抽象;prism round 抽成 bridge `ReviewRound` 原语并退役 Trusted 后门(C12)。
- **取舍**:中等工作量、改动集中在 Go 后端(不碰 agent 容器);收益是「未来加 server-driven/带交付的
  feature」不再重复造轮子,且 prism 的跨用户劫持后门被堵。风险点是 peerreview 2093 行 service 的回归面,
  需 `scripts/test-library-share.sh` 式的 E2E 兜底。
- **触点**:`agentbridge/{bridge,ws_serverside,artifact}.go`、`peerreview/service.go`(删手放配额/重传
  options)、`claw/artifact_harvest.go`(降薄封装)、`prism/ws_round.go:47-56`(删 Trusted)。

### P3 — Kanban 任务板 + 后台/完成通知(治 C15)
- `agent_tasks` + `agent_task_events`(append-only)两表;`execution_mode ∈ {interactive,background,
  scheduled}` 三态走同一 dispatcher(建在 MySQL + 现有 Redis 锁上,不上 Temporal);`task_links` 父子依赖;
  完成经 `internal/message` 站内信 + WS 通知。任务体执行前过 Promptware-Defense 式注入扫描。
- **取舍**:这是结构性新增,工作量最大但补齐三条缺失轴(后台/定时/多 agent 的持久化形态);不上 Temporal
  保持 docker-compose 轻量(取舍见 06)。风险:dispatcher 的 claim/reclaim 正确性依赖 P1 已迁好的 Redis 锁。
- **触点**:新表 + 新迁移;新 `internal/agenttask` 模块;`agentbridge` 任务创建钩子;前端任务面板(交叉
  引用前端维度)。**调度细节交叉引用 06。**

### P4 — 只读 fan-out 多 agent(smart_search)
- smart_search 启用 lead→3–5 子 agent 并行 minicod 检索,子 agent 回 1–2k summary;`PreUserMessage` 按
  ~15× 预算圈配额;子 agent 任务落 §4 的 `task_links`。
- **取舍**:只给 smart_search,其余三 feature 明确**不**做(强耦合写作会产 conflicting decisions);收益是
  复杂检索提速,代价是 token 预算需重算 + UI 要能展示 fan-out 进度。建议在 P3 任务板就绪后做(子 agent
  即任务行,天然有进度/审计)。
- **触点**:`smartsearch/spec.go`(配额预算 + fan-out 策略 prompt)、agent 容器子 agent 定义、`agent_tasks`。

### P5 — DB-as-truth(选项 B,北极星)
- agent 容器降为无状态 reducer,transcript 权威落 MySQL,jsonl 降派生;从根上修 C5/C4 的状态面。
- **取舍**:最大重写、要求 determinism、ROI 集中在隔离+扩展(而那两条 P1 的 Redis 锁 + 沙箱维度已能各自
  缓解);**建议作为北极星而非近期目标**,待沙箱(per-session 容器/microVM)落地后再评估是否仍需要 B。
- **触点**:agent 容器 `query.ts`/`conversationService.ts` 状态模型;`agent_sessions` 升级为权威状态;
  `agent.Client` 改 reducer 驱动。

---

## 附:本维度核心引用

- 现状事实:01-current-architecture.md §1(数据落点)、§2(agentbridge)、§3.2/§3.3/§3.5(query loop/
  子 agent/jsonl)、§4(四 feature 对比)、§8(妥协清单 C1–C22)。
- 理论:Anthropic Building Effective Agents / Multi-Agent Research System / Writing Tools for Agents;
  HumanLayer 12-Factor Agents(#5/#6/#8/#10/#11/#12);Cognition Don't Build Multi-Agents(findings
  B-orchestration)。
- 对标:Hermes Kanban + workspace kinds + Promptware Defense(B-hermes);Goose sessions.db 迁移 +
  「一切皆 Recipe / 单 executor」(B-goose);Claude Code 子 agent「只回有界 summary」+ hooks 强制层
  (B-claude-code)。
