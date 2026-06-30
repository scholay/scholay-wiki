<!-- 2026-06-27 · Web-native re-architecture blueprint. Method: 3 research dossiers + 3-way design panel (evolutionary/clean-slate/durability-first) → judge (winner: A, grafted with C's saga substrate + B's control-owned tool policy) → synthesize → adversarial critique vs code+SDK reality → finalize. 10 agents / ~1.5M tokens. Companion to REPORT.md (the diagnosis). -->

# Scholar Agent 服务 · Web-Native 重构蓝图(终稿)

> 综合裁决:以 **Candidate A 的脊柱与迁移阶梯** 为骨架(state inversion + executor seam + 每阶段可独立上线),嫁接 **C 的统一 saga 底座**(交互轮 = 退化的单步 saga)、**B 的 control-owned tool policy / subagent gating**、以及 **C 的 exactly-once / lease 严谨度**。所有 store 决策落在本仓库真实技术栈:**MySQL 8(utf8mb4)+ Redis**,不是 Postgres;executor 走 **raw `@anthropic-ai/sdk` tool-runner**(已 pin `^0.80.0`),不是 Agent SDK harness。下文逐条说明为什么这些覆盖是对的——并对每条只有「方向对、证据不足」的论断标注**待生产验证**,绝不把推测写成既成事实。

---

## 修订 v2(owner 澄清,2026-06-27 — 以下两条为强制覆盖,优先于全文任何与之冲突的措辞)

**修订 1 — 上游 provider-agnostic:绑定的是 Anthropic Messages API 协议,不是任何单一厂商,也不要求用 Anthropic 自家模型。**
本重构的稳定契约是 **Anthropic Messages API**。**不绑定 DeepSeek、不要求 Anthropic 模型**——任何「兑现 Anthropic Messages API 的上游」都可插拔(Anthropic 官方 / DeepSeek / 其他 Anthropic-兼容网关),由 `agentconfig` 单行配置 `base_url + token + 三档 model slot` 决定、运行时可切换。**全文凡出现「DeepSeek」处,一律读作「当前配置的 Anthropic-协议上游(DeepSeek 只是现在这一个实例)」**;凡出现「必须/只能用某家模型」的限制,**取消**。选 raw `@anthropic-ai/sdk` 恰恰因为它**就是** Anthropic Messages API 的协议客户端 → provider-agnostic 是天然属性,不是额外工作。CMA 仍排除,但理由更新为「它把 agent loop 托管在 Anthropic 基础设施 + 只能用 Anthropic 模型,**剥夺 provider 选择权与自有权**」,而非「因为我们锁 DeepSeek」。§9 的「DeepSeek 缓存/一致性探针」泛化为「**对当前配置 provider** 的探针」,换 provider 时 per-provider 重跑;成本模型绝不依赖任何单一 provider 的缓存行为。

**修订 2 — 这是一个全新的、完全属于你自己的 agent;cc-haha / Claude Code CLI / Codex CLI 血统彻底清零。**
本重构**不是「迁移 fork」「裁剪 fork」,而是把 `agent/src/`(cc-haha = Claude Code CLI 的 fork)整体删除、从零重写一个 clean-room、归你所有的 agent**。最终产物**不得残留任何 cc-haha / Claude Code CLI / Codex CLI 的代码、命名、子进程、bundled CLI、jsonl 会话设施或目录约定**(`~/.claude/`、`--resume`、`src/memdir/`、手搓 denylist 等一律不留)。容器/模块不再叫 `scholar_agent (cc-haha)`;新执行层是中性命名的 `agent-executor/`,其 turn-loop 是你自己写的。**澄清边界(避免误伤):** 依赖 `@anthropic-ai/sdk`(Anthropic 官方 **API 客户端库**,即 Messages API 的 wire-protocol SDK)与 `@modelcontextprotocol/sdk` **不算** cc-haha 血统——它们是标准协议库、不是被 fork 的 CLI harness;被清零的是「Claude Code / Codex 那套 CLI 程序及其 jsonl/REPL/记忆设施」,不是「说 Anthropic 协议」这件事本身。全文凡说「换 fork / fork 仍执行」,读作「旧 cc-haha 与新自有 executor 在 `bridge.client` seam 后于迁移期短暂并存,P6 旧 cc-haha 删尽、零残留」。

---

## 0. 为什么 web agent ≠ 本地 CLI agent(重构的纲领)

这是整套重构的组织原则,也是诊断出的 root-cause debt 的单一根因:**Scholar 保留了 single-user CLI 模型(agent 拥有本地 jsonl、单写者、长生命周期 per-session 进程),然后在它之上硬栓多租户。** 所有 CRITICAL/HIGH 症状都是这一个错误假设——"agent 进程拥有状态"——的下游。

一个本地 CLI agent 和一个多租户 web agent 是**两种不同的架构,不是同一个东西换个规模**。八个轴,左列是 fork 今天的假设、右列是 web-native 必须去的极点,中间是这个项目今天在哪条代码上踩坑:

| 轴 | 本地 CLI(fork 的假设) | Web-native(目标) | 今天的债在哪条代码 |
|---|---|---|---|
| **状态归属 State ownership** | agent 拥有本地 jsonl;一个写者 | backend 拥有 event-sourced 日志(datastore);executor 跨轮无状态 | `repository.go` 只存 `user↔session_id` 指针;真源是容器内 jsonl,backend 当黑盒,每次读历史都 round-trip 到 daemon |
| **进程模型 Process model** | 长生命周期 REPL;`--resume` 读 jsonl | 无状态 turn 执行;任意 worker 跑任意 turn | `hub.go newHub` 给每个 `(feature,session)` dial 一条长连 upstream WS;loop 在 agent 里 |
| **信任/隔离 Trust+isolation** | 信任的机主 | 不可信租户 → per-session sandbox | `ws.go decidePermission` 只是 logical cwd;一容器一卷;claw 有 Bash;Bash 关了 `Read/Glob/Grep` 仍能横向遍历到别租户 jsonl |
| **传输 Transport** | 单终端 viewer | 多 tab/多设备、可恢复流 | `hub.go` 已经在 fan-out——但 `replayBuf`/`inFlight`(hub.go:61-65)只在内存 |
| **持久 Durability** | 崩了重跑 | 续流 / 不丢数据 | 在途助手内容只活在 `hub.replayBuf`(RAM);subs→0 或 daemon 崩就永久丢。peerreview per-draft 记账而非 per-round |
| **记忆/密钥/身份 Memory+secrets+identity** | 机器全局(`~/.claude`、env key) | per-tenant | per-user 记忆靠 `user_memory_blocks` + 首条前缀硬接;fork 的 `src/memdir/` 在 web 流里读到空 |
| **成本 Cost** | 机主自付、不计量 | 计量/配额/幂等 | `bridge.go:70 tokenWatermarks` 是**内存**记账水位 → 重启就重记一窗 |
| **调度 Scheduling** | 用户自己交互跑 | server 排队/限流/扇出 | peerreview 已 server-side 排队;其余同步 per-turn |

**纲领性结论(整篇蓝图的脊柱):** web agent 的工作单元是 **turn**(幂等、可回放、可计费、可归属),不是 **session-process**。修法是**反转状态归属**(backend 拥有真源)+**让执行无状态**(executor 被喂历史、吐事件、不持有 jsonl)。其余每一节都是这一句话在某个平面上的展开。

---

## 1. 目标架构总览(control / execution / state 三平面)

Go backend = **control plane 兼 state plane 真源持有者**;TS executor = **stateless execution plane**。owner 已识别的 pluggable seam(`Bridge` 在 bootstrap 经 `New(client, repo)` 注入 `agent.Client`)被完整保留——换 executor 只触 `internal/agent` + `agentbridge/{bridge,hub,ws,http_handler}`,**4 个 `spec.go` 一字不改**(smartsearch / claw / prism / peerreview spec)。

