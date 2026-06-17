> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 07 · 前端交互与异步 UX (Frontend Interaction & Async UX)

> 维度定位:这是一份**面向决策的提案**。北极星已锁(见各维度共享 north-star),本文只收敛「前端/异步 UX」这一刀:
> 把 CLI 守护进程的「前台 TUI 全程在线」假设,改造成 per-user Web 的「断连可续、长跑可托管、写操作可审批、结构化优于纯聊天」。
> 所有事实仅取自 [01-current-architecture.md](01-current-architecture.md) 与 [findings/B-frontend.md](findings/B-frontend.md) / [findings/B-managed-platforms.md](findings/B-managed-platforms.md);findings 里标 [UNVERIFIED] 的不当事实断言。

---

## 1. Landscape:行业已收敛到哪

把对话/异步 agent 前端拆成五个已收敛的决策面(全部出自 B-frontend.md):

- **传输:SSE-over-HTTP 默认 + 单独 POST 收用户输入;WS 只留真双向。** Vercel AI SDK 5(2025-07-31)把 wire format 切到 SSE,理由是「浏览器原生兼容、标准工具易调试、协议更简洁」。AG-UI transport-agnostic 但 SSE 是事实 canonical。WS 是更难水平扩展的一侧;真双向(实时协同、语音)才值得保留。
- **Resumable streams(ROI 最高):用 Redis pub/sub 把「生成」与「投递」解耦。** Vercel 的做法:`POST /api/chat` 跑 `streamText()`、`resumable-stream` 包接 Redis、每 chat 持久化一个 `activeStreamId`;`GET /api/chat/[id]/stream` 恢复(无活动流回 **204**);`useChat({resume:true})` 挂载时自动 GET 重新加入进行中的流。**铁律:断连 ≠ stop** —— 客户端 abort 只关 HTTP 连接、不取消服务端生成;停止生成是**专门的 stop endpoint**(持久化 partial + 取消产流 + 清 active-stream 记录)。assistant-ui 有后端无关的 `ResumableStreamStore`(带授权/TTL/资源限额)。
- **AG-UI 事件词汇表 = agent↔UI 标准 schema。** 核心抽象 `run(input) -> Observable<BaseEvent>`,每事件带 `type`。分组:Lifecycle(`RunStarted`/`RunFinished` 带 `outcome.type:"success"|"interrupt"`/`RunError`/`Step*`)、Text(`TextMessageStart/Content/End`)、Tool(`ToolCallStart/Args/End/Result`)、State(`StateSnapshot`/`StateDelta` = RFC6902 JSON Patch/`MessagesSnapshot`)、Reasoning、Activity,逃生口 `Raw`/`Custom`/`MetaEvent`(后者 Draft)。中间件层只需「AG-UI-compatible」不必精确匹配。
- **三大前端框架:**assistant-ui(Primitives→Runtime→Adapters→Transport 分层,ThreadListRuntime 多线程、ToolUI 工具组件、`AssistantTransport` 发完整状态快照)、CopilotKit(建于 AG-UI 之上,`useCopilotAction`+`render`/`renderAndWaitForResponse`、CoAgents 双向共享状态)、Vercel AI SDK(`UIMessage` 作应用状态真源 + 可插拔 Transport + 自带 resumable)。**采纳 AG-UI 词汇表 = assistant-ui/CopilotKit 即插。**
- **Agent Inbox + HumanInterrupt(异步/HITL 范式):** Agent Inbox 是「让人类去*协助* agent 的收件箱」,发现 interrupted thread、回送 `HumanResponse` 恢复;范式从 human-in-the-loop → **human-on-the-loop**。`HumanInterrupt` = `action_request{action,args}` + `config{allow_ignore/allow_respond/allow_edit/allow_accept}`;`HumanResponse.type ∈ {accept,ignore,response,edit}`。**通知信条:轮询拿真值(authoritative),通知只优化 UX(best-effort)。**
- **结构化优于纯聊天:** 纯聊天窗无法呈现「异步、长跑、多步」的状态/权限/审计。成熟范式:**Evidence Panel**(给引用而非 CoT dump,学术可信)、**Action Receipts**(写操作给 diff/链接/时间戳/回滚)、**Autonomy Dial**(按任务设自治度)、Intent Preview、Taskboard、Two-Phase Actions。成熟度:chat-first(仅 demo)→ guided agent(taskboard+receipts+controls)→ trusted autonomy。Artifacts/Canvas 把输出表面与聊天流分开(佐证我们既有 claw-artifact 方向)。
- **托管平台的旁证(B-managed-platforms.md):** Amp 把 **thread 作一等公民**(可分享 4 级可见性、可 `@T-...` 引用)、消息进 agent 仍在干活时进**队列**;Devin **session 跑独立 VM + 定时/事件触发(RFC 5545 RRULE)+ Sessions API**(异步 run 的成熟形态);Cursor **Automations** 后台跑 + 多入口触发。这些都印证:成熟平台的 UX 重心早已从「一个聊天框」移到「持久 thread + 后台 run + 审批门」。

