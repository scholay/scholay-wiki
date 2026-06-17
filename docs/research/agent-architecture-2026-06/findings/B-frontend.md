# Frontend / UX for agent chat & async work
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

本维度聚焦"把 CLI 化的 agent 守护进程换成 per-user Web UX"所需的前端/UX 架构:流式传输(SSE vs WebSocket)、可恢复流(resumable streams)、agent↔UI 标准事件协议(AG-UI)、三大前端框架(Vercel AI SDK / assistant-ui / CopilotKit)、生成式 UI(generative UI)、多线程切换、Agent Inbox 与后台任务通知、人在回路(HITL)审批/中断 UI、工具调用/diff/artifact 渲染、超长会话虚拟化。

核心结论:行业已**收敛到「SSE-over-HTTP 默认 + 单独 POST 接收用户输入」**;**resumable streams(把生成与投递解耦到 Redis pub/sub 缓冲)** 是对我们当前"jsonl 落共享盘、无法续流"短板 ROI 最高的一招;**AG-UI 事件词汇表**是最易直接借用的协议;**LangGraph `interrupt()` + Agent Inbox `HumanInterrupt`/`HumanResponse`** 是 HITL/异步审批的成熟范式。

> 注意:本份是面向"对话/异步前端 UX"的横向技术对标,不是对某个开源 agent 的逐仓审计。所有关键事实已对一手源(官方 docs / GitHub)核验,见文末 Sources。

## 关键架构决策

### 1. 流式传输:SSE vs WebSocket —— 已收敛到 SSE

行业现状 = **SSE-over-HTTP 为默认,只有真正需要客户端→服务端「流中途推送」时才上 WebSocket**。

- **Vercel AI SDK 5 于 2025-07-31 发布,将 wire format 切换为 SSE** 作为标准的流式数据协议。官方博客原话:"The AI SDK now uses Server-Sent Events (SSE) as its standard for streaming data from the server to the client." 给出的理由是:**原生浏览器兼容、用标准开发者工具更易调试、为未来演进提供更简洁的协议基础**。
  - ⚠️ 已修正:草稿中"keep-alive via ping / reconnect capability / better cache handling"这三条具体理由**未出现在 AI SDK 5 发布博客**中,系误植,已删除。SSE 本身具备浏览器原生自动重连等特性属实,但不应挂到这篇博客名下。
  - 默认流程:client `POST /api/chat` → server 用 SSE 流响应(经 `DefaultChatTransport`)。
- **AG-UI 不强制传输方式(transport-agnostic)**,原文:"AG-UI doesn't mandate how events are delivered, supporting various transport mechanisms including Server-Sent Events (SSE), webhooks, WebSockets, and more." SSE 作为面向广泛兼容的文本流是事实上的可达 canonical transport;文档亦提及一种"HTTP binary protocol"高性能/省空间的自定义传输。事件均为带 `type` 字段的 JSON 对象,连续流式发送。
- **权衡事实**:SSE 是纯 HTTP、仅文本(二进制需 Base64,约 +33% 体积 + CPU)、单向 server→client;WebSocket 是独立协议、全双工、原生二进制。MCP 自身用拆分模型:client→server 走 HTTP POST,server→client 走 SSE。
- **对我们的意义**:当前的 WS 守护进程是更难水平扩展的一侧。对"token 流 + 工具事件",SSE + 单独 POST 接收用户输入(AG-UI / AI-SDK 模型)是摩擦更小、对代理/CDN 更友好的路径。WS 只在真双向交互(实时协同状态、语音)才值得保留。更关键的是下面的 resumable streams 在 SSE 上更易实现 —— 流就是一段可重放的 HTTP body,而非有状态 socket。

### 2. Resumable Streams —— 流中途重连(对我们影响最大的单点)

核心决策:**通过 pub/sub 缓冲(Redis)把"生成"与"投递"解耦**,使 agent run 在客户端断连/刷新/切 tab 时仍存活。

