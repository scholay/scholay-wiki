<!-- 2026-06-27 P0+P1 implementation review (conformance + adversarial), grounded in live test. 7 agents. -->

All confirmed. Smart-search also passes `HISTORY_WINDOW=100` explicitly (SmartSearchPanel.tsx:53-55,79). The path is `features/search/components/smart-search/SmartSearchPanel.tsx`, not `smartsearch`. The CRITIQUE's MEDIUM-4 downgrade is correct (no live trigger), though its cited path `SmartSearchPanel.tsx:55` is right on line but wrong on directory.

I have full ground truth. The CRITIQUE's corrections are all valid: (1) file citations wrong (`events.ts` doesn't exist, fold is `features/claw/components/chat/fold.ts`, smart-search is under `features/search/...`), (2) MEDIUM-4 has no live trigger (downgrade to LOW latent), (3) add the ev_seq out-of-order durable-write nuance. I'll now produce the final corrected report.

# Scholar Agent 重构 · P0+P1 实现复盘(对抗式)

## 1. 落地了什么 + 今晚实测结论

**总览。** 今晚通过 `docker compose up -d --build` 部署了 Web-native 重构的 Foundation + P0(影子写)+ P1(读路径,默认关)。落地物:

- **迁移 0046-0049**:`agent_turns`(轮单元)、`agent_turn_events`(按月 RANGE 分区,`PRIMARY KEY(id,created_at)` + `UNIQUE(turn_id,ev_seq,created_at)`)、`agent_billing_ledger`(影子计费)、`agent_saga_steps`(P5 契约占位)。分区表的 UNIQUE/PK 全部 inline 在 `CREATE TABLE` 内(正确——分区表的唯一键无法事后用 `add_index_if_not_exists` 加),0047 的非分区索引走幂等存储过程。schema-sync 干净应用。
- **新 Go 文件** `backend/internal/agentbridge/`:`journal_model.go`、`eventlog.go`(`EventLog` 契约 + `EvType` 词汇)、`eventlog_batcher.go`(200ms/4KB 合并 + 独立 `writeLoop` goroutine)、`eventlog_store.go`(读写实现 + `FoldToMessages`)、`turncoord.go`(nil-safe 协调器)、`eventlog_validate.go`(journal==daemon 校验)。
- **改动**:`bridge.go`(turns/log 字段 + setter + 读门控)、`hub.go`(tee A=BeginTurn、tee B=message_complete、通用 tee、endTurn/shutdown 终态、`addSubscriber` 两段式回放、`classifyJournalEv`/`buildLedgerRow`)、`ws.go`(`extractClientTurnID`)、`peerreview/service.go`(debt#4 stitch 5 点)、`bootstrap.go`(env 门控接线)、前端 `useAgentSocket.ts`(`clientTurnId`)、`docker-compose.yml`(3 个 flag)。
- **Flag**:`AGENT_TURN_JOURNAL=shadow`(只写,默认空=no-op)、`AGENT_JOURNAL_VALIDATE=on`(比对)、`AGENT_JOURNAL_READ=<csv>`(P1 读,默认空=daemon)。

**三大能力实测(ground truth)。** 三个 agent 能力对 DeepSeek 上游全部端到端跑通:smart-search(LLM + 6 次 Minicod 检索)、claw(概念 + 论文查找)、prism(用 Read/Edit/Write 改 `main.tex` 加 xeCJK + 中文摘要)。

**影子日志验证。** 三条全部捕获:`agent_turns` 全 `status=complete model=deepseek-v4-pro`;`agent_turn_events` 合并生效(smart-search 822 条 raw `content_delta` → 33 行,即 O(content-blocks) 非 O(tokens),batcher 工作);`agent_billing_ledger` 影子 token 与真实 `agent_usage` 日志**精确匹配**;`client_turn_id` 已填;无 journal/影子报错。**测试中发现并修复一处保真缺口**:工具调用帧实测类型是 `tool_use_complete`(非裸 `tool_use`),`classifyJournalEv` 白名单初始漏了它(`tool_result` 已捕获),已补到也收 `tool_use_complete` 并重启后端。

**关键事实(贯穿全报告)。** `AGENT_JOURNAL_READ` 今晚**留空**——读仍走 daemon。因此 P1 读路径(`readHistoryFromJournal` / `addSubscriber` 两段日志回放 / `FoldToMessages`)**从未实跑**;只有 P0 影子写被验证。下面所有 P1 读侧缺陷均为**潜伏未爆**。

---

## 2. 符合度审计:实现 vs 重构蓝图

**做对了(P0 写侧 + Foundation,实质 CONFORMANT):**

- **DDL 字节级符合** §1.1/§1.2:分区表唯一键正确 inline;`id` 全局自增保证跨轮 `ORDER BY id` 全序;0047 索引幂等。GORM 模型(`journal_model.go`)匹配 §1.5,用 `json.RawMessage` 不引新依赖。
- **batcher 真正脱离热路径**(§3.2):`content_delta` 仅做内存 `strings.Builder` append + arm timer(`eventlog_batcher.go:114-131`),真 INSERT 在独立 `writeLoop`(`eventlog_batcher.go:65-72`)。**`upstreamLoop` 先 `broadcastAgent`(`hub.go:516`)再 tee(`hub.go:518-529`)**,通用 tee 在扇出之后——符合设计。
- **ev_seq 单锁单计数器**:delta 与非 delta 共用 `accum.nextSeq` 同一把 `b.mu`(`eventlog_batcher.go:90-91, 137-138`),非 delta 先 `flushDeltaLocked` 再自取号,逻辑递增无重无空。空 text 的 toolInput delta 正确跳过(`eventlog_batcher.go:116-119`)。
- **影子-only / 默认纯 no-op**:`TurnCoordinator` 全方法 nil-guard;`bootstrap.go` 把接线锁在 `AGENT_TURN_JOURNAL==shadow` 后;env 未设 → `b.turns` 为 nil,每个 tee `if f.bridge.turns != nil`(`hub.go:434,520`)。所有影子失败只 `slog.Warn`(`eventlog_batcher.go:67-70`)。
- **终态恰好一次**:`message_complete` case 在 `h.mu` 下置 `currentTurnID=0` + `completedThisTurn=true`(`hub.go:435-439`),使通用 tee(读 `tid==0` 跳过)与 endTurn(`tid==0` 跳过)不重复 finalize。`BeginTurn` 幂等于 `(agent_session_id, client_turn_id)`(`eventlog_store.go:50-72`)。
- **计费 P1 完全不动**(§4.3):`accrueTurnUsage→recordAgentTokens`(`hub.go:462-468`)与 tee 独立;`agent_billing_ledger` 仅在 `CompleteTurn` 内经 `OnConflict{DoNothing}`(`eventlog_store.go:100-103`)写,且**无任何代码读它**。今晚 ledger 精确匹配正是因为这条独立性。
- **provider-agnostic 在新文件内保住**:用自有 `EvType` 词汇(`eventlog.go`),逻辑键 `(agent_session_id, turn_id, ev_seq)`,无 `parentUuid`/`--resume` 进列。
- **P1 读双重门控 + daemon 兜底 + 一 flag 可逆**:`readFromJournal`(`bridge.go:200-214`)要求 `b.log!=nil` 且 feature 在 CSV 里;`readHistoryFromJournal`(`bridge.go:595-608`)`jerr!=nil` 即 `ok=false` 落回 daemon,jsonl 仍权威。
- **`addSubscriber` 锁纪律正确**:MySQL 读(`ReadInFlightEvents`)在 `h.mu` **外**(`hub.go:219-228`),锁内只内存操作。读错 → `useJournal=false` 落回 replayBuf。
- **peerreview debt#4 stitch 完整符合** §7.3:`loadPersistedReviewer` 从 `ContentMd` 复水避免 chief 静默降级,`allReviewersPersisted` 门控方法论跳过,per-reviewer gap-fill,chief-already-persisted guard,`UpsertReport(submission_id,role)` OnConflict 重跑安全。零新表零新 flag。

**偏离了(带 file:line):**

1. **§3.2 后扇出 append 不变式被 message_complete 破坏。** 终结符的 tee(`Append(EvMessageComplete)` + `buildLedgerRow` + `CompleteTurn`)在 `hub.go:441-450`,**早于** `broadcastAgent(data)`(`hub.go:516`)。其余帧走通用 tee 在扇出之后(符合)。实际无害(同步部分只是入 2048 缓冲 channel),但确是文档化顺序的偏离。
2. **「delta 路径完全无 MySQL / 绝不阻塞 upstreamLoop」铁律有缝。** `enqueue`(`eventlog_batcher.go:98-106`)在 `writeCh`(cap 2048)满时**同步** `b.db.Create(row)`,且持 `b.mu`。该路径从 `upstreamLoop` 同步可达(每个非 delta 事件 + 每次 4KB flush)。DB 卡顿 + 突发填满 channel 时会阻塞上游读/扇出环——正是铁律禁止的热路径耦合。有界不丢,仅饱和时触发,今晚轻载未触及。**另外** `BeginTurn`(`hub.go:654`)是 `handleUserMessage` 内 `writeAgent` 之前的**同步多语句事务**(`hub.go:649-657`,注释自承「同步一行 INSERT」),开启影子时给每个交互轮加感知延迟。
3. **ledger.kind 硬编码 + 带外轮不入日志。** `buildLedgerRow` 硬写 `Kind:"interactive"`(`hub.go:783`),`BeginTurn` 不填 Kind。带外轮(`memory_extract` via extract_memory、title via session_title_updated)走 `recordOutOfBandTokens`(`hub.go:486-493`)**从不调 `BeginTurn`**——既无 Turn 行也无 ledger 行。后果:影子 ledger 只是 `agent_usage` 的**交互轮子集**镜像;今晚精确匹配恰因三能力都是交互轮。这削弱了 §1.6 让 kind 当计费拆分锚点的意图与 P3 对账前提。
4. **FoldToMessages 对工具轮非字节/非渲染 parity(P1 阻断级,见 §3)。** 代码自承(`eventlog_store.go:164-166`「P1 待精修…tool_use/tool_result 以 frame payload 作为 block 透传(结构占位)」)。
5. **校验器只实现 2/3 维度**(`eventlog_validate.go:99-110`,注释 §29-30 自述「① 用户轮数 ② assistant 文本」):**丢了设计 §7.4 的「tool 调用名序列」**——恰是能抓 fold 缺陷的那一维。

---

## 3. 对抗式复盘(主流 agent / web-native 视角,按严重度排序)

> ⚠️ 实测三种帧形状(已逐文件核对源码,**前端 wire 类型在 `frontend-user/src/shared/types/chat.ts`,不存在 `events.ts`**):

| 来源 | tool_use | tool_result | 字段命名 |
|---|---|---|---|
| Agent wire(`features/claw/components/chat/fold.ts:98-112`) | `type:"tool_use_complete"` `toolUseId/toolName/input` | `type:"tool_result"` `toolUseId/content/isError` | **camelCase** |
| Daemon(`bridge.go` 返回 agent.SessionMessage,Anthropic content[]) | `type:"tool_use"` `id/name/input` | `type:"tool_result"` `tool_use_id` | snake_case |
| Journal fold(`eventlog_store.go:197-198`) | **原样塞 wire frame** `tool_use_complete` | **原样塞 wire frame**(塞进 assistant 块内) | camelCase |

### 🔴 HIGH-1 — P1 历史读会静默丢掉所有工具调用/结果(阻断 AGENT_JOURNAL_READ)

`FoldToMessages`(`eventlog_store.go:197-198`)把原始 camelCase wire frame(`tool_use_complete`/`tool_result`)**原样**塞进 assistant `SessionMessage` 的 content block。前端历史 fold(`shared/lib/agent-history.ts:214-228`)只 dispatch **顶级** `tool_use`/`tool_result` entry 且读 Anthropic-shape block(`tool_use`{id,name,input} / `tool_result`{tool_use_id});`extractToolResults` 只认 `tool_use_id`(snake)且只在 `entry.type==='user'` 上跑(`agent-history.ts:187`)。journal fold 产出的 `tool_use_complete`-shape 块命中**零** case → 静默丢弃;`tool_result` 被折进 **assistant** 消息(`eventlog_store.go:197-198`)永远到不了 `extractToolResults`,且用 `toolUseId` 非 `tool_use_id` → 也丢。**结果:`AGENT_JOURNAL_READ` 一旦翻开,reentry/历史里所有工具卡片(6 次 Minicod 检索、claw 查找、prism 的 Read/Edit/Write)全部消失。** 今晚三能力全用工具,故 §10「字节级等同」对每个真实 feature 都未达成。

**修**:`FoldToMessages` 把 wire frame 翻成 Anthropic content[](`tool_use_complete → {type:tool_use,id:toolUseId,name:toolName,input}`;`tool_result → 顶级 type:tool_result SessionMessage,tool_use_id+is_error`),供 `replayHistoryAsTurns` 识别。

### 🔴 HIGH-2 — 在途 journal 回放丢文本+工具(content_start 未入日志)

`classifyJournalEv`(`hub.go:794-809`)白名单**不含 `content_start`**(也不含 `thinking`)。`addSubscriber` 第一段把 journal 事件喂进**与实时同一条流**给 `foldMessagesIntoTurns`(`features/claw/components/chat/fold.ts`)。但实时 fold 的 `content_delta` 分支只在 `currentTextBlock!==null` 时 append(`fold.ts:93-97`),而 `currentTextBlock` **仅由 `content_start{blockType:'text'}` 创建**(`fold.ts:73-81`);工具块同理仅由 `content_start{blockType:'tool_use'}` 创建(`fold.ts:82-91`)。**content_start 缺失 → 回放的 delta 文本无块可挂被丢,工具帧无块可 attach。** 既有 replayBuf 路径**没有**这个 bug,因为 `coalesceReplay` 原样保留 `content_start`(`hub.go:739-752`)——**journal 回放严格劣于它要取代的路径**,而修复跨标签页在途续流正是 P1 宣称要修的数据丢失路径。

**修**:把 `content_start` 入白名单并存储,或在 fold/ReadInFlightEvents 侧从 delta/tool 转换合成块边界。

### 🔴 HIGH-3 — 校验器对 HIGH-1/2 结构性失明(go/no-go 假绿)

`compareSession`(`eventlog_validate.go:99-110`)只比用户数(`countUserMsgs`)+ assistant 文本(`assistantText` 只累加 `type=='text'` 块,`eventlog_validate.go:137-141`)。工具块对二者均无贡献 → **一条丢光所有工具的 transcript 仍以 `mismatch_total==0` 通过校验**。设计 §7.4 把 `mismatch_total` 当读切 go/no-go,而它看不到真实失败模式。今晚干净影子跑给出**对读切的虚假信心**。

**修**:恢复「tool 调用名序列」维度(理想加块结构比对),soak 至 0 不符再信。

### 🟠 MEDIUM-4 — thinking 帧丢失(实时/重载不一致 + 审计价值缩水)

`thinking` 帧实时广播并由前端渲染(`fold.ts:121-125`、`agent-history.ts:253-257`),但既不在 `classifyJournalEv` 也不在 `FoldToMessages`。读切后用户实时看到的推理在历史里消失,daemon 路径却返回 thinking 块——live/reload 不一致,校验器也不报。同理 `permission_request` 入了日志(`EvPermissionRequest`)但 `FoldToMessages` 显式丢弃(`eventlog_store.go:200`),设计 §2.1 宣称的 permission 审计价值只在裸行、不在任何读/fold/校验路径。

### 🟠 MEDIUM-5 — 崩溃耐久窗口比设计「≤200ms」宽得多

两层叠加丢失:(a) 当前 delta 窗的内存 `strings.Builder`(200ms 或 4KB 封顶);(b) `writeCh` 2048 行缓冲——已入队未被 `writeLoop` 排空的行在硬崩时全丢,且**无 shutdown graceful drain/Close**(`eventlog_batcher.go` 全文无 Close 路径)。诚实最坏耐久滞后不是「≤200ms 内容」而是「最后一个 partial delta 窗 + 至多 2048 排队行」,writeLoop 落后时可达多轮。P0 影子可接受(jsonl 权威),但 P2/P3 倚赖 journal 前必须修措辞 + 加 shutdown drain。

### 🟡 LOW-6 — limitTurns=0 的 daemon/journal 分歧(真存在,今天无 live 触发)

daemon 路径 limitTurns=0 返回**全量** transcript、`hasMore=false`(`sliceWithAgentMeta`:`hasMore = limitTurns > 0 && total > limitTurns`,`bridge.go:486-494`)。journal 路径 `ReadRecentTurns`(`eventlog_store.go:126-146`)把 `<=0` 重置为 30,只取最近 30 轮,且 `hasMore = 30 < total` 对 >30 轮会话**为 true**。这是真实潜伏 parity 陷阱:读切后 >30 轮会话的无 limit 加载会返回**被截断的 30 轮历史 + 伪「加载更早」**。

**但今天零 live 触发**:三个前端初始加载**都传显式正数 limit**——claw/smart-search `HISTORY_WINDOW=100`(`features/claw/hooks/useClawConversation.ts:71`、`features/search/components/smart-search/SmartSearchPanel.tsx:55,79`)、prism `DEFAULT_HISTORY_TURNS=100`(`features/prism/hooks/usePrismChat.ts:39,295`)。`ParseLimitTurns` 仅在 `?limit` 省略时返 0(`http_handler.go:40-42`),live 前端从不省略。唯一传 0 的是 admin monitor,但它直连 `b.client.GetSessionMessages(..., 0)`(`admin_monitor.go:113`),**绕过 journal 走 daemon**。校验器用 limit=20 调两侧(`eventlog_validate.go:45,90,95`),**从不命中 limitTurns=0**——盲区仍在。

**修**:`ReadRecentTurns` 把 `<=0` 当无限(返全量、hasMore=false)对齐 daemon,或 `readHistoryFromJournal` 在 `<=0` 时短路 daemon;校验器加一条 limitTurns=0 对账用例。

### 🟡 LOW-7 — enqueue 同步兜底可致 ev_seq 落库乱序

`writeCh` 满时 `flushDeltaLocked→enqueue` 同步写第 N 行(`eventlog_batcher.go:98-106`),而更早排队的 N-k..N-1 行还在 `writeLoop` 异步排空——**INSERT 顺序 ≠ ev_seq 顺序**。读侧按 ev_seq/id 排序(`eventlog_store.go:120,142`)能容忍,无 correctness 问题;但偏离#2「有界不丢」框架漏了**乱序持久写**这一面——任何后续消费者若假设 insert-order == ev_seq-order(如增量游标按 id 追)会踩坑,P2 多写者前应明确不依赖落库顺序。

### 🟡 LOW-8 — accum map 无界 + 终态路径依赖

`accums` 仅由 `dropTurn`(`CompleteTurn` 调)清理(`eventlog_batcher.go:172-180`)。交叉核对:`CompleteTurn` UPDATE 出错也 `dropTurn`(`eventlog_store.go:97`),endTurn 必在 loop 退出时 fire,`FailTurn→CompleteTurn→dropTurn` 覆盖——泄漏风险低,但 map by-construction 无界,清理正确性依赖每条终态路径都过 `CompleteTurn`。建议加 accum-count metric/cap。

### 🟡 LOW-9 — 在途轮被计入历史窗 / 跨轮 id 单调依赖单写者

`ReadRecentTurns` 的 Count 无 status 过滤(`eventlog_store.go:131`),会把当前 running 轮的 partial 事件折进最近窗(低影响,该轮也在实时流);`ORDER BY id ASC` 跨轮正确**仅因** id 全局自增 + 会话内串行(jsonl 单写者)——P2 多副本必须重访这条潜在耦合。

---

## 4. 翻 AGENT_JOURNAL_READ 前必须先验证什么(P1 读路径今晚未实跑)

读路径默认空=daemon,今晚**零实跑**。翻开任何 feature(连 smart_search)前必须:

1. **修 `FoldToMessages` 工具块映射**(HIGH-1):wire frame → Anthropic content[](`tool_use{id,name,input}` / 顶级 `tool_result{tool_use_id,is_error}`),让 `replayHistoryAsTurns` 识别。
2. **journal `content_start`**(HIGH-2):入白名单+存储,或合成块边界,让在途回放喂对实时 fold。
3. **校验器补 tool 调用名序列维度**(HIGH-3),理想加块结构比对;soak 至 `mismatch_total` 在工具密集的 claw/prism 会话上稳定为 0。
4. **决定 thinking 策略**(MEDIUM-4):journal+fold 它,或显式接受 live/reload 不一致。
5. **修 limitTurns=0 分歧**(LOW-6):`<=0` 对齐 daemon 当无限;校验器加该用例(当前盲)。
6. **逐字节 diff 验收**:两浏览器 + 杀全标签页 reentry,在工具密集轮上 byte-for-byte diff journal vs daemon 的 `SessionMessage[]`;>30 轮会话验 limitTurns=0(经 admin 直连无效,需构造 journal 读路径用例)。
7. **金丝雀按 §9 顺序**:smart_search ONLY 先行(它最接近纯文本,风险最低),且必须含一个 >30 轮 + 一个工具密集会话。
8. (可选)batcher shutdown-drain + 修正「≤200ms」耐久措辞(MEDIUM-5)。

**在 (1)-(3) + (6) 完成前,`AGENT_JOURNAL_READ` 必须留空(daemon 权威)——正是部署留下的状态。**

---

## 5. P0/P1 是否把通往终态的路铺对了

**铺对的:**
- 真源归属反转已落地——后端经 `agent_turns`/`agent_turn_events` 拥有会话事件,工作单元 = turn(幂等/可回放/可计费/可归属),不是 session-process。这是通往 stateless executor 的正确基座。
- 表/键 replica-safe(逻辑键非进程身份),`UNIQUE(turn_id,ev_seq,created_at)` 是 P2 多写者兜底。`EventLog` interface(`eventlog.go`)让 P2(Append 额外 XADD Redis)调用方零改动,P5 saga 契约已占位。`addSubscriber` 的进程局部物(per-socket channel)是 §3.3 合法局部,非新增阻塞。

**铺歪/欠铺的(轨迹风险):**
- **耐久日志固化了 fork 的 wire 词汇。** `payload` 原样存浏览器专有帧(`tool_use_complete`/`content_start`/`thinking`,真源 `frontend-user/src/shared/types/chat.ts`),`classifyJournalEv` 硬编码 `tool_use_complete` 特例(`hub.go:794-809`),`FoldToMessages` 内嵌 fork-frame 解析(`eventlog_store.go:197-198`)。clean-room provider-agnostic executor 会发不同帧形 → 要么迁日志 schema,要么让新 executor **冒充浏览器帧**——与「零 cc-haha lineage」恰好相反。**应在 Append 边界归一化成中性 EvType payload**(如从 `tool_use_complete` 抽出 canonical `tool_use{id,name,input}`),而非存裸 fork frame。
- **P0 的 executor 接口提升被跳过。** `internal/agent/executor.go`(`Executor`/`EventSink`/`TurnInput`/`ProviderConfig` + legacy `Client` interface)未创建;`bridge.client` 仍是具体 `*agent.Client`,连 `NewJournalValidator` 都直接吃 `*agent.Client`(`eventlog_validate.go:40,44`)。这是计划里最便宜、零行为变更的一项,跳过它使 P3 从「一行 bootstrap 切换」变成「每个调用点重构」——**P3 被悄悄变贵,不是变易**。

净评:P0 把**数据基座**铺对了,但**抽象基座**(executor 接缝 + 日志中性化)欠铺,使终态更远而非更近。

---

## 6. 优先级建议(下一步)

**P0(保持现状,无需动):** 影子写正确且安全——默认 no-op、batcher 真离热路径、计费不动、ev_seq 单锁单计数、终态恰好一次、live 实测确认(822→33、ledger 匹配)。peerreview stitch 完整正确。继续跑影子。

**翻 READ 前(阻断级,必须做):**
1. HIGH-1 `FoldToMessages` → Anthropic content[] 工具块翻译。
2. HIGH-2 journal `content_start`(+ thinking,MEDIUM-4)。
3. HIGH-3 校验器补 tool 调用名序列维度,soak 至 0。
4. LOW-6 limitTurns=0 对齐 + 校验器加该用例。
5. 两浏览器/杀标签页/逐字节 diff,smart_search 金丝雀先行。

**P3/终态去险(独立有价值,趁早做):**
6. 补 `executor.go` 接口提升(P0 漏项),把 `bridge.client` 抽成 interface。
7. Append 边界归一化成中性 EvType payload,停止把 fork frame 固化进耐久日志。

**P2/P3 倚赖 journal 前:**
8. batcher shutdown-drain + 修正「≤200ms」耐久措辞 + 明确不依赖落库顺序(MEDIUM-5 / LOW-7)。
9. accum-count metric/cap(LOW-8)。
10. SUM(ledger) vs SUM(llm_token_usage where source=agent) 自动对账 + 给带外轮(memory_extract/title)补 BeginTurn/ledger(偏离#3),否则 P3 计费拆分前提不成立。

**一句话定论:** P0 影子层是干净、忠实、可长跑的正确第一步,留空 READ 的部署决策正确;但 P1 读侧对每个真实(工具)feature 都非 parity 且唯一闸门(校验器)对该失败模式结构性失明,**在 HIGH-1/2/3 修复并逐字节验证前,`AGENT_JOURNAL_READ` 必须保持为空**。同时补两项被跳过的轨迹工作(executor 接缝 + 日志中性化),否则 clean-room/provider-agnostic 终态会越走越贵。