```
┌──────────────────────────── CONTROL PLANE (Go) ───────────────────────────────────┐
 browser ──HTTP/WS──► cmd/server (gin) routes_user.go                                 │
 (N tabs/             → smartsearch/claw/prism/peerreview handlers  (spec.go 不变)     │
  N devices)              │                                                            │
                          ▼  internal/agentbridge (the seam)                          │
                   ┌── FeatureBridge methods (spec.go 不变) ──────────────────────┐    │
                   │  ws.go     HandleWS (ws-ticket 鉴权保留)→ 订阅 Projector       │    │
                   │  hub.go  → Projector: 扇出退化成「持久日志的投影」             │    │
                   │  bridge.go PreUserMessage 配额 / OnMessageComplete usage 钩子  │    │
                   │  turncoord.go  NEW: TurnCoordinator(开/闭/租约 turn)          │    │
                   │  eventlog.go   NEW: append-only 会话事件日志读写              │    │
                   │  saga.go       NEW: 统一 durable 编排底座(peerreview 骑它)    │    │
                   │  agent/client.go  EXECUTOR SEAM: enqueue turn / stream events │    │
                   └──────────┬──────────────────────────────────────┬───────────┘    │
└──────────────────────────────│──────────────────────────────────────│────────────────┘
        ┌──────── STATE PLANE (MySQL 8 utf8mb4 + Redis) ──────┐   ┌─── EXECUTION PLANE (TS, stateless) ───┐
        │ MySQL                                               │   │ agent-executor (替换 agent/src/ fork) │
        │  agent_sessions      (映射;保留)                     │◄─►│  raw @anthropic-ai/sdk tool-runner    │
        │  agent_turns         NEW: turn 账本 + 租约 + 幂等键    │ 历史│  worker: XREADGROUP 拉 turn → 执行     │
        │  agent_turn_events   NEW: event-sourced 会话日志       │ 喂入│  - 被喂入 history,不存 jsonl          │
        │  agent_billing_ledger NEW: 幂等 per-turn 计费          │   │  - 跑 loop vs 上游(ANTHROPIC_BASE,可换)│
        │  agent_saga_steps    NEW: 编排 per-step 进度          │   │  - 吐 typed events → 日志 append      │
        │  user_memory_blocks  (保留 + version 列)              │   │  - per-turn bubblewrap sandbox + 出口代理│
        │ Redis (独立 DB / 独立实例, 见 §2.2)                   │   │  MCP: minicod over stdio(预装保留)    │
        │  Stream agent:stream:<sid>  (live 扇出热路径)         │   └────────────────────────────────────┘
        │  Stream agent:turns         (turn 队列, consumer group)│
        │  HASH   agent:wm:<sid>      (计费水位, Lua CAS)        │
        │  ws_ticket:<tok> (保留) / turnlock:<sid> (busy 锁)    │
        └──────────────────────────────────────────────────────┘
```

**4 个 feature 各落在哪(代码 shape 不变,底下 executor 与编排换):**
- **smartsearch**:单 session、MCP-only、WS turn、可吃 fast slot。最薄(~55 行 handler)→ **首个切到新 executor 的金丝雀**。
- **claw**:多 session、`AllowBash=true`、文件上传 + MinIO artifact 收割 + library 引用注入 cwd。**bubblewrap 隔离最受益**。
- **prism**:单 session per project、`network_none` LaTeX 沙箱、prepare→turn→apply/reject diff。沙箱变成一个 `compile` profile。
- **peerreview**:server-driven、`service.go` 2119 行手搓多 reviewer。**骑 §5 的统一 saga 底座**,不走 WS pipe。

**一次用户 turn 端到端(smartsearch/claw/prism 的正典路径):**

```
1. POST /<feat>/session/ws-ticket    → IssueWSTicket(wstoken.go 不变:OwnsSession + 30s 一次性 Redis 票)
2. WS 升级 ?ws_token=...              → HandleWS 消费票(ws.go authenticateWSRequest 不变)
3. Projector.Subscribe(feature, sid) → 把本 socket 注册为「事件日志的读者」
     • 入会即回放:从 agent_turn_events 读在途 turn(不是内存 replayBuf)→ 跨副本可见、崩溃可恢复
4. 浏览器发 {type:user_message}:
     a. bridge.Touch + PreUserMessage 配额(hooks.go → vip,不变)
     b. TurnCoordinator.BeginTurn(sid, clientTurnId):
          - INSERT agent_turns(status=queued),幂等于 (session_id, client_turn_id)
          - append {turn_started} 事件(用户原文此刻已落库,取代内存 inFlightUserText)
          - XADD agent:turns(供 executor 消费)
     c. 向其余 tab 广播 {user_echo}(经 Redis,取代 hub.go echoToOthers)
5. 一个 stateless executor 用 XREADGROUP 租到该 turn:
     → 组装 turn 输入 = (从事件日志折叠出的 history) + system prompt + 用户消息
     → 跑 loop vs DeepSeek;每个 model/tool 事件 → append 到 agent_turn_events + XADD agent:stream:<sid>
6. Projector tail agent:stream:<sid> → 扇出给所有订阅 socket(content_delta 合并同今天)
7. message_complete → CompleteTurn:幂等计费(agent_billing_ledger,key=turn_id)+ 释放锁 + 派发 fast-tier 记忆抽取
8. 任意时刻重连/第二设备 → 回到 step 3,从持久日志回放 → 零数据丢失,且与发起它的副本无关
```

**关键反转在 step 5/6:事件先 append 到 MySQL(并 XADD 到 Redis 热路径),扇出才发生。** 扇出从此是"持久日志的缓存",`replayBuf` 数据丢失 bug 从根上消失。

---

## 2. 状态平面:后端拥有真源

取代:jsonl 黑盒(真源)+ 三处进程内状态(`hubs` / `tokenWatermarks` / peerreview broker)。

### 2.1 会话历史 + 在途轮 → `agent_turns` + `agent_turn_events`

```sql
-- 0071_agent_turn_journal_fields.sql   (utf8mb4 强制,见 memory: migration-utf8-charset)
CREATE TABLE IF NOT EXISTS agent_turns (
  id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  agent_session_id VARCHAR(64) NOT NULL,
  feature_key     VARCHAR(64) NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  seq             INT UNSIGNED NOT NULL,        -- per-session 单调轮号
  client_turn_id  VARCHAR(64) NOT NULL,         -- 幂等键(客户端/编排器给)→ exactly-once(graft C)
  role_user_text  MEDIUMTEXT,                   -- 用户原文(已 strip、未注入)
  status          VARCHAR(16) NOT NULL,         -- queued|running|complete|failed|aborted
  executor_id     VARCHAR(64),                  -- 哪个 worker 租了它(graft C: lease)
  lease_until     DATETIME(3),                  -- 租约过期 → 重排队(崩溃检测)
  fence_token     BIGINT UNSIGNED NOT NULL DEFAULT 0, -- 单调 fencing token(见 §7 split-brain)
  model_main      VARCHAR(64),
  attempt         INT NOT NULL DEFAULT 0,       -- 重试计数(graft C: max-attempt → DLQ)
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at    DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 0072 indexes: UNIQUE uk_session_client_turn(agent_session_id, client_turn_id);  -- exactly-once
--               UNIQUE uk_session_seq(agent_session_id, seq);
--               KEY idx_status_lease(status, lease_until);   -- reconciler 扫过期租约

CREATE TABLE IF NOT EXISTS agent_turn_events (
  id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,  -- 全局单调
  turn_id         BIGINT UNSIGNED NOT NULL,
  agent_session_id VARCHAR(64) NOT NULL,
  ev_seq          INT UNSIGNED NOT NULL,        -- turn 内序号(回放顺序 + Last-Event-ID)
  ev_type         VARCHAR(32) NOT NULL,         -- user_message|content_delta(合并)|tool_use|tool_result|message_complete|error
  payload         JSON NOT NULL,                -- 帧体,直接沿用今天发给浏览器的 frame shape
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 0072 indexes: UNIQUE uk_turn_seq(turn_id, ev_seq);  KEY idx_sid_id(agent_session_id, id);
```

- **历史读**(`GetSessionMessages`):从 `agent_turn_events ORDER BY id` 折叠成 Anthropic `messages[]`,不再 round-trip daemon、不读 jsonl。`bridge.go` 的 `sliceRecentTurns` 分页逻辑保留,改读 MySQL(`WHERE turn_id >= ?` 窗口,已按 turn 索引)。**这同时结构性修掉 memory:agent-history-reentry-staletime-bug**——历史永远持久在场,不再依赖 staleTime 戏法。
- **在途轮 / 迟到续流**(active data-loss bug,memory:agent-multipresence-hub 提到的死代码根):`addSubscriber` 的"回放在途"从读 `replayBuf` 改为 `SELECT ... WHERE turn_id=<running> ORDER BY ev_seq`。**崩溃中途丢不了任何东西**——partial 助手内容在它产生的那一刻就持久(有界 flush 滞后,见 §2.1.1)。
- **content_delta 合并**(`coalesceReplay`,hub.go:273)移到**写侧**:deltas 在 Redis 累积、每 ~200ms/4KB flush 一行到 `agent_turn_events`,所以日志是 O(content-blocks) 不是 O(tokens)。Redis 的 `agent:stream:<sid>`(capped Stream)是**热**扇出路径,MySQL 是**持久**回放路径。