---

## 2. 我们现状:WS 做得不错,但卡在四个 Web 假设上

**做得好的(别推倒重来)** —— 01 §6 的 `useAgentSocket.ts` 已经是一台扎实的连接状态机:

- 状态机 `idle|connecting|open|reconnecting|closed|error|displaced`;ws-ticket 每次连/重连一发新 30s 一次性票(01 §6.1)。
- **25s 心跳**(对齐后端 `PingInterval`、低于 agent 60s idle)、**45s/10s 停滞看门狗**(任何帧含 pong 更新 `lastFrameAtRef`,>45s 无帧强 close 重连,救「TCP 活但投递死」)、**8 次退避**(1→60s,≈3-4min 后 error;displaced 不重连)。
- **resync**:控制帧绕过 rAF 批先 `flushNow()`,`resync_start`→`truncateToLastComplete` 砍在飞半轮防重放重复。
- **history replay 同构契约**(`agent-history.ts` `replayHistoryAsTurns`):实时 fold 与历史 fold 必须同构,否则重入分叉(01 §6.3,load-bearing)。
- **渲染窗口化**已做([chat-longsession-perf]):只渲末 `RENDER_WINDOW=60` 轮 + 两段「加载更早」,而非 react-virtual。
- **多 tab + displaced 横幅**:`BroadcastChannel` invalidate query、`AgentDisplacedBanner` 自动恢复(只 visible tab、4s+抖动、4 次后转手动,01 §6.4)。

**卡住的四点(本文要解决的)** —— 都是「桌面前台 TUI 全程在线」假设搬到 Web 后的塌陷:

1. **jsonl 落盘无法续流(对标 resumable 的最大短板)。** 会话 transcript 在 agent 容器 `~/.claude/.../<sid>.jsonl`、backend 黑盒(01 §1 数据落点)。agent 侧有 10min grace + `liveTurnBuffers` + `resyncSessionOutput`(01 §3.1),但这是**容器内进程内**缓冲,不是 session 级持久 active-stream。我们的「停滞看门狗 → 强 close → 重连 → resync」是在「socket 仍活」假设下救半死连接;真正**断开/刷新/切路由后,前端 `busy` 纯靠前台 WS、`pendingTurns` 丢**(C15),只能回到该 session 经 resync 恢复。换言之:我们有「**重连续看**」,但没有 Vercel 那种「**断连归零、挂载即 GET-resume、跨设备续看**」。
2. **无 Agent Inbox / 后台任务面(C15)。** 导航离开则 WS 关、长任务被「孤儿化」,backgrounded tab 的 displaced 不自动恢复;长跑完成**无任何提醒**(`PushNotification` 还在 agent 全局 denylist,01 §7.1)。这是我们最大的产品缺口(也是 B-frontend.md 点名的「最大缺口」)。
3. **auto-approve 而非审批卡(C1/C14)。** 用户 feature 端 `permission_request` 在前端**不 fold**(后端 auto-approve,01 §6.2);`AutoApprovePermission` 单 bool 语义分裂(C14)。这意味着 Web 用户对「agent 要发邮件/花经费/删文献集」**没有任何 UI 介入点**,且 Bash 无条件 auto-approve(C1)旁路全部路径门。
4. **artifact 交付是 claw 私有(C13)。** harvest→MinIO→dedup→zip 只在 claw(01 §4),`agentbridge` 不知 artifact;前端「交付物面板」无法跨 feature 复用。