- **Vercel AI SDK 架构**(已逐条核验):
  - `POST /api/chat` 跑 `streamText()`;通过 `resumable-stream` npm 包接 **Redis** 存储,需要"A Redis instance - Stores stream data";为每个 chat 持久化一个 `activeStreamId`。
  - `GET /api/chat/[id]/stream` 用于恢复:若无活动流**返回 204 No Content**(代码:`if (chat.activeStreamId == null) { return new Response(null, { status: 204 }); }`),否则恢复既有流。
  - 客户端 `useChat({ resume: true })`:"When `resume` is true, the hook automatically attempts to reconnect to any active stream for the chat on mount." 即挂载时自动 GET 探测并重新加入进行中的流。
  - **Stop 是专门的 endpoint**:客户端 abort 只关 HTTP 连接,**不会取消服务端生成**。官方:"In a resumable stream setup, that abort is a disconnect signal, not a request to stop generation." 专门的 stop endpoint 需要:接收当前 assistant message、持久化这段 partial、取消产流工作、清掉该 chat 的 active stream 记录。
  - **关键 gotcha:断连 ≠ stop** —— 切勿在路由清理/断连回调里调用 stop;刷新/导航后流必须仍可恢复。
- 架构原则:**把持久连接从 Publisher(跑模型的进程)移到独立的 Subscriber**;agent 发布到 Redis,转发进程投递给客户端。无需恢复时常态开销仅一次 `INCR` + 一个 `SUBSCRIBE`,可忽略。[此条来自 Upstash 博客,属第三方阐释而非 Vercel 官方文档]
- **assistant-ui** 提供 `ResumableStreamStore` 接口,后端无关(Postgres / Cloudflare Durable Objects / Upstash / InstantDB 等),支持重载或切 tab 后恢复同一流,带授权、TTL、资源限额,设计上能熬过 serverless 函数生命周期。
- **对我们的意义**:这直接修复"session jsonl 落共享盘、无法 resume"的弱点,且能干净映射到我们现有 Redis。"生成在服务端继续、客户端重连时重放缓冲分片"正是长学术任务(文献综述、多论文分析)所需。**可借鉴:** session 维度的 active-stream-id 入 DB、Redis 作重放缓冲、显式 stop endpoint、挂载即 GET-to-resume。

### 3. AG-UI 协议 —— agent↔UI 的标准事件词汇表

**是什么**:一个开放、轻量、基于事件的协议,标准化 agent 与面向用户应用的连接;agent 实现核心抽象 `run(input: RunAgentInput) -> Observable<BaseEvent>`。每个事件继承 `BaseEvent`,含必填 `type: EventType` + 可选 `timestamp` / `rawEvent`。约 17 个框架集成(LangGraph、CrewAI 为合作起点;1st-party 含 Microsoft Agent Framework、Google ADK、AWS Strands / Bedrock AgentCore、Mastra、Pydantic AI、Agno、LlamaIndex、AG2;社区/进行中含 OpenAI Agent SDK、Cloudflare Agents)。

**事件分类**(已逐组核验):
- **Lifecycle**:`RunStarted`、`RunFinished`(带 `outcome` 字段,`outcome.type:"success"` 或 `outcome.type:"interrupt"` + `interrupts: [...]` 表示 HITL 暂停)、`RunError`、`StepStarted`、`StepFinished`。
- **Text**:`TextMessageStart` / `TextMessageContent`(`messageId` + `delta`)/ `TextMessageEnd`,外加便捷封装 `TextMessageChunk`。
- **Tool calls**:`ToolCallStart` / `ToolCallArgs`(流式参数)/ `ToolCallEnd` / `ToolCallResult`,外加 `ToolCallChunk`。
- **State sync**:`StateSnapshot`(全量)、`StateDelta`(**JSON Patch / RFC 6902 增量**,官方原文确认)、`MessagesSnapshot`(历史)。
- **Reasoning**:`ReasoningStart` / `ReasoningMessageStart` / `ReasoningMessageContent` / `ReasoningMessageEnd` / `ReasoningMessageChunk` / `ReasoningEnd`,以及 `ReasoningEncryptedValue`(加密思维链)。
- **Activity**:`ActivitySnapshot` / `ActivityDelta`。**逃生口**:`Raw`、`Custom`、`MetaEvent`(后者文档明确标注 **DRAFT**)。