#### 2.1.1 容量 / 保留 / 分区(这表会是全系统写最重、读最杂的表,必须先规划)

`agent_turn_events` 同时承载:executor 写(每 turn 多行 coalesced delta + 每个 tool_use/tool_result 一行)、live 回放读(每次重连/多设备)、历史分页读、admin 监控读。一条重 claw/prism turn 可产生几十行(多 tool round)。规划:

- **行量上界估算公式(部署前先算,别拍脑袋上线)**:`日行数 ≈ 日活 turn 数 × (coalesced_delta 行 + tool 行)/turn`。coalesced_delta 行受 §2.1 的 200ms/4KB batcher 封顶为 O(content-blocks);tool 行 = 该 turn 的 MCP/Bash 调用数。用真实流量的中位 turn 形状代两个变量,得出月增行数与磁盘增量,作为分区与保留参数的输入——不要凭直觉设阈值。
- **保留**:`agent_turn_events` 是 verbose 真源,但 ≥ N 天前的**已完成** turn 对在线读价值低。按 `created_at` 月份**RANGE 分区**(MySQL 8 原生),后台任务 `DROP PARTITION` 老月份(迁移红线只禁 `DROP TABLE` / 破坏性 alter;`DROP PARTITION` 是有意保留操作,但仍要在迁移脚本里做成幂等的「分区不存在才建」+ 独立的归档 job 删,不混进 schema-sync)。需长期审计的(peerreview/合规)在 turn 关闭时把**折叠后的精简 transcript** 落到一张窄归档表或 MinIO,而不是靠保留整张事件表。
- **读隔离**:历史分页读 `WHERE turn_id BETWEEN ?` 走 `idx_sid_id`;admin 监控读同表但限定 `agent_session_id` + 时间窗,不全表扫。**绝不让 live 热路径读 MySQL**——live 永远走 Redis Stream(§2.2),MySQL 只在「Stream 已 trim 掉的迟到回放」与「历史」时被读。
- **写隔离**:per-delta 绝不进 MySQL(会熔毁);只持久 coalesced 行与 turn 终态。这把 MySQL 写从 O(tokens) 压到 O(content-blocks)。

### 2.2 live 扇出总线 → Redis Stream `agent:stream:<sid>`

取代 `bridge.hubs sync.Map`(bridge.go:47)+ per-session 长连 upstream WS。每个 `(feature,sid)` 一条 Stream,executor 事件 XADD、每个 `HandleWS` 订阅者是从自己 last-id 起的 `XREAD BLOCK` 消费者。

- **多端同步** = 一条 Stream N 个消费者(今天的 hub fan-out,现在持久 + 跨副本)。`user_echo`/`busy`/合并 delta 同今天的合成帧,只是发到 Stream 而非内存 `subs` map。
- **重连/迟到/多设备** = 消费者带 Last-Event-ID(= stream entry id 或 `ev_seq`)→ 先 `XRANGE` 补、再 `XREAD BLOCK` tail;早于 MAXLEN 的缺口从 `agent_turn_events` backfill。**hub.go 那套"补帧与注册同一把锁内、不丢不重"的舞蹈(hub.go:202-229)整段消失**——每个消费者读同一条全序日志、从自己 offset 起,天然 exactly-once 无锁。
- ⚠️ **eviction 正确性是硬约束,不只是「内存卫生」**(这是 reviewer 点出的真隐患):现有 Redis 是 **512MB maxmemory + allkeys-LRU**(共池给 session cache + API-key cache,见 CLAUDE.md)。**把 agent 持久/半持久结构放进一个 allkeys-LRU 池是错的**——内存压力下 Redis 会**逐出在途的 `agent:stream:<sid>`**,live 扇出静默截断(MySQL 仍持久,但 live 路径断、订阅者要 fallback 到 MySQL backfill,慢且可能丢未 flush 的 <200ms 窗口)。**强制隔离**:agent 的 Stream / 队列 / 水位 / 锁全部放到**专属 Redis 逻辑 DB(`SELECT n`)或专属实例**,该实例策略设为 **`noeviction`**(让 producer 在真满时显式失败而非静默逐出),并对 `agent:stream:*` 设 `XADD MAXLEN ~ 1000` + turn 完成时 per-stream TTL(取代 hub.go:302 的 slow-subscriber 丢弃逻辑)。session/API-key 缓存留在原 allkeys-LRU 池——两类数据**不可共享同一逐出策略**。

### 2.3 计费水位 → `agent:wm:<sid>`(Redis Lua,迁移期)→ `agent_billing_ledger`(收敛态)

这是裁决里最重要的一处**双段嫁接**(B/C 都只是把算法搬进 Redis;A 主张直接溶解成 turn_id 幂等;正解是**先 C 后 A**,且两段必须落在**不同迁移阶段**——见 §8 P1/P2 的重排序):

**迁移窗口(fork 仍是 executor,仍上报 session 累计 usage):** 把 `bridge.go:70 tokenWatermarks sync.Map` + `watermarkMu`(bridge.go:76)搬到 Redis HASH `agent:wm:<sid> {input,output,cacheRead,cacheCreation}`,`accrueTurnUsage`(bridge.go:108)的 read-modify-write 用**一段 Lua 单 round-trip 原子完成**。算法逐字保留(CLI 重启检测→水位归零;delta≤0→幂等跳过;对账补差行),只是 store 换成 Redis。重启不再丢水位 → 消除"重启后首帧按全量重记一窗"。这是 store swap,不是 redesign。

**收敛态(stateless executor 上线后,executor 上报 per-turn usage):** "累计水位 vs delta" 的精巧只因为 daemon 报 session running total 且水位在内存才存在。一旦 backend 拥有 turn 且 executor 直接报 **per-turn** usage,计费变成 trivially 幂等——**按 turn_id 记一次**:

```sql
CREATE TABLE IF NOT EXISTS agent_billing_ledger (
  turn_id         BIGINT UNSIGNED PRIMARY KEY,   -- 幂等键 = turn
  agent_session_id VARCHAR(64) NOT NULL, user_id INT UNSIGNED NOT NULL, feature_key VARCHAR(64) NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0, output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read BIGINT NOT NULL DEFAULT 0, cache_creation BIGINT NOT NULL DEFAULT 0,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`INSERT ... ON DUPLICATE KEY UPDATE`(重放 no-op),水位 diff 机器整套删除。account book 仍是 `llm_token_usage` via `recordAgentTokens`(hooks.go:63,memory:ai-token-billing-map 的"唯一 decrement 点");daily-cap 仍走 `vip.AddUsage`。

> **铁律(reviewer 点出的真排序风险,必须落在迁移阶段上,不只口头):** turn_id 幂等账本要把 **session 累计总数正确拆成 per-turn 行**,**必须**有「该 turn 之前的累计」这个减数——而在 fork 仍上报 session-cumulative 的窗口里,那个减数**只来自水位机器**。因此:**ledger-idempotent 计费不能在 watermark 仍是唯一拆分手段、且尚未搬进 Redis 时开启。** 正确顺序是 §8 的 **P1 只搬读路径 + 水位仍权威计费 → P2 把水位搬进 Redis Lua(此时计费语义不变,仍是累计-减-delta,只是 store 跨副本)→ P3 executor 上线、改报 per-turn → 此刻才翻到 turn_id 幂等账本(因为现在有真的 per-turn 数,不再需要拆累计)**。绝不在同一阶段同时(a)动计费语义和(b)换 executor。

### 2.4 per-tenant 记忆 → 保留 `user_memory_blocks`,触发器解耦

`user_memory_blocks` 是唯一已经做对的多租户件,保留。⚠️ **先核对当前分支再动**(reviewer 点出可能 stale):memory:memory-and-prism-naming-to-agent 记录抽取**已搬到 agent 容器**(`buildMemoryExtractFrame → WS extract_memory → IngestFromAgent`),且 `recordOutOfBandTokens` **已按 `kind=memory_extract` 计费**——所以 memory:ai-token-billing-map 的 R2 缺口在本分支**可能已闭合**。重构动作是**把同一条抽取迁移到「turn 关闭后 enqueue 一个 fast-tier `memory_extract` turn」的新执行模型上**(崩在答案与抽取之间只留一个 `queued` 抽取轮稍后被捡,不丢),**沿用现有的 `kind=memory_extract` 入账**,**不是新增一条计费**——上线前先 `grep recordOutOfBandTokens` 确认它已在算,避免双计。注入仍走 system-prompt 前缀(`MemoryBlocks`,bridge.go:183),Redis 90s 冷却、`IngestFromAgent` allow-list 不变。**graft B/CMA:加 `version` 列 + 软删**,使编辑可审计/可回滚(versioned + redactable memory store)。fork 的 `src/memdir/` 随 fork 删除(web 流里本就读空)。

### 2.5 编排进度 → `agent_saga_steps`(见 §5)。 2.6 `agent_sessions` 几乎逐字保留(映射、owner 绑定 `uk_owner`、多 session、`prompt_injected`)——它不再是唯一持久的东西;`prompt_injected` 在注入移到 executor-call 时变 vestigial,迁移期可留。

---

## 3. 执行平面:删尽 cc-haha,从零自建无状态 turn-executor(provider-agnostic)

### 3.1 选型:**raw `@anthropic-ai/sdk` tool-runner**,不是 Agent SDK harness

这是对 Candidate A 默认选择的**蓄意覆盖**。先把三件事的**证据等级**摆清楚——结论稳,但理由要分「已证实」与「待验证」:

- **【已证实】两个目标都 honor `ANTHROPIC_BASE_URL`** → 都能打**任意 Anthropic-兼容 endpoint**(DeepSeek 是当前 `.env` 里这一个实例;Anthropic 官方端点、或其他 Anthropic-兼容网关同样由 `agentconfig` 配上即用)。Anthropic SDK 文档明确 `base_url` / `ANTHROPIC_BASE_URL` 是一等参数。所以**上游厂商不是决定项**——契约是 **Anthropic Messages API 协议本身**,provider 是 `agentconfig` 里的一行可切换配置(见修订 v2 修订 1)。
- **【已证实】CMA(Managed Agents)不可行。** Anthropic Managed Agents 在 Anthropic 自己的编排层跑 Anthropic 模型、用 hosted container,**不接受 `ANTHROPIC_BASE_URL` 改上游**——对 DeepSeek 上游是 non-starter。只偷它的设计模式(typed event-stream / agent-session-environment split / substitute-at-egress vault / versioned-redactable memory / outbound-polling self-hosted worker),不采用它本身。(注:CMA 的 hosted code-exec container 规格是 **1 CPU / 5 GiB RAM / 5 GiB disk**——这是 CMA 容器的数,**与本方案无关**,在此仅澄清,避免被误植到别处。)
- **【已证实】raw SDK 让 TS 真正无状态。** `@anthropic-ai/sdk@^0.80.0` + `@modelcontextprotocol/sdk@^1.29.0` 已是 dependency(`agent/package.json` 确认)。raw tool-runner 的 transcript 就是 `messages[]` 数组——backend 100% 拥有状态,想放哪放哪(Redis Stream / MySQL),粒度自定(per content-block / per tool-call / per turn)。这正是 brief 要的"TS 层成为 genuinely stateless turn-executor"。
- **【待验证 / 不作为决策支点】拒绝 Agent SDK harness 的「子进程写 JSONL」机制。** 我曾断言 `@anthropic-ai/claude-agent-sdk` harness spawn 一个 bundled `claude` CLI 子进程、子进程总是先写本地 JSONL、`sessionStore` 只是 best-effort mirror、起步 ~1GiB RAM。**这条在权威 Anthropic 文档里我无法逐条证实**(权威材料只稳定记载两个面:raw `@anthropic-ai/sdk` tool-runner 与 hosted CMA),且我先前给的资源数字实为 CMA 容器规格的误植——**已删除**。**因此这条不再作为否决 Agent SDK 的论据。** 真正稳的否决理由只有正面那条:**raw SDK 让 backend 完整拥有 `messages[]` 状态,这本身就达成了 brief 的核心目标(溶解 jsonl 单写者墙),无需依赖任何关于 Agent SDK 内部子进程行为的断言。** owner 明确 "willing to migrate / rewrite the agent loop",raw SDK 是最直给的实现。**P3 落地前必须做的 due-diligence**:对照当前 `@anthropic-ai/claude-agent-sdk` 的 hosting 文档,实测它能否在不写本地持久 transcript、不 spawn 重子进程的前提下满足无状态要求——若能,它可作为「自管 tool loop 太累时的 documented fallback」;若确实强制本地持久,才落实为否决。**不在缺证据时把推测当事实写进决策。**

**代价(诚实):你拥有 tool loop 本身,永远。** 要自己实现 `while(stop_reason==='tool_use')` 循环、流式 partial-block 累积、Minicod MCP client 生命周期、tool allow/deny gate、interrupt/cancel、claw 的 image/file 处理。但这是**有界的一次性工作(~300 行 + tools/),换掉 806KB fork 上永无止境的 denylist drift**(debt #5)。Agent SDK 作为 documented fallback 记着——仅当 raw loop 的 context compaction / prompt-cache shaping 证明太难自管时再回退(且回退前先按上条做完 hosting 文档 due-diligence)。

### 3.2 新 executor:`agent-executor/`(替换整个 `agent/src/`)

```
agent-executor/
  worker.ts      — XREADGROUP loop:租 turn(lease)→ 执行 → ack/requeue
  turnRunner.ts  — agent loop:messages.stream() with tools;吐事件
  tools/         — Read/Write/Edit/Glob/Grep,全部限定在 sandbox cwd
  mcp.ts         — Minicod MCP over stdio(预装保留)
  egress.ts      — 出站全走代理;密钥在边界替换(§6)
  models.ts      — tier map:cheap=HAIKU slot / strong=SONNET|OPUS slot(DeepSeek)