> 补一句架构现实:WS 逐帧同步转发**无应用层缓冲**(C17,01 §2.3),displacement 是进程内 `sync.Map` 单实例假设(C2/C3)。这两条决定了 —— **resumable streams 的 Redis 缓冲层不只是 UX 改进,它顺便是 C2/C17 的解药**(把「投递」从「持久 WS socket」解耦出去,投递层无状态、可多实例)。

---

## 3. 目标设计

四块,按 ROI 与依赖排序。每块都给「映射到现有触点」,避免空谈。

### 3.1 Resumable streams(ROI 最高,先做)

**目标:断连/刷新/切 tab/换设备后,run 在服务端继续,前端挂载即重放缓冲。铁律:断连 ≠ stop。**

落地三件套(对齐 Vercel,但建在我们已有 Redis 上):

1. **session 级 active-stream-id 入 DB。** 在 `agent_sessions` 加列 `active_stream_id varchar(64) NULL` + `stream_started_at datetime NULL`。一轮 user_message 触发生成时由 agentbridge 写入,`message_complete`/stop/error 时清空。这是「这个 session 此刻有没有在飞生成」的**权威真值**(C7 顺带受益:有了 per-stream id,WS usage 行那个空 `request_id` 终于有 anchor)。
2. **Redis 重放缓冲。** agent → backend 的每帧,backend 在转发给前端 WS 的**同时**追加进 `RPUSH agent:stream:<active_stream_id>`(带 TTL,如 1h)+ 维护 seq。这就把「生成(agent pump)」与「投递(前端 WS)」解耦 —— 直接消解 C17(无应用层缓冲)与 C2 单实例 displacement(投递层无状态)的根。**注意 SSE 仅文本**:二进制 artifact(PDF)不入流,走 MinIO 链接 / X-Accel-Redirect(与我们既有一致)。
3. **挂载即 GET-resume + 显式 stop endpoint。** 前端 `useAgentSocket` 升级:连上后先 `GET /<feature>/session/:sid/stream-state` —— 有 `active_stream_id` 则先把 Redis 缓冲从 `last_seen_seq` 重放(补齐离线期间的帧),再切到 WS 实时;无活动流回 204(对齐 Vercel)。新增 `POST /<feature>/session/:sid/stop`:持久化 partial、向 agent 发 interrupt(复用 01 §3.1 的 interrupt+3s 强杀)、清 `active_stream_id`。**前端 abort/路由清理回调里绝不调 stop**(B-frontend.md 点名最易写错的 gotcha)。

**映射到现有触点:**
- `frontend-user/src/shared/hooks/useAgentSocket.ts`:连接后增加「先 GET-resume 后 WS」分支;现有 resync 帧逻辑(`truncateToLastComplete`)正好复用为缓冲重放的去重。
- `frontend-user/src/shared/lib/agent-stream.ts`:加 seq 跟踪 + 「从 seq N 重放」。
- `backend/internal/agentbridge/ws.go`(`pipe`,01 §2.3):转发同时 `RPUSH` 缓冲;`hooks.go` 在 `message_complete` 清 active-stream。
- `agent_sessions`:加 `active_stream_id`/`stream_started_at`(新迁移)。

**取舍:** 渐进派(推荐先行)= **保留 WS 当实时传输,只在其上叠 Redis 缓冲 + GET-resume + stop endpoint**,改动集中在 agentbridge pipe + useAgentSocket,不动协议。彻底派 = 顺势把实时传输从 WS 迁到 SSE(见 §3.2),但那是大改、且 WS 已投入大量心跳/看门狗/displaced 工程,不应为 resumable 单独迁。**结论:resumable 先在 WS 上做,SSE 迁移作为独立决策。**