**三种可复用通信模式**:Start-Content-End(流式)、Snapshot-Delta(状态)、Lifecycle(有界 run)。**中间件层**让事件"AG-UI-compatible"即可而非完全精确匹配:"Events don't need to match AG-UI's format exactly—they just need to be AG-UI-compatible.",降低适配器编写成本。

**对我们的意义**:AG-UI 是最易直接采纳的规范。即便不引整套库,**把它的事件词汇表用作我们 WS/SSE 的消息 schema**,就能拿到工具调用流式、推理展示、snapshot+delta 状态同步、标准 interrupt outcome —— 并顺带解锁 assistant-ui / CopilotKit 作为可即插的前端(两者都讲 AG-UI)。

### 4. 三大前端框架

**Vercel AI SDK** —— 三层:AI SDK Core(`streamText`、工具调用 + 自动多步 agent loop、25+ provider)、AI SDK UI(框架无关 hooks;`useChat` 走 SSE / `DefaultChatTransport`)、AI SDK RSC(React Server Components 生成式 UI)。v5 引入 **`UIMessage` 作为类型化的应用状态真源**("source of truth for your application state, containing all messages, metadata, tool results, and more")与**可插拔 Transport**(默认 SSE,可换 fetch-based 之外的自定义实现如 WebSocket)。自带消息持久化 + resumable streams(§2)。

**assistant-ui** —— React 组件库;分层 runtime:Primitives(无样式,Radix 风格:`Thread`/`Composer`/`Message`)→ Runtime(状态/编排)→ Adapters(附件/持久化/语音/反馈)→ Transport(跨边界:iframe、进程)。运行时选择:LocalRuntime(runtime 持有状态,简单 fetch)、ExternalStoreRuntime(状态在 Redux/Zustand/TanStack Query)、DataStream(LocalRuntime + 以 message parts 为单位的协议)、**AssistantTransport**(= ExternalStoreRuntime + state-streaming 协议:**后端发完整 agent-state 快照而非 message parts**,前端用 state converter 转成 assistant-ui 格式;需自建两件:agent server 上接受命令并返回快照流的 endpoint + 前端状态转换器)。适配器覆盖 AI SDK / LangGraph / Mastra / Cloudflare Agents / OpenCode / Google ADK / A2A,**以及 AG-UI**。另有 ThreadListRuntime(多线程,§5)、branching、附件、语音、DevTools。

**CopilotKit** —— "agentic UX 的前端栈",**构建于 AG-UI** 之上,任何 AG-UI 后端均可接入。后端 = CopilotRuntime;前端 hooks:`useCopilotAction`(前端工具/动作 + `render`)、`useCopilotReadable`(把应用状态喂进 agent 上下文)、生成式 UI hooks。预制 `CopilotChat`/`CopilotSidebar`/`CopilotPopup` + headless API。CoAgents = 与 LangGraph 的双向共享状态(§6)。

## 编排与子agent

> 本横向维度不涉及"agent 自身的多 agent 编排引擎",但与前端相关的两点:

- **子 agent 对话内联渲染进工具调用**:assistant-ui 的 ToolUI 支持把一个工具调用映射成自定义 React 组件,子 agent 的对话可渲染在该工具调用"内部",前端因此能把 orchestrator→sub-agent 的层级用嵌套 UI 表达,而非平铺一长串消息。
- **角色卡(Role Cards)**:结构化 UX 范式之一(§9),每个 agent 一张卡片标明其 scope / tools / permissions —— 多 agent 场景下让用户看清"谁能干什么"。

更深的编排实现请见同目录 `B-orchestration.md`;本份只覆盖编排在前端的呈现。

## 记忆

前端/UX 视角下的"记忆"主要落在两处:

- **消息历史与线程持久化**:assistant-ui 通过 persistence adapter + ThreadListRuntime 把历史/线程落 DB;Vercel AI SDK 以 `UIMessage` 为真源做消息持久化。这属于"会话级记忆"的存储面,不是模型长期记忆。
- **结构化范式中的 Memory Controls**:HatchWorks 的 12 范式之一明确把"记忆"做成带用户同意/透明度的可控面(consent / transparency),即让用户看到并管理 agent 记住了什么 —— 对学术多租户平台的隐私合规很关键。

