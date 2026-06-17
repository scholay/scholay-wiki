> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 定时任务与后台/异步 agent 执行 (Scheduled / Background / Async Agent Execution)

> 维度定位:这是用户**明确要加**的能力——「在 cron 上跑 agent / 长时间后台任务 / 任务跑完了通知我」。
> north-star 对应:**durable 任务底座 + Kanban 式任务板,建在已有 MySQL+Redis 上**(不引 Temporal 集群)。
> 本文给出可落地的 schema、dispatcher 设计、durable/HITL 路线,以及三档分期 + 取舍 + 改动触点。
> 直接命中的妥协:**C15(无后台/异步任务面 + 无完成通知)** 为主,连带 C2/C3(单实例)、C7/C8(配额)、C11(server-side 配额钩子漏)、C9(prompt 注入)。

---

## 1. Landscape:别人怎么做的(一段)

把"在 cron 上跑 agent"做成产品的有三家,各给一块拼图:**Goose Scheduler** 用 6 段 cron(`second minute hour day month weekday`,老 5 段自动补秒)+ **排程时刻把 recipe 复制到 `scheduled_recipes/` 做快照**(源文件被删调度仍可用),且 legacy 与 Temporal 两个 backend 都 **"fresh Agent per run"**(每次触发起一个全新 agent,findings/B-goose 已核实);**Claude Routines** 是"agent 版 cron",一套配置存到 Anthropic 托管 infra 按计划/触发跑(2026-04-14 research preview,**多触发面 = schedule / API `/fire` bearer / GitHub webhook**,findings/B-scheduling 已核实);**OpenAI Codex Automations** 给出对"共享 FS"问题的具体答案——**后台运行在专用 background worktree 上(每次运行有自己的 cwd)**,结果落 **review queue / inbox(Triage)**、有发现才进收件箱否则自动归档,而非实时推送(已核实)。底座层有四个 durable execution 框架:**Temporal**(完整 Event History,"死在第 47 步从第 48 步续",LLM 调用 = 一个自动重试的 Activity,但需独立集群+workflow 确定性约束)、**Restate**(journaling + Virtual Objects 按 key 隔离 state,sidecar/嵌入式低运维)、**DBOS**(状态 checkpoint 到 Postgres、**DB 背书持久队列**带并发上限/速率/优先级/超时、**零新增 broker**)、**Inngest AgentKit**(Router+Network 多 agent)。**异步 HITL = 挂起即释放算力**是本维度对我们最有价值的模式:**Restate Awakeables**(agent 拿一个 durable promise ID 发给审批人后挂起、"On serverless infrastructure, you pay nothing during the wait",审批人几天后 HTTP `…/awakeables/<id>/resolve` 恢复)与 **AgentKit `step.waitForEvent()`**(`timeout:'4h'` + `match:'data.ticketId'`,挂起期不耗算力)。最后,**Hermes Kanban**(Nous Research,MIT)把上面几条缝成一个可自托管的多 agent 任务看板:SQLite + WAL 的任务表(`triage|todo|ready|running|blocked|done|archived` 状态机 + `task_events` append-only 审计 + `task_links` 父→子依赖)+ **cron 驱动的 dispatcher(默认 60s):reclaim stale/crashed → 父 done 则 todo→ready promote → `BEGIN IMMEDIATE` 原子 claim → 把 assignee profile 拉起为隔离 worker**,workspace 分 `scratch`(完成即删)/`dir`/`worktree`(findings/B-hermes 官方 `kanban.md` 已核实)。**一个贯穿全程的结论:调度本身不解决长期记忆**——fresh-agent-per-run 天然跨次无记忆,记忆是正交层(见 04 记忆维度)。

---

## 2. 我们的现状:完全缺失 (C15)

这一维度在 Scholay **从零开始**。01 文档 §8.1 C15 + §6.1/§6.4 的事实:

- **前端 `busy` 纯靠前台 WS**:UI 的"运行中"状态来自 `lastTurn && !complete`(`useAgentSocket.ts`),没有任何服务端可查询的"任务状态"。
- **导航即丢 `pendingTurns`**:用户切路由 → WS 关 → 在飞的 `pendingTurns` 丢,只能回到该 session 经 `resyncSessionOutput` 恢复(`agent/src/server/ws/handler.ts`,10min grace 缓冲在 `liveTurnBuffers`)。但 backgrounded tab 的 displaced **不自动恢复**(`useAgentSocket.ts:383`),长跑可被"孤儿化"。
- **无完成通知**:`message_complete` 帧到达时**没有** PushNotification / 标题闪 / 声音 / toast。而且 `PushNotification` **就在 agent 全局 denylist 里**(`conversationService.ts:77-97` 的 `DEFAULT_DISALLOWED_TOOLS`,同列还有 `Cron*`/`Task{Create..}`/`RemoteTrigger`/`Monitor` 等任务管理类工具——agent 连"给自己排程/通知"的工具都被硬移除)。
- **没有 durable**:会话 state 是 agent 容器 `~/.claude/.../<sid>.jsonl`(C5,单一共享 FS),agent daemon 重启则在飞生成全丢(10min grace 也只在进程内存活,`liveTurnBuffers` 是易失内存)。**崩溃 = 从头**,不存在断点续跑。
- **长任务与人无关时的痛点(memory 已记)**:HITL 现状是"关掉 pipe → 权限没人批"——后端 pipe 一关,permission_request 没人裁决就卡死(01 §2.6 displacement + 重连续流逻辑的已知边界)。

一句话:**Scholay 今天只有"前台、同步、单轮、单实例"的交互 agent**。用户要的"每周一汇总我领域新 arXiv""跑完通知我"目前**一条都做不到**,而且即使做了,在 C2/C3(单实例押注)下也无法横向扩展。

---

## 3. 目标设计(建在已有 MySQL+Redis,不引 Temporal 集群)

总思路:**借 Hermes Kanban 的编排模型 + DBOS 的 DB 背书队列 + Goose `execution_mode` 统一 pipeline + Restate 异步 HITL**,全部落到我们已经在跑的 **MySQL + Redis** 上,**不引入 Temporal/Restate 集群那种独立 infra**(findings/B-scheduling 借鉴点 6 的明确取舍)。每次运行衔接 05 的 per-session sandbox(一 job 一隔离 cwd/容器),完成衔接 07 的 Agent Inbox。

### 3.1 DB 背书的任务表/队列(DBOS 模型 + Hermes Kanban schema)

新建 **migration 0033_agent_jobs**(下一个编号;遵守 CLAUDE.md 迁移铁律:`CREATE TABLE IF NOT EXISTS` + `0000_utils.sql` 的 `add_index_if_not_exists`,**绝不 DROP**)。两张表:

**`agent_jobs`**(任务定义 + 状态机,直接把 Hermes Kanban 落到我们栈):

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigint unsigned AUTO_INCREMENT PK | |
| `user_id` | bigint unsigned NOT NULL | 归属(无 FK,沿用 `agent_sessions` 服务层完整性约定,见 C21) |
| `feature_key` | varchar(64) | 复用 `agentbridge.FeatureSpec.Key`(smart_search/claw/…),决定 prompt/工具策略 |
| `kind` | enum(`interactive`/`background`/`scheduled`) | = Goose `execution_mode` 标志(见 §3.3) |
| `spec` | json | 任务体:`{prompt, picker_slug?, recipe?, params?}`;**排程时刻快照**(Goose 把 recipe 复制到 `scheduled_recipes` 的等价物——存进 DB 而非文件,源 prompt 改了不影响已排程 job) |
| `schedule` | varchar(64) NULL | cron(6 段,与 Goose 对齐;NULL=一次性) |
| `status` | enum(`triage`/`ready`/`running`/`blocked`/`done`/`failed`) | Hermes 状态机(我们去掉 `todo`/`archived`,archived 用软删/归档列) |
| `workspace` | enum(`scratch`/`dir`/`worktree`) | 衔接 05:`scratch`=完成即删(正是我们"删 session→清 cwd"的需求) |
| `idempotency_key` | varchar(128) NULL | 防重复创建(治 C6 的精神:用唯一约束兜并发) |
| `max_retries` | int unsigned DEFAULT 2 | Hermes `failure_limit` 默认 2;耗尽 → `failed` |
| `retry_count` | int unsigned DEFAULT 0 | |
| `scheduled_at` | datetime NULL | 下次应跑时刻(cron 计算出来 / 一次性的执行时刻) |
| `run_id` | varchar(64) NULL | 当前/最近一次运行;指向 `agent_sessions.agent_session_id`(让运行复用现有 session store,§3.3) |
| `worker_claim` | varchar(64) NULL | claim 它的实例/worker 标识 |
| `claim_expires_at` | datetime NULL | claim TTL,过期可被 reclaim(治 crashed worker) |
| `created_at`/`updated_at` | datetime | |