### 3.2 AG-UI 事件词汇表作为我们的 WS/SSE schema

**目标:把现有自定义帧重命名/重整为 AG-UI-compatible,换来 assistant-ui/CopilotKit 可即插 + 协议成为扩展点。**

现有帧 → AG-UI 对应(我们已有大部分语义,缺的是命名统一):

| 现有帧(01 §2.3/§6.2) | AG-UI 事件 |
|---|---|
| `content_start`/`content_delta` | `TextMessageStart`/`TextMessageContent`(`messageId`+`delta`) |
| `thinking` | `ReasoningMessageStart/Content/End` |
| `tool_use`(complete)/`tool_result` | `ToolCallStart/Args/End`/`ToolCallResult` |
| `permission_request` | 走 `RunFinished.outcome.type:"interrupt"` + interrupts(见 §3.4) |
| `message_complete`(带 usage) | `RunFinished`(`outcome.type:"success"`) |
| `status`/`compact_boundary` | `StepStarted/Finished` / `Custom` |
| `displaced`/`resync_*` | 我们的运维控制帧 → `Custom`/`MetaEvent`(逃生口) |
| prism round live diff | `StateSnapshot`/`StateDelta`(RFC6902)—— 天然契合 prism DB↔cwd round 事务 |

**为什么值得:** 中间件层只需「AG-UI-compatible」不必精确匹配,适配成本低;一旦帧是 AG-UI 词汇,assistant-ui 的 ToolUI / ThreadListRuntime / CopilotKit 的 `useCopilotAction` 都能直接消费我们的后端。新增 feature/工具 = 新增事件类型 + ToolUI 组件,渲染管线不变(协议即扩展点)。

**SSE 是否替代部分 WS?** 取舍很清楚:**WS 已投入**(心跳/看门狗/退避/displaced/resync 全套是真金白银),且我们已有 ws-ticket 鉴权链;SSE **更易水平扩展、更易续流**(流就是可重放 HTTP body,而非有状态 socket),对代理/CDN 友好。**推荐:不为了纯洁性迁移。** 把 AG-UI 词汇表先落在 WS 上(零传输变更);只有当 §3.3 的 Agent Inbox 需要「后台 run 无前台 WS 也能投递事件」时,**新的后台 run 用 SSE+POST**(天然 resumable),交互式 session 保留 WS。即 **WS 与 SSE 并存、按场景分** —— peerreview 的 `ServerSideChatStreaming→SSE broker`(01 §2.8)已经证明我们能跑 SSE 路径。

**映射到现有触点:** `agent-stream.ts`(帧解析按 AG-UI type)、`agent-history.ts`(replay 同构契约要同步改 —— 这是 load-bearing,01 §6.3)、`shared/components/chat/fold.ts`(fold 按 AG-UI 事件)、agent 容器 `ws/handler.ts:translateCliMessage`(01 §3.2,CLI stream-json → ServerMessage 的翻译点,改成直接吐 AG-UI 事件)。

### 3.3 Agent Inbox + 后台任务面(衔接调度维度 06)

**目标:跨 session 的 run 列表 + 状态 + 可操作中断卡。DB 轮询拿真值,通知只优化 UX。**

这块 UI 依赖 06(durable 任务底座)的后端,本文只定义**前端契约 + 它需要后端给什么**:

- **run inbox 视图**:跨 feature/session 列出 run,状态 `running|needs-input|done|failed`。前端**轮询权威 DB**(run 表,06 提供)拿真值;通知(我们已有站内信 + WS 推送 + `BroadcastChannel`)叠在上面只优化 UX —— 严格遵守「poll authoritative / notify best-effort」信条。
- **中断项渲染成可操作卡片**:`needs-input` 的 run 在 inbox 里显示为 HumanInterrupt 卡(见 §3.4),用户在 inbox 里直接 accept/edit/respond/ignore 恢复,**不必切回原 session tab**(Amp/Devin 都让 agent 经原生渠道提醒、人类原地处理)。
- **完成通知(MVP 就要)**:`message_complete`/run done 时:标题闪 + toast + 站内信。**注意 `PushNotification` 在 agent 全局 denylist(C15/01 §7.1)** —— 通知必须由 **backend 在 run 完成时主动发**(我们已有 `internal/message` + websocket hub),而非 agent 工具,这同时绕开了「桌面 PushNotification 工具」的安全顾虑。
- **durable 才能托管**:run 必须独立于任何打开的 tab 在服务端继续(直接接 §3.1 resumable streams 的 Publisher/Subscriber 解耦)。这正是 C15「无后台任务面」的根治。