注:跨会话的长期记忆/向量库属后端能力,本前端维度不展开。

## 多用户与隔离

- **多线程切换 UI**:assistant-ui 的 **ThreadListRuntime** 是最具体的模型 —— active 选择、create/delete/**archive**、**可插拔的 thread-list adapter 接 DB**、可选云端持久化。这正是我们"每 feature 单 jsonl"模型缺的 per-thread CRUD 面。
  - **对我们的意义**:今天 `agent_sessions` 是每 `(user_id, feature_key)` 一行;真正的 thread-list 意味着**每用户每 feature 1:N 线程** + archive/rename/delete —— 与我们已有的归属表配合,但需补上 N 维度。assistant-ui 的 adapter 模式(UI primitive + 可插拔后端 store)是不重写 UI 就把我们 DB 挂上去的干净路子。
- **约束式/白名单生成式 UI 注册表**:多租户 Web 安全的关键 —— agent 不能注入任意组件/代码。AG-UI 支持"受约束但开放的声明式 UI 小语言";assistant-ui 亦支持基于"允许组件"注册表解析的 JSON node-tree。这把"agent 决定渲染什么"限制在平台预先允许的组件集合内,是多用户隔离的前端侧护栏。
- **可恢复流的隔离要素**:`ResumableStreamStore` / assistant-ui resumable 接口都带**授权、TTL、资源限额** —— 多用户下每条流的归属与配额必须在缓冲层就隔离好。

## 扩展性

- **协议即扩展点**:采纳 AG-UI 事件词汇表后,新增 feature/工具只是新增事件类型与对应 ToolUI 组件,前端渲染管线不变;`Raw`/`Custom`/`MetaEvent` 逃生口允许在不破坏标准的前提下塞自定义事件。
- **适配器分层**:assistant-ui 的 Primitives→Runtime→Adapters→Transport 分层,使"换后端/换传输/换持久化"互相解耦;CopilotKit 因建于 AG-UI 之上,任何 AG-UI 后端可即插。
- **生成式 UI 注册表**:新增一种学术可视化(论文卡 / 引用图 / 对比表)= 往白名单组件注册表加一个组件 + agent 用声明式描述触发,无需改协议。

## 调度与异步

### Agent Inbox 与后台任务通知

**"Agent Inbox" 是异步/后台 agent 的主流范式**(LangChain 官方 + GitHub 仓库):

- 它是**"一个让人类去*协助* agent 的收件箱"** —— 一个 dashboard,agent 在不该自动化的高风险决策上向人类求助,**不是被动监视器**。
- 架构:inbox **连接 LangGraph 部署**(配置 Deployment URL + Assistant/Graph ID),**发现处于 interrupted 状态的 thread,并回送 `HumanResponse` 来恢复**。agent 通过其**原生渠道**(Slack thread、email)提醒人类,而非强制用户切换上下文。
- 范式迁移:从 **"human-in-the-loop" → "human-on-the-loop"** —— agent 自主运行、UI 展示它正在做什么;用户可覆盖某个工具调用、给反馈更新预测、或从 checkpoint 重跑。
- **通知信条**:"Polling is requestor-driven and authoritative; notifications are receiver-driven and best-effort —— **poll for source of truth, use notifications only to improve UX**"(轮询拿真值,通知只优化体验)。

**对我们的意义 —— 这是我们最大的缺口(今天没有计划/后台任务)。** 一个跑长文献扫描或"领域新论文"定时任务的学术 agent 需要:(a) 跨 session 的 agent run **inbox 视图** + 状态(running/needs-input/done/failed);(b) **中断项渲染成可操作 inbox 卡片**(accept/edit/respond);(c) 通知(我们已有站内信/WS 推送)叠在权威 DB 轮询之上;(d) run 在服务端独立于任何打开的 tab 继续(接 §2 resumable streams + Publisher/Subscriber 解耦)。

### 人在回路 / 中断 / 审批 UI(HITL)

**规范 schema = LangGraph `interrupt()` + Agent Inbox `HumanInterrupt`/`HumanResponse`**(已核验):

- `interrupt()` **在图执行中途暂停、抛出待决策、用 `Command` 携人类输入恢复 —— 同时 checkpoint 状态被持久化**。LangGraph 刻意对 UI 不持立场:由应用层呈现 interrupt payload。
- **`HumanInterrupt`**(TS schema 确认)= `action_request { action: string; args: Record<string, any> }` + `config { allow_ignore: boolean; allow_respond: boolean; allow_edit: boolean; allow_accept: boolean }` + 可选 `description`(markdown)。
- **`HumanResponse`** = `{ type, args }`,`type: "accept" | "ignore" | "response" | "edit"`,`args: null | string | ActionRequest`:**accept**(原样批准,回 ActionRequest)/ **edit**(改后回 ActionRequest)/ **response**(自由文本反馈,回 string)/ **ignore**(忽略,回 null)。config 的四个 flag 决定渲染哪些按钮。
- AG-UI 用 `RunFinished.outcome.type:"interrupt"` + interrupts 数组表达同一语义(§3)。

**HITL UX 指南**(Smashing Magazine 的六个命名范式):
1. **Intent Preview** —— 行动前按顺序展示计划;对不可逆/涉资金动作给三条路径 "Proceed / Edit Plan / Handle it Myself"。
2. **Autonomy Dial** —— 按任务类型设自治度,从 "Observe & Suggest" → "Act Autonomously";起步保守、表现可靠再放开。
3. **Explainable Rationale** —— "因为你说了 X,所以我做了 Y"。
4. **Confidence Signal** —— 暴露不确定性以对抗自动化偏见。
5. **Action Audit & Undo** —— 时间序行动日志 + 醒目 undo("非协商的基础范式")。
6. **Escalation Pathway** —— agent 主动问/上报,而非"自信地酿成灾难性猜测"。

**对我们的意义**:当前守护进程**自动批准权限请求**。成熟替代是 `HumanInterrupt` config 模型:用 per-tool flag 决定 Web 用户看到 accept/edit/respond/ignore 中的哪些。对高风险学术操作(发邮件、花经费、删文献集项)要 Intent Preview + accept/edit。**关键重连 gotcha**(我们已踩过)在此同样适用:socket 在中断中途掉线时,待决权限无人审批 —— LangGraph 的 checkpoint 持久化让 interrupt 变得 durable,可在重连后再回答(关联 §2 + 我们 [agent-chat-reentry-and-resync] 记忆)。

## 值得借鉴(对标我们的多用户Web学术agent平台)

按 ROI 排序:

1. **Resumable streams:Redis pub/sub + session 级 active-stream-id + 显式 stop endpoint**(§2)。ROI 最高:修复"无 resume、FS jsonl"弱点;熬过刷新/切 tab/断连;run 在服务端继续。**铁律:断连 ≠ stop。**
2. **采纳 AG-UI 事件词汇表作为我们 WS/SSE schema**(§3) —— 工具调用流式、推理事件、snapshot+delta 状态、标准 interrupt outcome。附赠:assistant-ui & CopilotKit 变可即插前端。
3. **`HumanInterrupt`/`HumanResponse` config 驱动的审批卡**(§7)替代 auto-approve —— per-tool `allow_accept/edit/respond/ignore`;靠 checkpoint 让 interrupt durable,能熬过重连。
4. **Agent Inbox 视图**(§调度与异步):跨 session 的 run + 状态 + 可操作中断卡;DB 轮询拿真值、通知只优化 UX。这是我们缺失的计划/后台任务的地基。
5. **状态驱动生成式 UI(CoAgents 的 intermediate-state 模型)**(§6 见下):一个研究工作区面板渲染 agent 当前 step/state(snapshot-delta),而不是转圈 —— 论文卡、引用表、进度清单。
6. **结构化优先于纯聊天的表面**(§局限上方的 §9 概念):Evidence Panel("给引用而非思维链 dump")、Action Receipts(为文献集/邮件写操作给 diff/链接/回滚)、Activity Timeline、按任务类型的 Autonomy Dial、Budget/Time-Box 成本断路器。
7. **多线程 runtime**(§多用户与隔离):每用户/feature 1:N 线程 + archive/rename/delete,经 adapter 模式接 DB,而非每 feature 一个 jsonl。
8. **约束/白名单生成式 UI 注册表**(§多用户与隔离) —— 多租户 Web 安全(agent 不能注入任意组件/代码)。
9. **SSE + POST 拆分作默认传输**(§1);WS 只留给真双向特性。

### 补充:生成式 UI 与共享状态(§6 细节)

两种不同机制:

**(a) 工具调用驱动**(每个工具调用一个组件):
- **assistant-ui ToolUI**:工具调用映射到自定义 React 组件,收 `args` / `argsText`(流式 partial)/ `result` / `status`;支持 loading/result/interactive 态。
- **CopilotKit `useCopilotAction` 的 `render`**:render-only,外加 **`renderAndWaitForResponse`** 做 HITL —— 渲染确认 UI,收 `args` / `status` / `respond` 回调。
- **AG-UI 生成式 UI**:既支持应用控制的静态类型组件,也支持"受约束但开放的声明式 UI 小语言";assistant-ui 类似支持基于允许组件注册表解析的 JSON node-tree。

**(b) 状态驱动**(每个 agent state 一个组件):
- **CopilotKit CoAgents**:(1) 流式中间状态 —— 按 LangGraph 当前处理的 node 渲染组件,让用户看到 work-in-progress 而非 spinner;(2) `useCoAgent("agentName") → { state, setState }` 双向共享状态;(3) agent 主导的 Q&A。
- 这也是 assistant-ui **AssistantTransport** 的哲学:流式发**完整状态快照**、转成 UI,而非增量追加 message parts。

### 补充:结构化优于纯聊天(§9 概念)

纯聊天窗无法呈现"异步、长跑、多步"系统的状态、权限、重试、审计。失败模式:不可见行动("Done!" 无证据)、状态不清、无 start/stop/pause/resume、无恢复、无审计、从 transcript 重建结构的认知过载。HatchWorks 列了 12 个替代范式:Taskboard + Outcomes、Activity Timeline、Start/Stop/Pause/Resume、Autonomy Levels、Two-Phase Actions、**Action Receipts**(每个动作产出 diff/链接/时间戳/回滚)、**Evidence Panel**(引用与来源,*不是*思维链 dump)、Human Checkpoint Gates、Role Cards、Safe Failure & Recovery、Memory Controls、Budget + Time Boxes。成熟度模型:chat-first(仅 demo)→ guided agent(taskboard+receipts+controls)→ trusted autonomy。

**Artifacts/Canvas 范式**(把输出表面与聊天流分开):生成内容放**侧栏**、与对话解耦;ChatGPT Canvas 做区域级定向编辑,Claude Artifacts 在**安全沙箱**渲染 code/HTML/SVG/Mermaid/React —— 佐证我们既有的 claw-artifact MinIO 方向([claw-artifact-minio-delivery] 记忆)。对学术 agent,"Evidence Panel 给引用而非原始 CoT"这条对学术可信度尤其贴切。

### 补充:超长会话虚拟化(§10)

- assistant-ui 暴露 `ThreadPrimitive.MessageByIndex`(按 index 渲染单条消息),配 `@tanstack/react-virtual` —— 只渲染可见消息,长历史下保持滚动性能。
- **实测 perf bug(已修正措辞)**:GitHub issue **#2954** 的真实根因 = **当 system role 消息作为最后一条渲染时**,`MessagePrimitive.Root` 把内容包进 `ThreadPrimitiveViewportSlack`,它订阅 viewport store 并改 inline style,触发 `MutationObserver` → 跑 viewport auto-scroll → 再改 style 的**反馈循环,卡死主线程**(影响 0.11.51 / 0.11.52,**该 issue 已 closed**,关联 PR #2955)。**官方 workaround 是"渲染 system 消息时不包 `MessagePrimitive.Root`"**,而**不是**草稿原称的"传 stable references(module-level const / useCallback)"。
  - 单独说明:"对 tool/message 组件传 stable reference 以避免无限重渲染"确是 assistant-ui 文档里的通用最佳实践,但它与 #2954 的具体修法**不是一回事**,草稿把两者混为一谈,已分开表述。
- **对我们的意义**:我们已选渲染窗口化而非 react-virtual([chat-longsession-perf] 记忆)。若将来迁移,assistant-ui 的 MessageByIndex + tanstack-virtual 更经实战;但要先测的具体坑是 viewport-store 卡死(尤其 system 消息作末条时)。

## 局限

- **assistant-ui #2954 主线程卡死**是真实已归档 bug(已 closed / PR #2955);虚拟化前需实测 system 消息作末条的场景。
- **AG-UI 年轻、迭代快**;部分事件(如 `MetaEvent`)标注 **Draft**。把规范当演进中的对待。
- **生态大量假设 LangGraph**:Agent Inbox 经 LangGraph SDK 发现 interrupted thread;CoAgents 是 LangGraph 专属。我们要在 Go + agent-daemon 栈上**自行重实现 checkpoint/interrupt 持久化** —— 这个 durable-checkpoint 才是承重依赖,而非 UI。
- **Resumable streams 需要有状态缓冲(Redis)+ 自律的生命周期**(stop endpoint、清理、TTL);"断连不 stop"这条很容易写错。
- **SSE 仅文本** —— 二进制 artifact(PDF)须走单独下载 / MinIO 链接,不能塞进流(与我们 X-Accel-Redirect 一致)。
- **[UNVERIFIED]** CopilotKit 的 `copilotkit_emit_state` / `emit_intermediate_state` Python helper 的代码级 emit API 具体机制:一手博客只描述了哲学(双向同步、按 node 渲染)而未给代码级 API;依赖具体形态前需对 CopilotKit SDK 源码核实。
- **[UNVERIFIED]** "无需恢复时常态开销仅一次 `INCR` + 一个 `SUBSCRIBE`"这一量化来自 Upstash 博客(第三方阐释),非 Vercel 官方文档;数量级合理但未在一手 docs 复核。

本研究信息直接关联我们仓库的:`backend/internal/agentbridge/`(WS pipe、ws-ticket、hooks)、`backend/internal/agent/`(daemon HTTP client)、`frontend-user/src/shared/hooks/useAgentSocket` + `frontend-user/src/shared/lib/agent-stream` + `agent-history`(AG-UI 事件 / resumable 重放的落点),以及 `agent_sessions` schema(需补 1:N 线程维度 + active-stream-id)。

## Sources

- https://vercel.com/blog/ai-sdk-5
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams
- https://ai-sdk.dev/docs
- https://github.com/vercel/resumable-stream
- https://github.com/vercel/ai/discussions/5126
- https://upstash.com/blog/realtime-ai-sdk
- https://www.npmjs.com/package/resumable-stream
- https://docs.ag-ui.com/concepts/architecture
- https://docs.ag-ui.com/concepts/events
- https://docs.ag-ui.com/
- https://www.assistant-ui.com
- https://www.assistant-ui.com/docs/runtimes/pick-a-runtime
- https://www.assistant-ui.com/docs/runtimes/assistant-transport
- https://www.assistant-ui.com/docs/runtimes/custom/external-store
- https://www.assistant-ui.com/docs/runtimes/ag-ui/overview
- https://www.assistant-ui.com/docs/api-reference/primitives/message
- https://github.com/assistant-ui/assistant-ui/issues/2954
- https://docs.copilotkit.ai
- https://www.copilotkit.ai/blog/intermediate-state-coagent
- https://www.copilotkit.ai/blog/everything-you-need-to-build-agent-native-applications
- https://blog.dailydoseofds.com/p/copilotkit-coagents-build-human-in
- https://github.com/langchain-ai/agent-inbox
- https://github.com/langchain-ai/agent-inbox/blob/main/README.md
- https://docs.langchain.com/oss/python/langchain/human-in-the-loop
- https://www.langchain.com/blog/ux-for-agents-part-2-ambient
- https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- https://hatchworks.com/blog/ai-agents/agent-ux-patterns/
- https://note.com/timakin/n/nd812eb702425?hl=en
- https://www.shareduo.com/blog/claude-artifacts-vs-chatgpt-canvas
- https://websocket.org/comparisons/sse/
- https://ably.com/blog/websockets-vs-sse
- https://ably.com/topic/ai-stack/vercel-ai-sdk-chattransport-implementing-a-custom-websocket-transport
- https://agenthermes.ai/blog/sse-websocket-agent-readiness