索引:`uk_idempotency(user_id, idempotency_key)`(NULL 不冲突,允许多 ad-hoc job)、`idx_due(status, scheduled_at)`(dispatcher 扫"到点且 ready/triage")、`idx_user_status(user_id, status)`(用户任务面查询)、`idx_claim(claim_expires_at)`(reclaim 扫)。

**`agent_job_events`**(append-only 审计,= Hermes `task_events`):

| 列 | 类型 |
|---|---|
| `id` bigint AUTO_INCREMENT PK(单调) | |
| `job_id` bigint(FK 语义,服务层) | |
| `run_id` varchar(64)(指针,关联到具体一次运行) | |
| `type` varchar(32)(`claimed`/`started`/`llm_call`/`tool_call`/`waiting_approval`/`resumed`/`progress`/`done`/`failed`/`reclaimed`) | |
| `payload` json | |
| `created_at` datetime | |

`agent_job_events` 既驱动**实时任务板**(前端轮询/订阅),又做**永久审计**(Hermes 原话:append-only 单调 id + run_id 指针)。**这正是 C15 缺的"服务端可查询的任务状态"**——前端不再只能靠前台 WS。

> 与现有表的关系:**job 是"如何/何时跑",session 是"跑出来的对话"**。`agent_jobs.run_id` → `agent_sessions.agent_session_id`,后台 job 跑出来的 transcript 仍走现有 jsonl session store(§3.3),不另起炉灶,也不破坏 01 §5.1 的归属机制。token 账本仍落 `llm_token_usage`(经 §3.6 配额)。

### 3.2 dispatcher(cron 驱动,~60s)

新增 `internal/agentjob/`(Repository→Service→Dispatcher),dispatcher 是一个 **`safego.Go` 起的 ticker goroutine,默认 60s**(Hermes/Goose 都是 60s),每 tick 做四件事(Hermes dispatcher 原文逐条对应):

1. **reclaim stale/crashed**:扫 `claim_expires_at < now() AND status='running'` → 释放 claim、`retry_count++`、回 `ready`(或 `failed` 若超 `max_retries`)。治"worker 进程没了但状态卡 running"。
2. **deps-done promote**:若 job 有父依赖(`agent_job_events`/未来 `job_links`),父全 `done` 才把 `triage → ready`(Hermes "promotes ready tasks")。MVP 可先不做依赖,只把"到点的一次性/cron job"直接置 ready。
3. **Redis 锁原子 claim**:`idx_due` 扫到 `ready AND scheduled_at<=now()` 的 job → 用 **Redis `SET claim:<job_id> <worker> NX EX <ttl>`** 原子抢占(= Hermes `BEGIN IMMEDIATE` 的等价物,但用 Redis SETNX——**这正好补上 C3 里"配额 reset lock 计划用 Redis SETNX 但未实现"的同一块缺失原语**,可一并实现并复用)。抢到 → DB 置 `running` + 写 `worker_claim`/`claim_expires_at`。
4. **拉起隔离 worker 跑**:衔接 **05 per-session sandbox**——一 job 一隔离 cwd(`scratch` workspace),Codex 的 "dedicated background worktree per run" 的我们栈实现。worker = 用 `agent.Client.CreateSession` 起一个新 session(fresh-agent-per-run,Goose/Hermes/Claude Routines 都这么做)→ 喂 `spec.prompt`(经 picker/前缀注入,与交互态同一套)→ 流式跑完 → 写 `agent_job_events`。

**横向扩展(治 C2/C3)**:dispatcher 的 claim 走 Redis SETNX,**多个后端实例可同时跑 dispatcher 而不会双跑同一 job**——这是 job 层面对 C3"单实例横向扩展失效"的局部破解(交互态 WS 的 displacement C2 仍需 Redis 锁单独解,见 02/03 维度;但**后台任务这条线可以先做成多实例安全的**,因为它本就无 WS pipe)。