**映射到现有触点:** 新前端区(`features/inbox/` 或挂在已有导航);后端 run 表(06);通知复用 `internal/message` + `internal/websocket`。**前端只读权威 DB + 渲染卡片**,不持有 run 真值(避免又一个进程内状态)。

### 3.4 HumanInterrupt 审批卡替代 auto-approve(衔接安全维度)

**目标:per-tool 审批,高风险学术操作给 Intent Preview。把 C1/C14 从「单 bool auto-approve」升级为「config 驱动审批」。**

- **审批 config 模型**:把后端权限门(01 §7.1 Layer C `decidePermission`)的输出从「allow/deny」扩成 `HumanInterrupt.config`:`allow_accept/allow_edit/allow_respond/allow_ignore`。不同工具不同 config:
  - 只读 MCP(`mcp__minicod__*`):仍 auto-accept(零摩擦,smart_search 现状)。
  - **高风险学术写操作**(发邮件 / 花经费 / 删文献集项):`allow_accept+allow_edit`,前端弹 **Intent Preview** 卡(「我要发这封邮件给 X,内容 Y」「这步预估花 Z 经费」),用户 accept 或 edit 后放行。对接 §1 的「不可逆/涉资金动作给 Proceed/Edit/Handle-it-Myself 三路径」。
  - **Bash**(C1):当前无条件 auto-approve、旁路路径门。安全维度负责硬隔离(bubblewrap);**前端侧的过渡缓解** = 对 Bash 也走审批卡(至少 `allow_accept`),让用户看到「agent 要执行什么 shell」再批 —— 把不可见的 C1 变成可见的审批点(检测层缓解,不替代代码层隔离)。
- **前端渲染**:`permission_request` 帧(现在用户 feature 不 fold)改为 fold 成审批卡;config 的四 flag 决定渲染哪些按钮。复用 AG-UI `RunFinished.outcome.type:"interrupt"` 语义。
- **durable interrupt 是关键 gotcha**:socket 在中断中途掉线 → 待决权限无人审批(我们 [agent-chat-reentry-and-resync] 已踩过)。**必须**让 interrupt 持久(写进 run 表 / §3.1 active-stream 状态),重连/换设备后在 inbox 里再回答 —— 否则审批卡 = 又一个易丢的前台状态。

**映射到现有触点:** `backend/internal/agentbridge/ws.go`(`decidePermission` 输出 config)、`AutoApprovePermission` 单 bool 拆成 per-tool policy(消解 C14)、`shared/components/chat/`(新增 `InterruptCard`/`IntentPreviewCard`)、fold.ts(permission_request 改 fold)。

### 3.5 结构化面:Evidence Panel / Action Receipts / Autonomy Dial / 多线程

把「纯聊天」升级为「guided agent」(B-frontend.md 成熟度模型),对学术平台尤其重要:

- **Evidence Panel(学术可信核心)**:给**引用与来源,不是 CoT dump**。smart_search/claw 的 `mcp__minicod__*` 结果天然是结构化论文 —— 用侧栏 Evidence Panel 渲染引用卡(标题/作者/DOI/链接),而非把检索结果埋进对话文本。这是学术 agent 区别于通用 chat 的最大产品杠杆。
- **Action Receipts**:文献集 / 邮件 / prism apply 等**写操作给 diff/链接/时间戳/回滚**。我们已有素材:prism 的 round 事务(per-hunk overrides,01 §4)就是天然 receipt;claw artifact(MinIO 链接)就是天然交付 receipt。统一成 receipt 范式 = 把 C13(artifact claw 私有)抽象进 bridge,所有 feature 的写操作都产 receipt 帧。
- **Autonomy Dial**:按任务设自治度(Observe & Suggest → Act Autonomously)。映射到 §3.4 的审批 config —— Dial 调高 = 更多工具 auto-accept;调低 = 更多走审批卡。起步保守(高风险全审批),可靠后放开。
- **多线程 runtime(补 agent_sessions 的 N 维度)**:今天 `agent_sessions` 是「每 `(user_id, feature_key)` 用应用层维持只一行」(单会话 feature)或 claw 的多行(01 §5.1)。真正的 thread-list = **每用户每 feature 1:N 线程 + archive/rename/delete**。claw 已有 sidebar CRUD(`ListSessions`/`CreateNewSession`/`RenameSession`/`DeleteSessionByID`,01 §2.1)—— 把它**抽象进 agentbridge 通用能力**(而非 claw 私有),配 archive 列,所有 feature 都能多线程。对标 assistant-ui ThreadListRuntime 的 adapter 模式(UI primitive + 可插拔后端 store),Amp 的 thread-as-first-class。
- **生成式 UI 白名单注册表(多租户安全护栏)**:若引入 generative UI,**agent 不能注入任意组件**。用「允许组件注册表」解析 agent 发的 JSON node-tree(AG-UI 受约束声明式 UI / assistant-ui 允许组件注册表)。新增一种学术可视化(论文卡/引用图/对比表)= 往白名单加一个组件,agent 用声明式描述触发,不破协议、不破多租户隔离。

---

## 4. 分期选项 + 取舍 + 改动触点

三档,逐档可独立交付、可叫停。

### MVP:Resumable streams + 完成通知

- **做什么**:§3.1 全套(active-stream-id 入 DB + Redis 缓冲 + GET-resume + stop endpoint,**在 WS 上**)+ §3.3 的「完成通知」一项(backend 在 run/message_complete 完成时发站内信 + WS 推送 + 标题闪/toast)。
- **解决妥协**:C15(无完成通知 → 有)、C17(无缓冲 → Redis 缓冲)、部分 C2(投递解耦,但 displacement 互斥仍需 Redis 锁,留给多用户维度)、C7(active-stream-id 给 WS usage 一个 request_id anchor)。
- **改动触点**:`useAgentSocket.ts`(GET-resume 分支)、`agent-stream.ts`(seq + 重放)、`agentbridge/ws.go`+`hooks.go`(转发即缓冲、完成清 active-stream + 发通知)、`agent_sessions`(加 `active_stream_id`/`stream_started_at`,新迁移)、`internal/message`+`internal/websocket`(完成通知)。
- **取舍**:不动传输协议、不动 AG-UI、不动审批。最小风险拿到「断连可续 + 长跑有提醒」两个最痛的 UX。**先做这个。**

### 进阶:Agent Inbox + 审批卡

- **做什么**:§3.4 HumanInterrupt 审批卡(per-tool config,高风险给 Intent Preview)+ §3.3 Agent Inbox 视图(依赖 06 的 run 表)+ §3.5 的 Action Receipts(把 C13 artifact 抽象进 bridge)。
- **解决妥协**:C1/C14(auto-approve/单 bool → config 驱动审批,前端检测层缓解)、C13(artifact claw 私有 → bridge 通用 receipt)、C15 的「后台任务面」根治。
- **改动触点**:`agentbridge/ws.go`(`decidePermission` 出 config、`AutoApprovePermission` 拆 per-tool)、`shared/components/chat/`(`InterruptCard`/`IntentPreviewCard`/`ReceiptCard`)、`fold.ts`+`agent-history.ts`(permission_request 改 fold,**同构契约必须同步改**)、新 `features/inbox/`、后端 run 表(协同 06)。
- **取舍**:依赖 06 的 durable 任务底座(inbox 没有 run 表就是空壳)。审批卡可**先于** inbox 落地(只要 interrupt 持久),inbox 是它的跨 session 聚合视图。