```

**如何无状态:** worker 每次从 control 收全量 turn 输入(messages、system prompt、tools allow-list、model tier、sandbox profile),跑一轮、吐事件、退出。没有 `~/.claude/projects`、没有 `--resume`、没有 jsonl。历史由 Go 从 `agent_turn_events` 折叠后塞进 turn payload(大历史可由 worker 经签名只读端点回取,但 Go 决定上下文里放什么)。`agent.Client` 的 `CreateSession`/`GetSessionMessages`/`PatchSession` 要么变 backend-local(历史在 MySQL),要么留作迁移期兼容空操作;`CreateSession` 退化成"分配一个 sandbox 句柄"。

### 3.3 打 Anthropic-协议上游(provider-agnostic)+ 模型分层

`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` 传给 SDK。`agentconfig`(admin 单行 provider/model 配置、异步 push、`push_status`)继续工作——改 push 到 executor 的 config 端点而非 fork 的 `/api/providers`;`agent.Client.PushConfig` 路径保留。3 个 slot(`.env` 里 `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`,运行时由 agentconfig 填)即分层:

- **fast(haiku slot)** → 记忆抽取、session/project 标题、peerreview JSON 评分重试、methodology/subagent、status 备注。
- **strong(sonnet/opus slot)** → 四个 feature 主推理轮 + peerreview chief 决策。

tier 是 turn 上的一个字段(由 control 按 call-site 定),不是 `set_runtime_config` runtime override(那是 CLI-process 假设)。peerreview 的 `fastModel()`/`mainModel()` 意图直接映射。

> ⚠️ **prompt caching:这是 UNCERTAIN 项,**全程当成「待 week-1 探针验证的假设」,**不写成既成事实、绝不让成本目标依赖它**(reviewer 点出我先前 §3.3 措辞过自信)。已知的稳定事实只有:**Anthropic 协议侧**的缓存语义是 `cache_control` 断点 + `usage.cache_read_input_tokens`(claude-api skill 权威记载)。**DeepSeek 的 Anthropic-兼容 endpoint 是否、以及如何兑现缓存折扣,本仓库尚无第一手证据**——它**可能**做自动 prefix 缓存、**可能**忽略 `cache_control`、字段名**可能**是 `prompt_cache_hit_tokens` 也**可能**不是。**这些一律标为「假设,见 §9 week-1 探针 #1」。** 但无论 DeepSeek 怎么实现,有一条架构纪律**无成本且只有好处,先做**:让每个请求结构保持 `[字节稳定的 system prompt + per-user memory block + tool defs]` 在最前、易变 turn 内容在后;**绝不**重排记忆块顺序、绝不重写早期轮、绝不在顶部注时间戳。这条对 Anthropic 缓存确定有效、对任何「前缀稳定才命中」的实现也有效,是 strictly dominant 的写法。**命中与否一律用探针实测的 usage 字段验证,不凭假设。**

### 3.4 MCP / tools / permission(control-owned,graft B)

- **MCP**:minicod 预装 executor 镜像(`preinstalled-mcp.json` 带过去),over stdio。
- **tool 策略 = control-owned 单一真源(graft B 的最佳隔离点):** `FeatureSpec.specDeny()` / `SessionDisallowedTools()` 仍是真源,**改为 allow-list per turn 传给 executor**;手搓 fork denylist(debt #5)删除。关键:把 `ws.go:231 decidePermission`(path-fence、MCP-allow、Bash-by-AllowBash、deny-first)的**判定保留在 Go**,作为 SDK loop 的 `canUseTool` 回调经 control channel 解析——**连 subagent(Task/Agent)的 tool 调用也路由经 `decidePermission`**,从而消除今天 ws.go:297 的"subagent 绕过 guard"caveat。一旦 §3.5 的 bubblewrap 环在 prod 验证通过,Task/Agent 才**安全地**放开(在此之前仍 deny,与 memory:peerreview-skills-redesign 的红队禁令一致)。
- **permission 留在 Go**,是 security command-and-control,绝不下放 executor。executor 吐 `permission_request`,backend turn driver 用 `decidePermission` 应答(同今天 `hub.upstreamLoop`)。`PermissionAuto`/`PermissionPassthrough` 不变。

### 3.5 per-session sandbox 隔离(修 HIGH debt #2)

这是花真功夫的一处,因为 logical-cwd 是系统最坏的洞。依据 dossier:**bubblewrap 是这个威胁模型的对的原语**(租户是认证付费会员,最现实攻击是 prompt-injection 外泄;data plane 已网络不可达 mysql/redis/minio,compose 已 `cap_drop ALL`)。

- **per-turn(或 per-session 暖池)bwrap jail**:tmpfs `/`、`--bind <session-cwd> /work --chdir /work`(只挂本租户 cwd)、`--ro-bind` 只读 skills 目录(prism-add/peerreview-add/claw-add)、`--proc /proc --dev /dev`、`--unshare-all`、`--die-with-parent`、seccomp filter、`PR_SET_NO_NEW_PRIVS`、cap-drop。
- **同时关掉 Bash 和 Read/Glob/Grep 横向遍历**:它们都在同一 mount ns 里解析路径 → 跨租户 jsonl read 变成**物理不可能**而非仅 permission-denied。logical `decidePermission` 降级为 defense-in-depth 第二墙。
- **出口**:`--unshare-net`,出站只经 egress 代理(allowlist:Minicod + DeepSeek + 必要 WebFetch)。prism 保持 `network: none`(prism_tex 已 compose `network_mode: none`,泛化成 `compile` profile)。
- ⚠️ **prod-only,dev 测不了**:bwrap 被本地 Docker Desktop 的 LinuxKit kernel 挡(unprivileged userns)。代码路径 `SANDBOX_MODE=bwrap|none` 守卫,只在真 Linux prod / Linux CI 验证。**Ubuntu 24.04+ 额外坑**:AppArmor restricted-userns 是独立于 `unprivileged_userns_clone` sysctl 的第二道闸 → 需 AppArmor profile(优先于 `chmod u+s bwrap` 这个更弱的 setuid 方案)。week-1 必须在真 prod 内核上 `bwrap --unshare-all --ro-bind / / true` 冒烟。**因为它本地不可测,§8 P4b 把它做成一个独立、可单独回滚、与 sticky-removal 解耦的阶段(见迁移路径)。**

---

## 4. 传输平面:可恢复流 + 多端同步 = 事件日志的投影

`hub.go`(655 行内存 Hub)塌缩成纯读 Redis Streams + MySQL 的 **Projector**。语义保留、substrate 替换:

| hub.go 今天(内存) | Web-native(持久投影) |
|---|---|
| `bridge.hubs sync.Map`(扇出注册表) | Redis Stream `agent:stream:<sid>`(隐式,无 map);任意副本 `XREAD` |
| `replayBuf [][]byte`(在途轮) | `agent_turn_events`(持久)+ Stream `XRANGE`(迟到回放) |
| `inFlight bool` | `turnlock:<sid>` Redis 锁 + `agent_turns.status=running` |
| `inFlightUserText` | `agent_turns.role_user_text` |
| `subs map[*subscriber]` | N 个 `XREAD BLOCK` 消费者 |
| `broadcastAgent` | `XADD agent:stream:<sid>`(+ MySQL append) |
| `userEchoFrame`/`busyFrame` | 同合成帧,发到 Stream;`user_echo` 直接是 journaled `user_message` 事件 → 每个 tab 从日志渲染,无内存合成 |
| `coalesceReplay` | 写侧 batcher,落库前合并 |

- **修掉 active data-loss bug(§HIGH#3):** partial 助手内容在产生瞬间即持久(有界 ≤200ms flush 滞后,见 §9 诚实代价),"最后一个 tab 中途关闭"不再撕掉在途轮。**且跨副本工作**——内存 hub 永远做不到。
- **重连/迟到/多设备**:订阅者读 `agent_turn_events WHERE turn_id=<inflight>`(持久),再从 Stream 当前 offset tail → 天然 exactly-once 无锁。
- **busy 锁**:`turnlock:<sid>`(`SET NX PX`)+ `agent_turns` 唯一约束 + "每 session 无第二 running turn" 检查;跨副本正确(今天两副本会都以为空闲)。对应 memory:agent-multipresence-hub 的 inFlight busy 机制,现在持久化。
- **ws-ticket 鉴权逐字保留**(`wstoken.go` 30s 一次性 GETDEL;裸 JWT 回落仍移除,memory:auth-token-single-source)。Redis-backed,本就副本安全。
- slow-client 背压(`subOutBuffer`/`frontWriteDeadline`)留在 Projector per-subscriber——**那确实合法 process-local**(它就是 socket 本身),丢了只掉一个慢 socket、不丢数据。

---

## 5. 多 Agent 编排:一等公民的 durable 底座

这是 owner "including multi-agent orchestration" ask 的落点,也是裁决里**从 C 嫁接的最优统一**:**交互轮和编排步用同一 substrate——smartsearch/claw/prism 是退化的单步 saga**,不是 A 那种 bolt-on `orchestrator.go`。代价极低,因为脊柱里已经有 turn 队列 + 步表。

peerreview 今天是 2119 行手搓:goroutine + 串行 `chatWithRetry` + 内存 `StreamBroker`(service.go:117)+ **per-draft 记账**(`compute_state` 单粗列,model.go:70)。崩在 gamma 中途 → `ReconcileStaleOnBoot`(service.go:195)**从头重跑** methodology+alpha+beta+gamma(debt #4)——而 `peer_review_reports`(`UpsertReport` OnConflict)其实**已持久每个 reviewer 的产出**,真 bug 是 reconcile **忽略了那些已落库的行**。

### 5.1 先给一个零改架构的廉价 interim 修(reviewer 正确指出:saga 重写之前应有更轻的止血)

**P0/P1 阶段就能单独上线、不依赖任何新表**:让 `ReconcileStaleOnBoot` / `runReviewBackground` 在重跑每个 reviewer 前**先查 `peer_review_reports`**——已有该 (submission, reviewer) 行就跳过,只重跑缺的 + chief。这把 debt #4 的「整篇重烧」降到「只补缺口」,**零迁移、零新引擎**,作为 saga 泛化(§5.2)落地前的止血。saga 底座仍是终态(它给的是通用 lease/DLQ/流式投影,不只是 resume),但不必等它才止血。

### 5.2 substrate:`agentbridge/saga.go` + `agent_saga_steps`(终态)

```sql
CREATE TABLE IF NOT EXISTS agent_saga_steps (
  id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  saga_id       VARCHAR(64) NOT NULL,        -- = peer_review submission id,命名空间化
  feature_key   VARCHAR(64) NOT NULL,
  step_key      VARCHAR(64) NOT NULL,        -- methodology|alpha|beta|gamma|chief
  status        VARCHAR(16) NOT NULL,        -- pending|running|done|failed
  attempt       INT NOT NULL DEFAULT 0,      -- graft C: max-attempt → dead-letter
  lease_until   DATETIME(3) NULL,            -- graft C: 租约过期 → 重排队
  turn_id       BIGINT UNSIGNED NULL,        -- 执行该步的 turn
  output_ref    JSON NULL,                   -- 结构化结果(ReviewerOutput / methodology 文本)
  UNIQUE KEY uk_saga_step (saga_id, step_key) -- 每 (review, reviewer) 一行 = per-round!
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

```go
// saga.go (NEW) — 通用;peerreview 变成一个声明
type SagaSpec struct { FeatureKey string; Steps []SagaStep }
type SagaStep struct {
    Key string; Tier ModelTier; DependsOn []string     // chief depends on alpha,beta,gamma
    BuildPrompt func(SagaCtx) (string, error)          // 读前序步输出
    Validate    func(out string) (any, bool)           // parseReviewerJSON,有界重试
    MaxRetry    int
}
```

引擎**通过 enqueue turn 驱动步**(与交互轮同一条 `agent:turns` Stream——统一 substrate)。每步进度是一行 `agent_saga_steps` + 租约。

- **MySQL 8 原子认领(graft B 的更正——MySQL 无 `UPDATE...RETURNING`/无 `JSONB`):**
  `UPDATE agent_saga_steps SET status='running', executor_id=?, lease_until=NOW(3)+INTERVAL 15 MINUTE, attempt=attempt+1 WHERE saga_id=? AND step_key=? AND status='pending'` → 检查 `RowsAffected==1` 才算认领成功;或在 worker 拉取处用 `SELECT ... FOR UPDATE SKIP LOCKED`。**绝不用 RETURNING / JSONB**(那是 Postgres,本仓库是 MySQL 8;`output_ref` 用 `JSON` 类型即可,不依赖 `JSONB`)。
- **per-step 持久(修 debt #4 终态):** 每步完成先提交 `output_ref` 再 enqueue 下一步;resume = `WHERE status != 'done'`。崩在 gamma → 只重跑 gamma。`ReconcileStaleOnBoot`/`StartStaleSweeper` 变成**通用 saga reconciler** 扫 `lease_until` 过期(+ Redis advisory lock 保证单副本扫)。`attempt >= MaxRetry` → 标 `failed` 进 dead-letter,不静默 wedge(graft C 的 poison-message 纪律——owner 排除了 Temporal,这套纪律必须**显式写对**:`RowsAffected==1` 认领 + `attempt>=MaxRetry→failed` DLQ,否则 saga 静默 wedge)。
- **流式**:每步是 turn → 事件 journaled → Projector 按步的 slot 扇出。`StreamBroker` 删除,SSE/WS 视图变成 saga turns 事件的投影;`computing_methodology` UI 态派生自 `agent_saga_steps.status`。
- peerreview persona prompt 仍来自 `PersonaRandomPicker`/`feature_prompts`(不变),reviewer skills 仍 `AddDirs` 载入,`Submit` 内配额 + MinIO push 不变。`service.go` 从 2119 行缩成 `SagaSpec` 声明 + 4 个 prompt picker + 落 reviewer report。

### 5.3 未来多 agent feature

声明一个 `SagaSpec`(步集 + per-step `Tier`/persona picker + DAG `DependsOn`)即复用 claim/journal/sweep/stream,durable by construction——这是 CMA orchestrator-worker / agent-session-environment split 的 home-grown 版,owner 的 "multi-agent" ask 落地处。

---

## 6. 横切:计费/额度、记忆、安全、可观测

- **计费/额度**:`PreUserMessage` 配额闸留在 turn 准入(同步,enqueue 前,hooks.go → vip)。usage accrual 迁移期走 Redis 水位 Lua(§2.3a),收敛态走 `agent_billing_ledger` turn_id 幂等(§2.3b)——**两段必须落在不同迁移阶段,见 §2.3 铁律 + §8 P1/P2/P3 排序**。account book = `llm_token_usage`(`recordAgentTokens`,唯一 decrement 点);daily-cap = `vip.AddUsage`。peerreview `Submit` 内 server-side 配额保留。memory:ai-token-billing-map 的 R2(记忆抽取不计)**先核对本分支是否已闭合**(§2.4)——已闭合则沿用现有 `kind=memory_extract` 入账,**不重复加**,避免双计。
- **记忆**:`user_memory_blocks` 真源 + `version` 列 + 软删(versioned/redactable,CMA 模式);增量抽取(只重写变更块);system-prompt 前缀注入(prefix 稳定——见 §3.3,这条对任何前缀缓存实现都 strictly dominant)。
- **密钥隔离(偷 CMA substitute-at-egress):** DeepSeek key 与 Minicod key **绝不进 sandbox**。今天 `MINICOD_API_KEY` 在 MCP 载入时展进 `~/.claude.json`(Dockerfile:60)= 在不可信进程内。改:sandbox 内只存 placeholder,**复用已有的 egress tinyproxy**(在内部 `scholar-agent-net` 上,见 docker-compose 的 `egress-proxy` 服务块——确切行号以仓库为准,约在 compose 文件 egress 段)做 header-rewrite,仅对 Minicod host 替换真 key。DeepSeek upstream token 走 §3.5 的 split——model 调用在**信任的 turn driver/orchestrator 侧**(jail 外),tool 执行在 jail 内、无密钥(CMA self-hosted-sandbox split:orchestration/model 在外,tool exec 在内)。⚠️ substitution 只对**逐字发送**的密钥有效(Minicod 是 plain bearer,成立;AWS SigV4/OAuth 交换会破——本系统不涉及)。`networking.allowed_hosts`(哪些请求拿密钥)与 egress allowlist(哪些 host 可达)是**两道独立闸**,**同一次改动里把 egress 从 open 收紧到 allowlist**,否则被攻陷 agent 仍能外泄非密钥租户数据。
- **两阶段执行(setup/agent 两段,给 prism/peerreview):** setup 阶段(net 开 + Minicod-substituted key)拉 PDF/references 写进 cwd → 然后移除密钥 + `--unshare-net`,agent 阶段离线无密钥跑 model-directed 工作。唯一 net+secret 共存窗口是确定性、非模型控制的 setup 步;模型控制阶段离线无密钥,prompt injection 无处外泄。claw(合法需交互 net)保单阶段,靠 egress allowlist + substitution。
- **安全边界三环**:(1) control-plane authz(ws-ticket、`OwnsSession`、`decidePermission` 作 `canUseTool`);(2) executor allow-list from `specDeny`;(3) bubblewrap kernel jail + egress allowlist。**威胁接受声明(显式):bwrap 不防 host kernel 0-day(租户共享内核)——对认证付费会员、现实攻击=prompt-injection 外泄、data plane 已网络隔离,可接受;若将来对匿名任意代码执行开放,claw/Bash 这一 feature 单独升级 gVisor(`runsc`),其余 bwrap。**
- **可观测**:slog → docker logs(无外部平台,CLAUDE.md;memory:backend-audit 的脱敏纪律保留——无 secret 到非 admin)。**事件日志即审计**:`admin_monitor.go`(123 行)读 `agent_turn_events` 而非戳 daemon/jsonl——严格更好,无需容器 fs 访问。per-turn 结构化日志按 `turn_id`/`saga_id`;`agent_usage` slog label(hooks.go:38)保留,`docker logs | grep agent_usage` 仍可看。

---

## 7. 单机现在、但不再被单实例锁死

⚠️ **先把口径说清楚,避免 reviewer 点出的「表读起来像已 HA」误导**:下表的「之后」列指的是**该状态项不再是 process-local**;但**真正可跑 2 副本的总闸是 jsonl 单写者墙,只有 P3 stateless executor 落地后才倒**。换言之:**P2 倒掉 4 把锁里的 3 把,第 4 把(jsonl 单写者)在 P3 前一直挡着真 HA。** 在 fork 仍执行的窗口,即使 §2 的状态全外置,**仍必须 sticky-by-session 路由**——这是过渡期的不变式,不是可选项。

| 状态 | 今天(process-local) | 之后(不再 process-local) | 真 HA 还差什么 |
|---|---|---|---|
| 会话历史 | jsonl in daemon volume | `agent_turn_events`(MySQL) | — |
| 在途轮 | `hub.replayBuf`(RAM) | `agent_turn_events` + Redis Stream | — |
| 扇出注册表 | `bridge.hubs`(RAM) | Redis Stream(独立实例/DB,noeviction) | — |
| 计费水位 | `tokenWatermarks`(RAM) | `agent:wm`(Redis)→ `agent_billing_ledger`(MySQL) | — |
| busy/单写锁 | `hub.inFlight`(RAM) | `turnlock:<sid>` + `agent_turns` 唯一约束 | — |
| 编排进度 | peerreview `StreamBroker`(RAM) | `agent_saga_steps`(MySQL,原子认领) | — |
| sweeper | `StartStaleSweeper`(进程) | DB 查询 + Redis advisory lock | — |
| ws-ticket | Redis(本就) | Redis | — |
| **执行(总闸)** | **一个长生命周期 daemon,本地 jsonl 单写者** | **stateless worker pool(consumer group),无本地 jsonl** | **⛔ 这一行就是真 HA 的总闸——P3 前 jsonl 墙仍在 → 必须 sticky-by-session** |

**可以、且安全地保持 process-local:** HTTP/WS 连接对象、in-flight goroutine、Projector 的 per-socket 背压缓冲、每副本 tail 自己已连浏览器的 Stream 消费者。这些不是共享状态——一个浏览器只连一个副本、读一条共享 Stream。

**split-brain 的 fence token 落在哪(reviewer 点出我先前 hand-wave)**:fencing 只在 **P3 之后**(executor 由 backend 控制、turn 由 consumer group 恰好认领一次)才真正有意义——`agent_turns.fence_token` 单调递增,executor 在 append 事件 / 写 ledger 时携带它,backend 侧 `WHERE fence_token >= ?` 拒绝过期持有者的写。**P2 窗口(fork 仍执行)fence token 无处生效**——fork daemon 没有 fencing 概念,谁 dial 它就接谁。因此 **P2 期间防 jsonl 双写的唯一手段就是 sticky-by-session 路由本身**(配 turnlock 互斥兜底),这也正是「P3 前不能丢 sticky」的根因。**别把 fence token 当成 P2 的护栏——它是 P3 之后的护栏;P2 的护栏是 sticky + 不上 2 副本到 fork。**

**切 2 副本的确切 diff(P6,jsonl 墙已溶解后):** `docker-compose` 加第二个 backend + 几个 executor worker,放 nginx upstream 后;两副本共享 MySQL + 独立 agent-Redis 实例;turn 经 Redis consumer group 恰好认领一次;无 jsonl 可双写;fence token 拒绝迟到持有者。= **config + LB,不是 rewrite。** 不做多 region / autoscaling,但数据模型不禁止以后做。

---

## 8. 渐进迁移路径(每阶段独立上线、不停服)

每阶段后用 feature flag 可逆,直到其后继被验证。**最高 ROI 排前:先杀数据丢失 + 双计费,fork 仍执行**(裁决称这是 A 迁移阶梯的核心优势)。**两处排序已按 reviewer 的真问题修正:计费翻转后移到 executor 上线之后(P1 不再翻 ledger);bubblewrap 与 sticky-removal 在 P4 拆成两个可独立回滚的子阶段。**

- **P0 — 影子写(shadow journal)+ peerreview 廉价止血。**
  - 加 `agent_turns`/`agent_turn_events`/`agent_billing_ledger`(0071+)。`hub.go` **额外**把每帧 + 每用户轮 append 进日志——**但必须从第一天就带 §2.1 的写侧 batcher(200ms/4KB coalesce)**,绝不 per-delta 同步写 MySQL,否则给纯内存热路径加上 MySQL 延迟、不再行为中性(reviewer 正确点出 P0「额外 append 每帧」若无 batcher 会拖慢 live)。jsonl + 内存 hub 仍权威。校验 journal == jsonl。
  - **同时做 §5.1 的 peerreview 廉价止血**(reconcile 前查 `peer_review_reports` 跳过已完成 reviewer)——零新引擎,直接砍掉 debt #4 的整篇重烧。
  - 触:`agentbridge/{hub,bridge}.go` + `peerreview/service.go`(止血)+ migrations。
- **P1 — 读 + 回放走日志(杀 data-loss bug),计费仍按今天的语义。**
  - 历史读(`GetSessionMessages`)+ 迟到回放改读日志而非 daemon/`replayBuf`;删 `replayBuf`。**这一步单独修掉 §HIGH#3 + agent-history-reentry bug,fork 仍执行。**
  - **计费此阶段不动语义**:仍是「fork 报 session 累计 → 水位拆 per-turn」,水位仍在内存(或已搬 Redis,见 P2)。**P1 绝不翻到 turn_id 幂等账本**——因为 fork 还在报累计,缺 per-turn 数,翻了就违反 §2.3 铁律(reviewer 正确点出我先前 P1 把这两件混了)。P1 的计费收益仅来自「ledger 影子记录可对账」,不是「ledger 成为权威」。
  - 触:`agentbridge/{bridge,hub}.go`。
- **P2 — 外置三状态(单实例墙倒 3/4)+ 水位搬 Redis Lua。**
  - 水位→Redis Lua(**计费语义仍是累计-减-delta,只是 store 跨副本**,store swap 非 redesign)、busy→`agent_turns`、broker→`agent_saga_steps`(配 §5.2 引擎)、`hubs`→Redis Stream(**独立 agent-Redis 实例/DB + noeviction**,见 §2.2)。
  - **此后 fork 仍执行,但状态全外置——然而 jsonl 单写者墙仍在 → 必须保 sticky-by-session 直到 P3。fence token 此阶段无效(fork 无 fencing),sticky 是唯一护栏。**
  - 触:`agentbridge/{bridge,hub,ws,ws_serverside}.go` + 新 `turncoord.go`/`eventlog.go`/`saga.go`。
- **P3 — stateless executor 上线 + 计费翻 turn_id 幂等(同阶段绑定,因为它们互为前提)。**
  - 新 TS `agent-executor`(raw `@anthropic-ai/sdk`)实现 `agent.Client` 契约 + turn 消费,**改报 per-turn usage**。**先切 smartsearch(最薄、MCP-only、最小爆炸半径)。**
  - **此刻、且只有此刻才翻 `agent_billing_ledger` turn_id 幂等**——因为 executor 现在直接给 per-turn 数,不再需要水位拆累计。水位机器对已迁 feature 退役。
  - **金丝雀的爆炸半径控制(reviewer 点出 dual-run 会双跑 MCP/双写 cwd):** dual-run **不**让两个 executor 真跑同一 turn 的真副作用。机制是 **shadow-execute**:fork 正常跑并发给用户;新 executor 跑**只读副本**——喂同一 history,但 **MCP/Bash 走 record-replay stub 或读隔离 cwd**(smartsearch 是 MCP-only 只读,天然安全;有副作用的 feature 在 P3 不 dual-run,留到各自迁移时按需做),只比对 token / tool-call 序列 / 最终文本相似度落对账表。**绝不让金丝雀双花真 DeepSeek/Minicod 成本或双写真 cwd。** smartsearch 选作首切正因为它只读,dual-run 几乎零副作用成本。
  - 此处**验证 DeepSeek prefix 缓存**(week-1 探针 #1 的结论在此应用)。
  - **回滚不变式**:P1 起历史读自日志,若折叠逻辑出 bug,feature flag 可把读切回 daemon——**前提是 jsonl 在 P1–P2 全程保持权威**(本路径正是如此,jsonl 到 P4a 才退役)。**新增**:P1/P2 全程跑「journal==jsonl」连续校验(不只是 P0 一次性),作为读切换的在线 guard,出偏差即告警并可一键切回 daemon。
- **P4a — claw/prism 切到新 executor(jsonl 墙溶解,但先不丢 sticky)。**
  - 把 claw(Bash)+ prism(`compile` profile)切到新 executor。此时各 feature 的 jsonl 真源退役,backend 事件日志成唯一真源。**但本子阶段仍保留 sticky-by-session 路由**——因为 bubblewrap 还没在 prod 验证过,把「换 loop」与「换隔离」分开,缩小一次变更的不确定性。
- **P4b — bubblewrap 隔离上线(独立、可单独回滚,与 sticky-removal 解耦)。**
  - 仅打开 `SANDBOX_MODE=bwrap`,带 egress 代理 + 密钥替换(**修 debt #2**)。**因为 bwrap 本地不可测(LinuxKit),这一步的首次真实验证在 prod**——故做成独立阶段:flag 一键回 `SANDBOX_MODE=none`(降级为 logical `decidePermission` 第二墙),不牵连 P4a 的 executor 切换。week-1 已在 prod 内核冒烟过 bwrap(§9 探针 #2)才进此阶段。
  - **sticky-removal 不在这里做**——它依赖 jsonl 墙已溶解(P4a)且 fence token 生效(P3 后),与 bwrap 无关。把它单列(P4c)避免 reviewer 点出的「最不可测的安全变更 + 丢掉 fallback 路由」挤在同一步。
- **P4c — 丢 sticky 路由。** jsonl 墙已溶解(P4a)、fence token 已生效(P3)、bwrap 已 prod 验证(P4b)——三者都满足后,才安全移除 sticky-by-session。删 `bridge.hubs`/`replayBuf`/`tokenWatermarks` 残留。
- **P5 — saga 泛化 + peerreview 切换(debt #4 终态)。** peerreview 从 §5.1 的廉价止血升级到 `SagaSpec`(per-step 记账 + 通用 lease/DLQ/流式投影);删 `StreamBroker` + peerreview-specific 的 `ReconcileStaleOnBoot`/`StaleSweeper`,换通用 reconciler。
- **P6 — 删 fork + 翻 2 副本。** 删 `agent/src/`(806KB)、`src/memdir/`、手搓 denylist。`agent/` 只剩薄 executor。config 翻 `replicas:` 证 HA(此时 §7 总闸已倒、fence token 生效、agent-Redis 独立 noeviction),设为默认。

**最危险的 cutover = P3(交互轮从 fork 切到 raw-SDK loop)。** raw loop 不会与 fork 字节一致(context compaction、tool-call 格式、prompt-cache shaping)。de-risk = 上面的 shadow-execute(只读副本对账,不双跑真副作用、不双花成本)+ 先 smartsearch。连续 N 天对账达标再 flip flag。

---

## 9. 风险与未决问题

**week-1 必须先验证(committing 前;前两个是 go/no-go 闸):**
1. **DeepSeek prefix 缓存到底吃不吃?(UNCERTAIN,不可假设)** 跑探针:固定 `[system + memory + tools]` 前缀,连发两个相同前缀请求,看 DeepSeek 返回的 usage 里**是否有任何 cache-hit 信号**(字段名待实测——可能是 `prompt_cache_hit_tokens`,也可能是别的,或根本没有)。**架构不依赖它达成成本目标**;若不命中,stateless executor 每轮重发历史会**增加** input token 成本(对比 fork `--resume` 可能的本地缓存)。缓解:封顶 history 窗口、fast-tier 摘要旧轮(把 fork `sessionService.ts` 的 tail-read/compaction 逻辑 port 进 Go history-folder,`bridge.go` 已按 turn 分页)。无论结果如何,§3.3 的「前缀字节稳定」纪律照做(strictly dominant)。
2. **bubblewrap 在真 prod 内核上能跑?** `cat /proc/sys/kernel/unprivileged_userns_clone`(=1)、`/proc/sys/user/max_user_namespaces`(>0)、`bwrap --unshare-all --ro-bind / / true`(exit 0)。Ubuntu 24.04+ 另查 AppArmor restricted-userns。**本地 LinuxKit 测不了 → 这是最高严重度修复的真实测试盲区**,必须 Linux CI runner 或真 prod box 验证。**没过就不进 P4b(P4a 仍可上,带 `SANDBOX_MODE=none`)。**
3. **raw-SDK loop 对 DeepSeek 的 tool-call/streaming 一致性。** SDK 是对着 Anthropic 模型测的;DeepSeek 的 tool-call 格式、streaming 边界、`stop_reason` 语义可能有 quirk。week-1 写一个 conformance 测试套(单工具、多工具、并行工具、空响应、超长响应)打真 DeepSeek。
4. **核对 memory R2 是否已闭合(§2.4)。** `grep recordOutOfBandTokens` 确认记忆抽取在本分支是否已按 `kind=memory_extract` 计费——已计则重构沿用,绝不重复加(防双计)。
5. **Agent SDK harness 的 hosting 行为复核(§3.1 待验证项)。** 若考虑 Agent SDK 作 fallback,先对照当前 `@anthropic-ai/claude-agent-sdk` 官方 hosting 文档实测它是否强制写本地持久 transcript / spawn 重子进程——**不凭记忆下结论**。结论只影响「fallback 是否可用」,不影响主路径(raw SDK 主路径不依赖这条)。

**已知会出错 / 诚实代价:**
- **写放大。** 每 coalesced content-block 命中 MySQL。缓解:200ms/4KB batcher + Redis 热路径 + MySQL 持久底;**up-to-200ms 持久滞后**——崩溃时持久日志可能落后 Redis 一个批窗,重连 tab 可能短暂少看 <200ms delta 直到 re-flush。有界,但这是个真 eventual-consistency 缝。别让 MySQL 进 live streaming 路径(per-delta 写会熔毁),只持久 coalesced/completed。容量/分区/保留见 §2.1.1。
- **stateless executor 每轮重发历史的成本。** 见探针 #1——整个成本模型不依赖 DeepSeek 缓存兑现,但若不兑现,长 claw/prism 会话的 input token 线性增长。fallback 架构(history windowing + fast-tier 摘要)在 §3.2 / 探针 #1 已点;它是 contingency,不是默认路径。
- **Redis 共池逐出。** 见 §2.2——agent 持久结构**必须**离开 512MB allkeys-LRU 池,放独立 noeviction 实例/DB,否则在途 Stream 被静默逐出、live 截断。这是部署前置条件,不是 nice-to-have。
- **home-grown saga = 你永远自维护。** owner 排除 Temporal(scope 对),但 lease-expiry / max-attempt / dead-letter / poison-message 正是 Temporal 存在的理由。**这套纪律必须显式写对**(§5.2 的 `RowsAffected==1` 认领 + `attempt>=MaxRetry→failed` DLQ),否则 saga 静默 wedge。
- **raw loop 自管成本。** context compaction / prompt-cache shaping / interrupt-cancel 现在是你的活;有界但真。Agent SDK fallback 记着(先做探针 #5)。
- **双 executor 并跑(P3–P5)** = 双倍监控面 + 行为漂移;feature-flag 纪律是 load-bearing。shadow-execute 是只读对账,不双花真成本(§8 P3)。
- **split-brain 窗口。** P2(fork 仍执行)靠 sticky + turnlock,**fence token 此时无效**;P3 之后 fence token(`agent_turns.fence_token`)生效,lease 过期 + 旧持有者 GC 暂停的双写被 `WHERE fence_token >= ?` 拒绝;且 P4a 后 jsonl 成可替换衍生物,瞬态双写不再 corrupt 真源(真源是 backend 事件日志)。见 §7。

**week-1 prototype(de-risk 顺序):** (1) DeepSeek 缓存 + tool-call conformance 探针(决定 raw-SDK 路径是否成立);(2) prod 内核 bwrap 冒烟(决定 P4b 是否成立);(3) P0 shadow journal 的 journal==jsonl 校验脚本 + batcher 行为中性验证(证明状态反转可无损起步)。三个都过,再 commit 整条阶梯。

---

**触碰的关键文件:** `backend/internal/agent/client.go`(executor seam,1020 行 → 薄 turn-enqueue client)、`backend/internal/agentbridge/{bridge.go(1071),hub.go(655)→Projector,ws.go(567),ws_serverside.go(414)}` + 新 `turncoord.go`/`eventlog.go`/`saga.go`、`backend/internal/peerreview/service.go(2119 → §5.1 止血 → §5.2 SagaSpec 声明)`、`agent/src/*`(删,换薄 raw-SDK executor)。**不变(增量 only):** `backend/internal/{smartsearch,claw,prism,peerreview}/spec.go`、`wstoken.go`(134)、`hooks.go`(128,配额)、`picker.go`(275)、`repository.go`(317)。
