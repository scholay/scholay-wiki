# Scheduled / background / async agent tasks
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

本维度面向我们的目标系统(多用户 Web 学术 agent 平台:agent 本体是 Claude-Code 风格的 desktop CLI,跑在一个 HTTP+WS daemon 里,每用户一份 jsonl session 落在同一块共享 FS 上,目前**没有**隔离 / 长期记忆 / 调度能力)。

覆盖的问题域:在 cron 上跑 agent、长时间异步任务、durable execution(崩溃后断点续跑)、任务队列、异步 HITL(人类介入)、可恢复性、完成通知(finish-notification)。

调研横跨两类对象:
- **产品级调度器**:Goose Scheduler(Block)、Claude Code Routines(Anthropic)、OpenAI Codex Automations。
- **durable execution 底座**:Temporal、Restate、DBOS、Inngest AgentKit。

一个贯穿全程的结论:**调度本身不解决长期记忆**。所有"每次起新 agent"的方案天然没有跨次运行的记忆;记忆是一个正交的层(见局限)。

## 关键架构决策

下面是各方案最值得记住的架构取舍。

**Goose Scheduler(Block)**
- `Scheduler` struct 包了 `tokio-cron-scheduler`,提供持久化 / session 管理 / 取消支持;任务持久化到数据目录下的 `schedule.json`。(已核实:deepwiki)
- **6 段 cron**(`second minute hour day month weekday`);老的 5 段表达式会自动在前面补 `0`(秒)做兼容。(已核实:deepwiki)
- **recipes 会被复制到 `scheduled_recipes` 目录**,以保证即使原始文件被移动/删除,调度仍可用——相当于在排程时刻对任务定义做快照。(已核实:deepwiki)
- **每次 cron 触发起一个全新 Agent**——legacy 与 Temporal 两种 backend 都是 "spins up a fresh Agent per run"。(已核实:discussion #4389 的问题陈述原文;注意 deepwiki 页面本身**未**明说这一点,该结论来自 #4389)
- 存在**两种 scheduler backend:legacy(tokio-cron)与 Temporal**。(已核实:#4389 原文 "The scheduler (legacy and Temporal)…")

**Claude Code Routines(Anthropic)**
- 定位为"agent 版 cron":把一套 Claude Code 配置(prompt + repo 上下文 + connectors)存下来,在 **Anthropic 托管基础设施**上按计划/触发自动跑,不依赖本机开机。(已核实:InfoQ + VentureBeat)
- **2026-04-14 以 research preview(研究预览)形式发布**,与重做的 Claude Code 桌面 app 同期。(已核实:VentureBeat / 9to5Mac;**更正**:DRAFT 写 "GA'd April/May 2026" 有误——是 research preview,不是 GA)
- API 触发端点 `/fire` 挂在 `experimental-cc-routine-2026-04-01` beta header 下,格式/限流/token 语义在预览期可能变。(已核实:搜索结果引述官方说明)
- [UNVERIFIED] 具体在哪些订阅档(Pro/Max/Team/Enterprise)开放——InfoQ 主源未列;仅二手博客提及,降级。

**OpenAI Codex Automations**
- Automations = 在后台按计划跑 Codex 任务。对 Git 仓库,**可选在专用 background worktree 上跑,把改动与未完成的本地工作隔离**——这是对"共享 FS"问题的具体答案:每次运行有自己的 cwd。(已核实:OpenAI 官方 Codex docs)
- 任务完成后结果进 **review queue / inbox(Triage)**,而不是实时推送;有发现才进 inbox,没东西报告就自动归档。(已核实:OpenAI 官方 docs)

**Temporal**(durable execution 底座)
- 记录完整 **Event History**:Workflow 里每次代码执行、每次 Activity 调用/返回都记;应用挂掉后重启时"state will be recreated and processing will pick up where it left off"——即"死在第 47 步,从第 48 步续",而不是从头。(已核实:Temporal 官方 blog)
- **Workflow = 编排代码**,agent state 直接放在 Workflow 代码的普通变量里(同一模型既能表达固定链路,也能表达动态 agentic loop)。(已核实)
- **Activity = 所有外部调用,LLM 调用就是一个 Activity**,网络抖动 / 被限流时 Activity 自动重试直到成功。(已核实)
- **determinism 约束**:Workflow 代码必须确定性可重放(非确定的 LLM/IO 必须放进 Activity)。[UNVERIFIED-by-this-source] Temporal blog 本身没明说确定性约束,但这是 Temporal 众所周知的核心约束(见 devstarsj 对比文)。

**Restate**(低运维 durable execution)
- 通过 **journaling**:每个 `ctx.run()` 记录结果,重放时不重复执行。
- **Virtual Objects** 提供按 key 隔离——"每个 userId 拿到自己隔离的 state",对我们的"每用户隔离"诉求直接对口。(来源:devstarsj 对比文,二手但具体)
- 运维"低":可作为 **sidecar 或嵌入式库**跑,原生 HTTP/gRPC。(来源:devstarsj)

**DBOS**(Postgres 背书的 durable execution + 队列)
- 把 workflow 状态**存在 Postgres** 里(checkpoint 到 Postgres),而非纯 event-history 重放。(部分核实:DBOS blog 说 "agent runs are automatically checkpointed to Postgres";"在应用层存状态、不重放 event history" 的精确对比来自 devstarsj 二手文)
- workflow 崩溃后自动恢复、按原逻辑续跑。(已核实:DBOS blog)
- **数据库背书的持久队列**:队列持久化到系统库,所有进程/客户端可见;支持**并发上限(worker 级 + 全局)、速率限制、超时、优先级(同优先级 FIFO)**;无需独立 message broker。(已核实:DBOS 官方 queue tutorial)
  - [UNVERIFIED] 队列层的"重试"在该 tutorial 中未提及;"Celery/BullMQ 替代品"是二手框架措辞,官方文档未点名。

**Inngest AgentKit**(durable agent 框架)
- Agents 组成 **Networks**,由 **Router** 决定下一个跑哪个 Agent,共享 **State**。(来源:agentkit 官网)

## 编排与子 agent

- **Goose #4389 重设计**提出统一编排:让 **chat、scheduler、dynamic tasks、sub-recipes 全走同一条执行 pipeline**——一个夜间 recipe "executes using the same pipeline as chat, just with `execution_mode=background`",并落成一个带 `schedule_id` 元数据的**正常 session 文件**,可用既有 API 检视,而不是独立进程/独立代码路径。(已核实:#4389 原文)
- **AgentKit** 用 Router + Network 做多 agent 编排,是"systems of agents"的代表;HITL 用 `step.waitForEvent()` 把 tool 调用挂起(见调度与异步)。(已核实)
- **Codex Automations** 把指令 + 可选 skills 组合后在后台跑,多 worktree 线程汇入同一个 review queue。(已核实)

## 记忆

- **核心事实:每次起新 agent = 跨次运行无长期记忆。** Goose 现状正是如此(legacy 与 Temporal backend 都 "fresh Agent per run"),这也是 #4389 要重做的核心痛点。调度**不会**自动带来长期记忆——记忆是正交的另一层。(已核实:#4389)
- durable execution 框架(Temporal/Restate/DBOS)保留的是**单次长任务的执行 state**(让崩溃可续),不等于跨任务的语义记忆;但它们确实让"一次长运行内的上下文"可靠地存活下来(Temporal 变量、Restate 持久 state、DBOS Postgres 检查点)。

## 多用户与隔离

- **#4389 的 `AgentManager`:`session_id -> Agent`,一 session 一个隔离 agent**(各自的 ExtensionManager/ToolMonitor/channels,避免互相串扰)。现状是"server 里共享一个 Agent,导致 sessions interfere with each other"。这正对应我们缺的每用户隔离,能直接映射到我们的 `agent_sessions` 表。(已核实:#4389)
- **Restate Virtual Objects**:按 key(如 userId)隔离 state——多租户的天然抓手。(来源:devstarsj)
- **Codex Automations 的专用 worktree**:每次后台运行有独立 cwd,是对"单块共享 FS"问题的具体文件系统隔离答案。(已核实:OpenAI docs)
- **Claude Routines**:每个触发在托管云里跑;[UNVERIFIED] "每个 GitHub 事件 = 自己独立 session" 的精确说法 InfoQ 主源未明说(主源只说能反复无人值守地跑),按主源降级。

## 扩展性

- **Temporal worker** 把热 workflow 留在内存、淘汰空闲的,被淘汰的按需**重放 Event History 重建**,从而扛大量并发 workflow。(已核实)
- **DBOS** 用现有 Postgres 做队列与状态,**零新增基础设施**;队列支持并发/速率/优先级配置,且可运行时改配置不用重部署。(已核实)
- **Restate** 以 sidecar/嵌入库形态运行,运维成本低。(来源:devstarsj)
- **Temporal** 反向:需要独立集群,运维成本"高"。(来源:devstarsj / Temporal blog 也承认是独立 infra)

## 调度与异步

- **cron / 计划触发**:Goose(6 段 cron + 自身平台工具 `manage_schedule` 让 agent 给自己排程,动作含 add/list/remove/pause/unpause/update/run_now/sessions/kill,且活跃运行持 `CancellationToken` 防重叠)。(已核实:deepwiki + #4389)
- **多触发面**:Claude Routines 支持 schedule / API(`/fire` 带 bearer)/ GitHub webhook 三类触发。(已核实:InfoQ)
- **durable timer / 长睡眠**:Temporal Schedules + Cron Jobs,`sleep` 可跨月跨年;Restate 有 durable timer(sleep/schedule/wait-for-event)。(已核实 Temporal blog 的 worker 模型 + 二手 timer 描述)
- **异步 HITL — 挂起即释放算力**(本维度对我们最有价值的模式):
  - **Restate Awakeables**:agent 建一个 durable promise 拿到唯一 ID,发给审批人(Slack/email/dashboard),然后**挂起、释放算力**;审批人几分钟到几天后用 HTTP `…/awakeables/<id>/resolve` 解决,Restate 重新调起、重放 journal、恢复已解决的 promise 继续跑。官方原话强调 **"On serverless infrastructure, you pay nothing during the wait" / "No idle resources"**(**更正**:DRAFT 写的 "you pay for active work, not wait time" 并非官方原句,已替换为官方措辞)。(已核实:Restate 官方 HITL docs)
  - **AgentKit `step.waitForEvent()`**:tool 调用挂起,等匹配事件到达自动恢复,挂起期间不耗算力;支持 `timeout`(如 `'4h'`)与 `match`(如 `'data.ticketId'`)。Network 必须包在一个携带关联 id(如 ticketId)的 Inngest function 里,响应才能 correlate 回这次运行。(已核实:AgentKit 官方 docs,含代码示例)

```javascript
const developerResponse = await step.waitForEvent("developer.response", {
  event: "app/support.ticket.developer-response",
  timeout: "4h",
  match: "data.ticketId",
});
```

- **完成通知 / 异步结果(跨方案通用模式)**:
  - **Webhook on completion**:任务完成时向注册 URL 触发 webhook,接收端验签、回 200、入队、异步做重活。(来源:CallSphere / BuildMVPfast,二手实践文)
  - **Async request-reply**:入队后立即返回(202 + 状态 URL / 轮询),完成时通知。(已核实:Azure 架构模式官方文档)
  - **实时推到在线客户端**:SSE(轻量单向 HTTP)或 WebSocket 通知调用方。(已核实:Azure 文档)
  - **Codex** 走的是"不实时推、落 review queue/inbox 异步检视"。(已核实)
  - [UNVERIFIED] Claude Routines 与 Goose 的具体完成通知机制,主源未详述——按通用 webhook/queue/push 模式自行设计。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **交互态与调度态走同一条 pipeline,用 `execution_mode` 标志区分。** Goose #4389:调度 recipe "the same pipeline as chat, just with `execution_mode=background`",产出一个可被既有 API 检视的**正常 session**,而非独立进程。这能避开"后台 job 跑在 chat mode"那个 bug(#3882,标题 "Background Scheduled Jobs Run in Chat Mode, Blocking Tool Execution")。我们的 WS daemon + jsonl session 可以增加一个 background mode,写进同一套 session store。
2. **`AgentManager: session_id -> Agent`,一 session 一隔离 agent**(各自 tool/extension manager/channels)。正对我们缺的每用户隔离,可直接映射到 `agent_sessions` 表。
3. **以 durable execution 为底座,让崩溃断点续跑而非从头。** 五个框架都收敛到 "die at step 47, resume at step 48"。我们的长学术任务(多论文分析、文献综述)目前 daemon 重启就全丢。
4. **把 LLM/tool 调用做成可持久化的最小单元**(Temporal Activity / Restate `ctx.run` / DBOS `@step`),在该粒度上对限流/网络失败自动重试——直接对治 Minicod / Anthropic 上游抖动。
5. **异步 HITL 与等待要"挂起即释放算力",不要钉住进程/WS。** AgentKit `step.waitForEvent` 与 Restate awakeables 都能零算力挂起、几天后靠外部 HTTP 事件恢复。对多用户 Web 平台意义重大:后台学术 agent 可以等用户审批/澄清而不占 goroutine 或 WS 连接(正好治我们 memory 里记的"关掉 pipe → 权限没人批"的重连痛点)。
6. **DBOS 式 DB 背书的持久队列——不引入新 broker。** 并发上限 / 速率限制 / 优先级 / 超时都在你已经在跑的库上(对 DBOS 是 Postgres)。我们已有 MySQL + Redis,一张 DB job 表即可,省掉 Temporal 集群那种独立 infra。
7. **每次运行的文件系统隔离 = 一 job 一专用 worktree。** Codex Automations 在 "dedicated background worktree" 上跑,是对"单块共享 FS"问题的具体答案:每次调度/后台运行有自己的 cwd,而非共享 session 目录。
8. **结果落 review queue/inbox,不强推实时。** Codex 让调度结果进 inbox/Triage 异步检视。对完成时不在线的用户,收件箱式 review queue 比依赖实时 WS 更稳。
9. **一个 routine 多触发面:cron + 自然语言一次性 + API + repo/webhook 事件。** Claude Routines 的多触发模型。学术场景:"每周一汇总我领域的新 arXiv""当某条 saved search 有新命中时跑分析"。
10. **任务定义(recipe/prompt spec)与触发器分开持久化**(Goose 把 recipe 复制到 `scheduled_recipes` 以防源文件被删)——排程时刻对任务定义做快照。
11. **每个 schedule 一个取消令牌 + 防重叠保护**(`schedule_id -> CancellationToken`,外加 `kill`/`run_now`/`pause`)。
12. **完成通知 = webhook/队列 + push,和运行本身解耦。** 完成时触发事件 → 推到我们既有的 message/WS hub(`user_messages` + websocket hub 正好合适),运行中再发 progress 事件。
13. **agent 能给自己排程**(`manage_schedule` 式工具)——例如"把这个设成每周重跑"。

## 局限

- **fresh-agent-per-run = 跨次运行无长期记忆**(Goose 的核心缺陷,正是他们要重做的)。调度**不**等于长期记忆,后者是正交的层,需另建。(已核实:deepwiki + #4389)
- **Temporal 运维重**(独立集群)且 **workflow 代码有确定性约束**(非确定的 LLM/IO 不能放在 workflow 体内,必须做成 Activity)。(Temporal blog 证实 Activity 模型;确定性约束本身见 devstarsj 对比文。)
- **DBOS 用编排丰富度换简单**——复杂多 agent 编排上不如 Temporal 原语丰富。(来源:agentmarketcap,二手框架判断)
- **交互/后台共用代码不当时,background-mode bug 很常见**:Goose 后台 job 跑成 chat mode(#3882);Codex 也曾打补丁让 automations 尊重所选 approval mode(Releasebot)。务必对每种 execution mode 显式校验 approval/permission mode。
- **云端 routine 在压力下会撞配额/可靠性天花板**(社区对 Claude Routines 的 reliability / usage limits 有担忧)。多用户调度需要按用户限速/配额——我们现有的 `RedisDailyCap` 钩子就是合适的接缝。
- **本机调度器**(Goose legacy、早期 Codex)要求宿主机常开;多用户 Web 平台必须服务端调度。
- **完成通知机制**:Claude Routines 与 Goose 的具体通知机制主源未详述 [UNVERIFIED],按通用 webhook/queue/push 模式自行设计。
- 多处"运维高/低""丰富度"等横向对比来自 devstarsj、agentmarketcap 等**二手对比文**,引用时已标注;其结论方向与各项目官方文档一致,但精确措辞以官方为准。

## Sources

- https://deepwiki.com/block/goose/4.1.5-scheduler-and-recurring-tasks
- https://github.com/block/goose/discussions/4389
- https://github.com/block/goose/issues/3882
- https://www.infoq.com/news/2026/05/anthropic-routines-claude/
- https://venturebeat.com/orchestration/we-tested-anthropics-redesigned-claude-code-desktop-app-and-routines-heres-what-enterprises-should-know
- https://9to5mac.com/2026/04/14/anthropic-adds-repeatable-routines-feature-to-claude-code-heres-how-it-works/
- https://developers.openai.com/codex/app/automations
- https://developers.openai.com/codex/app/worktrees
- https://openai.com/index/introducing-the-codex-app/
- https://intuitionlabs.ai/articles/openai-codex-app-ai-coding-agents
- https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai
- https://docs.temporal.io/cron-job
- https://docs.restate.dev/ai/patterns/human-in-the-loop
- https://docs.restate.dev
- https://www.dbos.dev/blog/dbos-new-features-march-2026
- https://docs.dbos.dev/python/tutorials/queue-tutorial
- https://dbos.dev/
- https://devstarsj.github.io/2026/04/03/durable-execution-temporal-restate-dbos-distributed-workflows-2026/
- https://agentmarketcap.ai/blog/2026/04/10/durable-agent-execution-production-temporal-modal-event-sourced
- https://agentkit.inngest.com/advanced-patterns/human-in-the-loop
- https://agentkit.inngest.com/
- https://callsphere.ai/blog/webhook-integration-ai-agents-event-driven
- https://www.buildmvpfast.com/blog/webhook-driven-agent-architecture-event-based-triggers-autonomous-ai-workflows-2026
- https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply
- https://developer.devrev.ai/beta/guides/agents-async-api