### 完全:AG-UI 迁移 + 生成式 UI

- **做什么**:§3.2 把帧整体迁成 AG-UI 词汇表(WS 与新后台 run 的 SSE 并存)、引入 assistant-ui/CopilotKit 之一作前端 runtime、§3.5 多线程 runtime 抽象进 bridge + 生成式 UI 白名单注册表 + Evidence Panel/Autonomy Dial。
- **解决妥协**:协议成为扩展点(新 feature 零渲染管线改动)、多线程补 agent_sessions 的 N 维度、Evidence Panel 提学术可信。
- **改动触点**:`agent-stream.ts`/`agent-history.ts`/`fold.ts` 全量按 AG-UI、agent 容器 `ws/handler.ts:translateCliMessage` 直吐 AG-UI、agentbridge 多会话 API 从 claw 私有提为通用(加 archive 列)、新生成式 UI 注册表 + Evidence Panel 组件。
- **取舍**:最大工程量、要重写 fold/history 同构契约(load-bearing,易引重入分叉 bug,01 §6.3)。**只有当我们想吃到 assistant-ui/CopilotKit 生态红利、或 feature 数量多到协议碎片化成本超过迁移成本时才做。** AG-UI 年轻、迭代快、部分事件 Draft(B-frontend.md 局限),把它当演进中规范对待 —— 先在 MVP/进阶里用它的**事件词汇表**(零成本收益),把「换前端库」这步留到最后。

---

## 摘要(本维度对 Scholay 最重要的建议)

1. **先做 Resumable streams(MVP,ROI 最高):** session 级 `active_stream_id` 入 `agent_sessions`(新迁移)+ Redis 帧缓冲 + 挂载即 GET-resume(无活动流回 204)+ 显式 stop endpoint。铁律「断连 ≠ stop」—— 前端 abort/路由清理回调绝不调 stop。改动触点:`useAgentSocket.ts`/`agent-stream.ts`/`agentbridge/ws.go`+`hooks.go`/`agent_sessions`。一举消解 C15(续流)、C17(缓冲)、给 C7 一个 request_id anchor、并把投递从持久 WS 解耦(缓解 C2 的根)。
2. **完成通知同期落地(MVP):** 由 **backend** 在 run 完成时发站内信 + WS 推送 + 标题闪/toast(复用 `internal/message`+`internal/websocket`),而非 agent 工具 —— 顺带绕开 `PushNotification` 还在 denylist 的问题(C15)。轮询权威 DB 拿真值、通知只优化 UX。
3. **HumanInterrupt 审批卡替代 auto-approve(进阶):** 把 `decidePermission` 输出从 allow/deny 扩成 per-tool `config{allow_accept/edit/respond/ignore}`,高风险学术操作(发邮件/花经费/删文献集)给 Intent Preview;Bash 至少走 `allow_accept` 让用户看见再批(检测层缓解,不替代硬隔离)。interrupt 必须持久,能熬过重连。消解 C1/C14。改动触点:`agentbridge/ws.go`、`shared/components/chat/InterruptCard`、`fold.ts`/`agent-history.ts`(同构契约同步改)。
4. **AG-UI 词汇表先用、迁移后做(贯穿三期):** 现有帧(content_delta/tool_use/permission_request/message_complete)与 AG-UI 几乎一一对应 —— **先把帧重整为 AG-UI-compatible(零传输变更)**,换来 assistant-ui/CopilotKit 可即插与「协议即扩展点」;**不为纯洁性迁 SSE**,WS 已投入,只让新后台 run 用 SSE(天然 resumable),交互式 session 留 WS。
5. **结构化面 + 多线程(进阶/完全):** Evidence Panel(给引用不给 CoT,学术可信核心)、Action Receipts(把 C13 的 claw 私有 artifact 抽象进 bridge,所有写操作产 receipt)、Autonomy Dial(对接审批 config)、把 claw 的多会话 CRUD 提为 agentbridge 通用能力 + archive 列(补 `agent_sessions` 的 1:N 线程维度);若引生成式 UI 必须走白名单组件注册表(多租户护栏)。