### 3.3 交互/后台同 pipeline(Goose #4389 的 `execution_mode`)

**铁律**:后台 job **不另起一套执行代码路径**,而是复用交互态的同一 pipeline,只多一个 `kind=background` 标志(= Goose `execution_mode=background`,findings/B-goose/B-scheduling 借鉴点 1)。理由是 Goose 踩过的坑 **#3882「Background Scheduled Jobs Run in Chat Mode, Blocking Tool Execution」**——交互/后台共用代码不当时,background job 跑成 chat mode 阻塞工具执行。

落地:后台 job 的运行**落进同一套 session store**(`agent_sessions` + jsonl),产出一个**可被既有 API 检视的正常 session**(Goose #4389:"a normal session file with `schedule_id` metadata")。具体:

- worker 调 `agent.Client.CreateSession` 拿 sid → 写 `agent_sessions`(owner 两列可填 `('job', job_id)`,复用 01 §5.1 的 `uk_owner` 机制,一 job 一 session),`agent_jobs.run_id = sid`。
- 跑完后,用户**可以像看任何 session 一样**用 `PaginateSessionMessages`/Inbox 回看这个后台 job 的完整 transcript(治 C15 的"孤儿化"——任务不再是黑盒)。
- **不需要 WS pipe**:后台 job 没有前台用户 WS。这条路径**复用 peerreview 的 `ServerSideChatStreaming`**(01 §2.8,后端做 WS *客户端*、后台 goroutine 驱动)——peerreview 已经证明这条路能跑,且**正好暴露了 C10/C11**(SessionOptions 不覆盖 server-side、配额钩子无 server-side 等价)。所以做 agentjob 时**应该顺手把 server-side 路径的 SessionOptions/配额钩子抽成 bridge 一等公民**,而不是第三次手抄(见 §3.6 + 改动触点)。

> **execution_mode 显式校验 approval**:findings 局限项明确警告——每种 execution mode 必须显式校验 approval/permission mode(Goose #3882 + Codex 都打过这个补丁)。后台 job 无前台用户在线 → permission_request **不能** auto-approve 给一个没人看的会话乱跑;应走 §3.5 的异步 HITL(挂起等审批)或一个明确的 "background job 默认拒危险工具" 策略(衔接 08 安全维度的工具门)。

### 3.4 durable:可 journaled 的最小执行单元

目标:**崩溃断点续跑而非从头**(findings 五框架收敛的 "die at step 47, resume at step 48")。我们**不**引 Temporal/Restate,而是用 **DBOS 思路:把每次 LLM/tool 调用 checkpoint 到 MySQL**(`agent_job_events` 的 `llm_call`/`tool_call` 行就是 checkpoint),崩溃后 dispatcher reclaim 时**从最后一个成功 event 之后续跑**。

- **最小单元**:每个 LLM 调用 / 每个 tool 调用前写 `agent_job_events(type=llm_call/tool_call, run_id, payload=入参)`,成功后写结果。这是 Temporal Activity / Restate `ctx.run` / DBOS `@step` 的我们栈等价物(findings 借鉴点 4)。
- **自动重试上游抖动**:对 **Minicod / 上游模型限流**,在这个粒度做有界重试(对接现有 `circuitbreaker` + 上游 429/5xx 退避)——直接对治 findings 反复点名的"Minicod/Anthropic 上游抖动"。
- **重要取舍**:agent 容器是黑盒、jsonl 自管(01 §1/§3.5),backend **读不到** CLI 内部 query loop 的逐步 state。所以**我们能 journal 的粒度是"backend 看得见的边界"**——即 `CreateSession`→喂消息→收 `message_complete`/`tool_call` 帧这一层,**不是** CLI query loop 内部的每个 model.callModel。换句话说:**断点续跑的最小单元是"一轮 turn / 一次 tool 裁决",不是 CLI 内部的 token 级**。这对长学术任务(多论文分析、文献综述,每篇一轮)已经够用:崩溃后从"已完成第 N 篇"续到第 N+1 篇,而不是重跑全部。**这是黑盒 agent 架构的硬约束**,要在文档里讲清楚,别承诺做不到的 token 级 durable。

### 3.5 异步 HITL(挂起即释放算力)

这是本维度对 Scholay **最有价值**的一条(findings/B-scheduling 借鉴点 5),且**直接治我们 memory 里记的"关 pipe→权限没人批"老痛点**(01 §2.6 边界 + agent-chat-reentry-and-resync 记忆)。

把审批做成**挂起的 durable promise**(Restate Awakeables / AgentKit `waitForEvent` 的我们栈实现):

- 后台 job 跑到一个需要人批的点(危险 tool、需澄清、需用户选论文)→ 写 `agent_job_events(type=waiting_approval, payload={prompt, options, awaitable_id})` → job 置 `blocked` → **释放 goroutine,关掉 worker 的 agent 连接**(不再钉住 goroutine/WS)。
- 用户几分钟到几小时后,经 **HTTP 事件**(`POST /api/v1/user/agent-jobs/:id/resume` 带 `awaitable_id + decision`)恢复 → dispatcher 下个 tick 看到 `blocked→ready` + 已 resolve 的 awaitable → reclaim 续跑(从 `waiting_approval` event 之后)。
- **对比现状的根本改善**:现在审批必须有人在前台 WS 在线(关 pipe 就没人批);新模型下**审批与运行解耦**,用户离线几小时回来点一下即可。awaitable 用 Redis(`SET awaitable:<id> ...`)+ `agent_job_events` 双写(Redis 快路 + MySQL 持久),衔接 07 的 HumanInterrupt 审批卡 / Agent Inbox。

### 3.6 完成通知 + 多触发 + 配额

**完成通知(运行解耦)**——治 C15 的核心诉求。**不依赖前台 WS 在线**:job `done`/`failed`/`blocked` → 写 `agent_job_events` → **推到我们已有的 message hub**:

- `internal/message`(`user_messages` 表)发一条站内信(复用 feedback 已验证的 message adapter 模式,见 feedback-feature 记忆)——离线用户回来能看到。
- `internal/websocket`(通用 WS hub,`hub.go`,本就用于站内信推送)→ 在线用户实时收到 toast/红点。
- 进 **review-queue/inbox**(Codex 模式:有发现才进、否则归档),衔接 **07 Agent Inbox**。这比"依赖实时 WS"稳得多(findings 借鉴点 8/12)。

**多触发**(Claude Routines 多触发模型,findings 借鉴点 9):
- **cron**:`schedule` 列(6 段);dispatcher `idx_due` 扫到点。
- **自然语言一次性**:"明天上午跑一次 X" → 后端解析成 `kind=scheduled, schedule=NULL, scheduled_at=<解析时刻>`。
- **API**:`POST /api/v1/user/agent-jobs`(等价 Routines `/fire`)。
- **saved-search 事件**:"当某条 saved search 有新 arXiv 命中时跑分析"——saved-search 模块发事件 → 建 `kind=background` job(学术场景的杀手锏)。
- **(可选)agent 给自己排程**:Hermes/Goose 的 `manage_schedule`/`cronjob` 工具——但 **`Cron*`/`PushNotification` 现在在 denylist(C15/01 §7.1)**,要开必须门控在配额钩子之后(findings 借鉴点 13 + Goose `scheduler_service` 门控),**MVP 不做**(安全优先)。

**配额(每用户限速)**——治 findings 局限项点名的"云端 routine 在压力下撞配额"+ 治 C7/C8/C11:
- job 入队前 + 每次 worker 起 run 前,过 `vipChecker.CheckDailyQuota`(01 §5.3,`internal/vip`)——**复用交互态同一个 `PreUserMessage` 等价钩子**,而不是 peerreview 那样手放(C11)。
- 这要求把 §3.3 提到的"server-side 配额钩子抽成 bridge 一等公民"——即给 `agentbridge` 加一个 **server-side run 的 `RunBackgroundTurn(ctx, spec, sessionID, content)` 入口**,内部走 `preUserMessageChain` + `OnMessageComplete`,**一举消掉 C10/C11/C19**(三 feature hooks 逐字重复 + server-side 重传 SessionOptions + 手放配额)。
- 注意 C8 fail-open:后台 job 是非交互的,**事故期可以更激进地 fail-closed**(Redis 挂 → 后台 job 暂缓,而非放行)——比交互态更安全的取舍。

---

## 4. 安全:对被存储/被调度的任务体做注入扫描

**新攻击面**:job 的 `spec.prompt`/`recipe` 是**被存储、稍后由系统自动执行**的——攻击者可以存一个 cron job,其 prompt 含 prompt-injection,几天后无人值守地跑(比交互态更危险,因为没人盯着)。

对策(Hermes **Promptware Defense** + Goose **recipe 注入安全闸**,findings 已核实):**在执行前对任务体做 prompt-injection 扫描**——

- 入队时 + dispatcher claim 后执行前,扫 `spec.prompt`/`recipe`:隐藏 unicode、伪造的指令边界、已知 Brainworm/C2 注入模式(Hermes ~15 个模式)。衔接 **08 安全维度**。
- 这条对 Scholay **当前完全缺失**(findings/B-hermes 借鉴点 7 + 局限明确点名)。
- 连带治 **C9(prompt 注入前缀 in-band)**:后台 job 的 prompt 同样经 `buildInjectionPrefix` 注入(01 §2.7),**同样可被伪造结束标记解除约束**——而且后台无人监督,危害更大。所以 job spec 必须**先扫描再注入**,且长期看应推动 C9 从 in-band 改成真 system role(衔接 09/记忆维度的 frozen-snapshot 提议)。

---

## 5. 分期选项 + 取舍 + 改动触点

### MVP(便宜的渐进):`agent_jobs` 表 + cron dispatcher + 站内信通知,fresh-agent-per-run

**做什么**:migration 0033(`agent_jobs` + `agent_job_events`)+ `internal/agentjob/`(repo/service/dispatcher,60s ticker)+ Redis SETNX claim + worker = `CreateSession` 喂 prompt 跑完(fresh per run,**无 durable、无 HITL**)+ 完成推 `user_messages` + 4 个 HTTP 路由(create/list/cancel/detail)+ 前端简单任务列表。触发先支持 **cron + 一次性 + API**。

**取舍**:崩溃丢当前 run(下次 cron 再跑,可接受——学术汇总类任务幂等);后台 job 遇到需审批的工具 → 直接拒(不挂起);**横向扩展上后台线已安全**(Redis SETNX),但交互态 WS 仍单实例(C2 未解)。**这一档就已经端到端满足用户"每周一汇总 + 跑完通知我"的明确诉求**,且不碰 agent 容器、不碰交互态代码路径。

**改动触点**:
- 新建 `docker/mysql/migrations/0033_agent_jobs_fields.sql` + `0033_agent_jobs_indexes.sql`(下一个编号,现状最新 0032)。
- 新建 `backend/internal/agentjob/{model,repository,service,dispatcher,handler}.go`。
- `backend/cmd/server/bootstrap.go`:起 dispatcher goroutine(`safego.Go`)+ 注入 `vipChecker`/`message`/`agent.Client`。
- `backend/cmd/server/routes_user.go`:挂 `POST/GET /api/v1/user/agent-jobs` 等。
- 复用 `internal/message`(`user_messages`)+ `internal/websocket`(`hub.go`)发通知。
- 复用 `internal/vip/quota.go` 配额、`internal/agent/client.go` 起 session。
- 前端:新建一个任务列表页(衔接 07 Inbox)。

### 进阶(中等):durable journaling + 异步 HITL

**做什么**:在 MVP 上加 §3.4(`agent_job_events` 的 llm_call/tool_call checkpoint + reclaim 续跑 + 上游抖动有界重试)+ §3.5(awaitable 挂起审批,`blocked` 状态 + `/resume` 端点 + 释放 goroutine)。把 §3.6 的 **`agentbridge.RunBackgroundTurn`** 抽出来,**顺手消 C10/C11/C19**。

**取舍**:复杂度上一个台阶(checkpoint 粒度受黑盒约束,§3.4 已说明只能到 turn 级);但换来"长学术任务崩溃不白跑"+"审批不占算力/不靠前台在线"——后者直接治记忆里记的老痛点。**建议把 `RunBackgroundTurn` 抽取作为这一档的必做项**,因为它同时清掉三个妥协(C10/C11/C19),ROI 高。

**改动触点**(增量):
- `backend/internal/agentbridge/`:新增 `RunBackgroundTurn`(server-side run 一等公民,内走 `preUserMessageChain`+`OnMessageComplete`+`SessionOptions`);peerreview 改为复用它(消 C10/C11)。
- `backend/internal/agentbridge/hooks.go`:抽 `StandardHooks(feature, action, vip)`(消 C19 逐字重复)。
- `internal/agentjob/dispatcher.go`:加 reclaim-续跑逻辑、awaitable resolve。
- Redis:`claim:<job>` / `awaitable:<id>` 键(与 §3.2 复用同一 SETNX 原语,顺带补 C3 的 reset lock 缺口)。
- `routes_user.go`:`POST /agent-jobs/:id/resume`。

### 完全(彻底):Kanban 多 agent 依赖图

**做什么**:加 `job_links`(父→子依赖,= Hermes `task_links`)+ dispatcher 的 deps-done promote 真正生效 + 多 worker 扇出(像 Goose 把并发封顶到 10,findings/B-goose 借鉴点 8)+ workspace `worktree`/`dir`(衔接 05)+ 完整 Kanban 任务板 UI(triage/ready/running/blocked/done 看板,衔接 07)。**一次补齐"长跑/后台/定时 + 多 agent"**(findings/B-hermes 借鉴点 3 的核心论断)。

**取舍**:这是 north-star 的完全体,但**重**——Hermes 自己警告"Kanban 把每个任务拉起为完整 OS 进程,稳健但资源重;成千上万并发 Web 用户需加池/配额层"(findings/B-hermes 局限)。我们已有 vip 配额可做这个池层。**只在确有多步学术 workflow 需求(如"综述 = 检索→筛选→并行精读 20 篇→汇总"依赖图)时才上**,否则 MVP+进阶已覆盖 90% 诉求。**不要为了架构完整性提前做 Kanban UI**。

**改动触点**(增量):`0034_job_links`、dispatcher 扇出+并发封顶、`internal/agentjob` workspace 管理(衔接 05 sandbox)、前端 Kanban 看板(衔接 07)。

---

## 摘要(本维度对 Scholay 最重要的 3-5 条建议)

1. **建 `agent_jobs` + `agent_job_events` 两张表 + 60s cron dispatcher(Redis SETNX 原子 claim),这是 C15 的直接解,也是后台任务唯一缺的地基。** 触点:新 migration 0033 + `backend/internal/agentjob/`(repo/service/dispatcher/handler)+ `bootstrap.go` 起 ticker。Redis SETNX claim 顺带补上 C3 里"配额 reset lock 计划用但未实现"的同一块缺失原语,让后台任务线先做到多实例安全。
2. **后台 job 复用交互态同一 pipeline(Goose `execution_mode`),落进同一 `agent_sessions`+jsonl session store,产出可回看的正常 session。** 治 C15 的"孤儿化"——任务不再是黑盒。复用 peerreview 已验证的 `ServerSideChatStreaming`(01 §2.8),并以此为由把 server-side 的 SessionOptions/配额钩子抽成 `agentbridge.RunBackgroundTurn` 一等公民,**一举消掉 C10/C11/C19**。触点:`agentbridge/{bridge,hooks}.go` + peerreview 改用它。
3. **完成通知走运行解耦——推到已有 message hub(`user_messages`)+ websocket hub,并进 review-queue/inbox(衔接 07)。** 不依赖前台 WS 在线,这是 C15"无完成通知"的正解。触点:复用 `internal/message` + `internal/websocket/hub.go`,**零新基础设施**。
4. **异步 HITL 做成挂起的 durable promise(awaitable):审批点 → job 置 `blocked` + 释放 goroutine,用户几小时后经 HTTP `/resume` 恢复。** 直接治记忆里记的"关 pipe→权限没人批"老痛点(01 §2.6),把审批与运行/前台在线解耦。触点:`internal/agentjob` 的 `blocked` 状态 + `/resume` 端点 + Redis `awaitable:<id>` 键(衔接 07 HumanInterrupt 审批卡)。
5. **对被存储/被调度的任务体在执行前做 prompt-injection 扫描(Hermes Promptware)——这是后台任务带来的新攻击面,且比交互态更危险(无人值守)。** 连带提醒 C9(in-band 注入前缀同样可被后台 job 伪造解除),长期应推 C9 转真 system role。触点:`internal/agentjob` 入队+执行前的扫描钩子,衔接 08 安全维度。**取舍铁律:`Cron*`/`PushNotification` 仍在 denylist,MVP 不开"agent 给自己排程",安全优先。**
