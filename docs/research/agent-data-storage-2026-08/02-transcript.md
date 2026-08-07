# 会话记录(对话历史)存储与读写链路 —— 实测取证

> 调研日期 2026-08-07 · 只读分析,未改任何代码、未动线上
> 取证口径:所有 SQL 在本机 docker 容器 `scholar_mysql`(`scholar` 库)执行。
> 该库与协调者所称「生产实测」是同一份数据(协调者测 `agent_artifacts` 1035 行/226 会话,
> 本次复测 1040 行/227 会话,增量吻合)。**下文所有数字均为该库实测,不是估算。**
> 代码引用一律 `文件:行号`,均已逐行读过。

---

## 0. 结论速览(先读这 10 条)

| # | 结论 | 严重度 |
|---|---|---|
| 1 | 对话历史真源 = `agent_turns` + `agent_turn_events`,**MySQL 内、月度 RANGE 分区、永久保留、零删除** | — |
| 2 | **全库无一处代码 DELETE 这三张表**(turns / turn_events / session_archive)。删会话、删项目、删用户都不级联 | 高 |
| 3 | 分区只延展不 DROP(`cleanup.go:226-235` 注释明写「永久保留、绝不删除」),分区数单调增长 | 中 |
| 4 | **所有读路径都不带 `created_at` 谓词 ⇒ 分区裁剪 0**,实测 EXPLAIN 每次读扫全部 19 个分区 | 中 |
| 5 | `thinking` 占 68.4% 行数但只占 15.5% 字节;字节大头是 `tool_result`(6.95MB / 24.4%) | — |
| 6 | batcher 不丢帧的设计是完整的(overflow + 同步背压 + 3 次重试 + 失败计数),**真正的丢帧口在 hub 侧**:`BeginTurn` 失败 ⇒ `currentTurnID=0` ⇒ 整轮零事件入库,live 照常跑,只有一条 Warn | 高 |
| 7 | `agent_session_archive` 只在**开机一次性**写(env 驱动),生产每次 boot 都跑一遍幂等扫描;实测 `archived=0 skipped=452 no_jsonl_or_empty=56` ⇒ **56 个会话在三处都没有历史** | 中 |
| 8 | prism 正文与对话历史是**两套完全独立的存储**:正文在 `prism_projects.doc_struct`(current)+ `prism_struct_versions`(追加版本链),对话在 journal | — |
| 9 | `DeleteProjectCascade`(`prism/repository.go:99-121`)**漏删 `prism_struct_versions` 与 `prism_revision_items`** —— 而 struct 轨是当前主轨,正文全在那张表。实测已有 1 条孤儿正文版本 | 高 |
| 10 | 备份脚本三件套齐全(`scripts/backup-all.sh` / `backup-cron.sh` / `install-backup-cron.sh` / `RESTORE.md`),但**本机 `crontab -l` 为空,`backups/` 里最近一份全量冷备是 2026-06-04**,`backups/backup.log` 不存在 ⇒ 定时备份从未跑过 | 阻断级 |

---

## 1. 存储版图

```
浏览器 ──WS──► backend hub(agentbridge/hub.go,内存 live 权威)
                 │
                 ├─ broadcastAgent(扇出给所有订阅者)         ← 实时
                 └─ classifyJournalEv 白名单 tee ─► TurnCoordinator ─► EventLog
                                                                        │
                                             deltaBatcher(200ms/4KB 合并,独立 goroutine)
                                                                        │
                                                    MySQL: agent_turns / agent_turn_events
                                                            (+ agent_billing_ledger 影子)

executor(scholar_agent)= 无状态、跨轮不持久化历史(H1)
   每次建 hub 由 seedHistoryFromJournal 把 journal 折成 seed_history 帧回灌
   会话工作区 /home/bun/sessions/<sid>/ → 宿主 ./data/agent-sessions,30 天 GC
```

四类数据、四个落点,互不覆盖:

| 数据 | 落点 | 保留 |
|---|---|---|
| 对话事件流(真源) | MySQL `agent_turn_events` | **永久** |
| 轮账本 / 计费锚 | MySQL `agent_turns` / `agent_billing_ledger` | **永久** |
| 切流前老会话(fork jsonl 折叠件) | MySQL `agent_session_archive` | **永久** |
| 会话工作区文件 | executor 容器盘 `/home/bun/sessions/<sid>` | 30 天 GC |

---

## 2. `agent_turns` —— 完整字段与索引

建表:`docker/mysql/migrations/0046_agent_turn_journal_fields.sql:13-38`
索引:`docker/mysql/migrations/0047_agent_turn_journal_indexes.sql:9-17`
GORM 模型:`backend/internal/agentbridge/journal_model.go:25-46`

```sql
-- 实测 SHOW CREATE TABLE(注释已裁掉)
CREATE TABLE `agent_turns` (
  `id`               bigint unsigned NOT NULL AUTO_INCREMENT,
  `agent_session_id` varchar(64)     NOT NULL DEFAULT '',
  `feature_key`      varchar(64)     NOT NULL DEFAULT '',
  `user_id`          int unsigned    NOT NULL DEFAULT '0',   -- ⚠ int,不是 bigint(agent_sessions.user_id 是 bigint)
  `seq`              int unsigned    NOT NULL DEFAULT '0',   -- per-session 单调轮号
  `client_turn_id`   varchar(64)     NOT NULL DEFAULT '',    -- 幂等键(浏览器给)
  `role_user_text`   mediumtext,                             -- 用户原文(注入 system prefix 之前)
  `status`           varchar(16)     NOT NULL DEFAULT 'running',
  `kind`             varchar(24)     NOT NULL DEFAULT 'interactive',
  `model_main`       varchar(64)     NOT NULL DEFAULT '',
  `attempt`          int             NOT NULL DEFAULT '0',
  `executor_id`      varchar(64)     NOT NULL DEFAULT '',    -- P3+ INERT,恒空
  `lease_until`      datetime(3)     DEFAULT NULL,           -- P3+ INERT,恒 NULL
  `fence_token`      bigint unsigned NOT NULL DEFAULT '0',   -- P3+ INERT,恒 0
  `created_at`       datetime(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at`     datetime(3)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_client_turn` (`agent_session_id`,`client_turn_id`),
  UNIQUE KEY `uk_session_seq`         (`agent_session_id`,`seq`),
  KEY `idx_session_status` (`agent_session_id`,`status`),
  KEY `idx_status_lease`   (`status`,`lease_until`),
  KEY `idx_user_created`   (`user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=883 CHARSET=utf8mb4;
```

**取值域实测(882 行)**

- `status`:`complete` 711 / `failed` 162 / `aborted` 6 / `blocked` 3 / `running` **0**(reaper 干净)
- `kind`:`interactive` 879 / `quota` 3
- `attempt`:实测未查(hub.go:805 起用该列做 provider failover 计数,`BumpAttempt` 用 `GREATEST` 幂等取大 —— `eventlog_store.go:124-130`)
- 无任何外键(实测 `information_schema.REFERENTIAL_CONSTRAINTS` 对 `agent%`/`prism%` 零行)

**per-feature 分布**

| feature | complete | failed | aborted | blocked |
|---|---|---|---|---|
| stat_lab | 556 | 155 | | |
| claw | 83 | 3 | 5 | 3 |
| smart_search | 31 | 4 | | |
| prism | 20 | | | |
| sci_draw | 17 | | 1 | |
| boltslides | 4 | | | |

`agent_billing_ledger` 实测 711 行,与 `status=complete` 数**恰好相等** —— 影子账本无漏无重(`eventlog_store.go:203-206`,`turn_id` 是 PK + `OnConflict DoNothing`)。

### 两个并发写者抢 `uk_session_seq`

`BeginTurn`(`eventlog_store.go:68-108`)与 `RecordBlockedTurn`(`:135-186`)都用
`SELECT COALESCE(MAX(seq),0)+1` 取号,共用同一唯一索引。两者各带 3 次有界重试;
`BeginTurn` 撞键时先按 `client_turn_id` 回读(命中即幂等),回读不中才判定是 seq 撞、重算。
blocked 行的 `client_turn_id` 强制加 `"blocked:"` 前缀(`:52`,`:146`)—— 注释明写理由:
不隔离命名空间的话,用户被拦后充值、前端原样重发同一个 `clientTurnId` 会被 `BeginTurn`
判成「已送达」直接丢帧。

---

## 3. `agent_turn_events` —— 完整字段、索引、分区

建表 + 分区:`0046_agent_turn_journal_fields.sql:40-58`(唯一键含分区列,故**只能建表内联,不能事后补**,见 `0047` 头注释)
GORM 模型:`journal_model.go:50-60`

```sql
CREATE TABLE `agent_turn_events` (
  `id`               bigint unsigned NOT NULL AUTO_INCREMENT,
  `turn_id`          bigint unsigned NOT NULL DEFAULT '0',
  `agent_session_id` varchar(64)     NOT NULL DEFAULT '',   -- 冗余列
  `ev_seq`           int unsigned    NOT NULL DEFAULT '0',  -- turn 内序号
  `ev_type`          varchar(32)     NOT NULL DEFAULT '',
  `payload`          json            NOT NULL,              -- = 发给浏览器的 wire 帧字节
  `created_at`       datetime(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`,`created_at`),
  UNIQUE KEY `uk_turn_ev_seq` (`turn_id`,`ev_seq`,`created_at`),
  KEY `idx_sid_id` (`agent_session_id`,`id`)
) ENGINE=InnoDB AUTO_INCREMENT=150822 CHARSET=utf8mb4
PARTITION BY RANGE (TO_DAYS(`created_at`)) (…);
```

### 分区策略

- 0046 初建 `p_init` / `p2607` / `p2608` / `p2609` / `p_future`。
- `0071_agent_tables_partition_indexes.sql:20` 调 `ensure_month_range_partitions('agent_turn_events', 15)` 从当前月起补 15 个月。
  存储过程实现见 `0000_utils.sql:134-173`:检测 `p_future` 存在则逐月
  `REORGANIZE PARTITION p_future INTO (p<yymm>, p_future)`,按分区名幂等跳过。
- 运行期由 `internal/common/cleanup/cleanup.go:216-235` 维持:**开机跑一次 + 每天 05:40**。
  实测启动日志:`Next cleanup scheduled task=agent_event_partitions at="2026-08-08 05:40:00"`。
- **只延展,永不 DROP**(`cleanup.go:227-228` 与 `0071` 头注释都写死「会话历史永久保留、绝不删除(产品要求)」)。

**实测分区现状(19 个)**

| 分区 | 行数 | data MB | index MB |
|---|---|---|---|
| p_init(< 2026-07-01) | 2 133 | 2.5 | 0.3 |
| p2607 | 9 600 | 7.5 | 1.9 |
| **p2608**(当月,7 天) | **130 253** | **37.6** | **18.1** |
| p2609 … p2711(15 个) | 0 | 0 | 0 |
| p_future | 0 | 0 | 0 |

`p_future` 空 = 延展任务在正常工作,数据还没堆进 MAXVALUE。

### 🔴 分区裁剪实测为 0

两条真实读路径的 EXPLAIN(本机实测):

```
-- ReadRecentTurns 的第二段
EXPLAIN SELECT * FROM agent_turn_events WHERE turn_id IN (…) ORDER BY id ASC;
 partitions: p_init,p2607,p2608,p2609,…,p2711,p_future   ← 19 个全扫
 key: uk_turn_ev_seq   Extra: Using index condition; Using filesort

-- ReadInFlightEvents
EXPLAIN SELECT * FROM agent_turn_events WHERE turn_id = ? ORDER BY ev_seq ASC;
 partitions: (同样 19 个全扫)
 key: uk_turn_ev_seq   Extra: NULL
```

原因是结构性的:**分区键是 `created_at`,而所有读都按 `turn_id` 过滤**,没有任何读路径带时间谓词。
MySQL 的分区是「每分区一棵局部索引」,所以单次历史读要做 N 次索引 dive(N = 分区数)。
延展任务每月 +1 个分区且永不回收 ⇒ 这个 N 单调增长,一年 +12,五年后一次会话历史读要摸 ~70 棵索引。
今天数据小、感觉不到;它是**随时间线性劣化**的那类问题,不是随数据量。

（顺带:`idx_sid_id (agent_session_id, id)` 实测**零查询使用** —— 全仓对本表的 SQL 只有
`eventlog_store.go:251` 和 `:275` 两处,都按 `turn_id`。这是 20.8MB 索引里的一份纯写放大。）

---

## 4. 帧 → 库 的完整写路径

### 4.1 白名单:哪些帧入库

`hub.go:2087-2121` `classifyJournalEv`:

| 上游帧 type | 落成 EvType |
|---|---|
| `content_start` | `content_start` |
| `content_delta` | `content_delta` |
| `thinking` | `thinking` |
| `tool_use` / `tool_use_complete` | `tool_use` |
| `tool_result` | `tool_result` |
| `permission_request` | `permission_request` |
| `artifact` | `artifact` |
| `round_discarded` | `round_discarded` |
| `research_state` / `evidence_appended` | `evidence` |
| `error` | `error` |
| **其余一律 false** | 不入库 |

不入库的:`token_usage` / `memory_update` / `session_title_updated` / `ping` / `pong` /
合成帧 `user_echo` / `busy`。
另有两条不走 `classifyJournalEv` 的旁路:`user_message` 由 `TurnCoordinator.BeginTurn`
显式 append(`turncoord.go:52-53`),`message_complete` 由 hub 的 case 显式 append(`hub.go:1435`)。

`evidence_appended` 虽在白名单里,但 `eventlog.go:50-53` 明写「执行器目前一帧都不发」——
实测本库 `ev_type='evidence'` 共 236 行,全部是 `research_state` 快照口径(读侧
`researchStateSnapshot`(`eventlog_store.go:326-337`)只认 `type=="research_state"`)。

### 4.2 tee 点与 `tid` 闸门

`hub.go:1626-1639`:先 `broadcastAgent(data)`(实时优先),**再**读 `h.currentTurnID`,
`tid != 0` 才 `classifyJournalEv` + `Append`。

```go
h.mu.Lock(); tid := h.currentTurnID; h.mu.Unlock()
if tid != 0 {
    if ev, ok := classifyJournalEv(data); ok {
        f.bridge.turns.Append(tid, h.sessionID, ev, data)
    }
}
```

这个 `tid != 0` 闸门是**全部结构性丢帧的来源**,见 §5。

另有一条更早的 `continue`(`hub.go:1620-1625`):轮已被硬超时收口(`timedOutTurn`)时,
迟到散帧直接 `continue` —— **既不广播也不入 journal**。这是刻意的(注释 [19]),但意味着
超时轮之后上游真实产出的内容在库里也没有。

### 4.3 batcher 合并规则

`eventlog_batcher.go`。每个 turn 一个 `deltaAccum`(`:43-55`),里面**三个独立 buffer**:

| buffer | 承接 | 合并阈值 |
|---|---|---|
| `buf` | `content_delta` 的 `text` | 4096 B 或 200 ms |
| `thinkBuf` | `thinking` 的 `text` | 同上 |
| `toolBuf` | `content_delta` 的 `toolInput`(+ `toolPath`) | 同上 |

切块保序:任一 buffer 要开始攒时,先 flush 另外两个(`:311-315`、`:334-339`、`:362-367`),
所以「思考块 → 文本块 → 工具入参」的交错顺序在 `ev_seq` 上被保留。
`ev_seq` 由 `a.nextSeq` 单点分配,delta / thinking / toolInput / 非流式事件**共用同一个计数器和同一把 `b.mu`**(`:30`)。

**同步 vs 异步分叉**(`:293-411`):

- `message_complete` / `error` → **锁外同步** `createWithRetry`(`:393-401`),连同末段三个 buffer 一起。
  目的是杜绝「`status=complete` 但末段 delta 还在异步通道里」的截断窗口(M5)。
- 其余非流式(`tool_use` / `tool_result` / `permission_request` / `content_start`)→ `enqueue` 异步。
- `CompleteTurn` 进库前还会再 `flushTurnSync`(`eventlog_store.go:194`)兜一次底。

`enqueue`(`:246-260`)三级降级,**设计上不丢**:
`writeCh`(缓冲 2048)→ 满则挂 `overflow` 切片(锁内 O(1),由 `drainLoop` 每 50ms 锁外落库)→
`overflow` 超 50000 封顶则退回同步落库做背压。注释明写这是 2026-07 性能审计 P0 的修复:
旧实现在 `writeCh` 满时**持全局 `b.mu` 同步写 MySQL**,MySQL 一抖就冻结全平台流式。

`createWithRetry`(`:125-140`):3 次重试 + 20/40/60ms 退避;撞唯一键视为成功(幂等);
终败则 `failCnt++` + `slog.Error("… journal=历史唯一真源, 此行已丢")`。

---

## 5. 丢帧风险清单(按可能性排序,均为读码判定)

### R1 · `BeginTurn` 失败 ⇒ 整轮零事件入库(🔴 最高)

`hub.go:1876-1899`:

```go
res, terr := f.bridge.turns.BeginTurn(h.hookCtx, TurnInput{...})
if terr != nil {
    slog.Warn("agentbridge hub: shadow BeginTurn failed (live unaffected)", …)
}       // ← 注意:没有 return,currentTurnID 保持 0
else if res.AlreadySeen { … } else { h.currentTurnID = res.TurnID }
```

DB 抖动 / `hookCtx` 被 cancel / 3 次重试仍撞键(`eventlog_store.go:95-106` 循环跑完
`err` 非 nil 直接返回)⇒ `currentTurnID` 恒 0 ⇒ §4.2 的闸门让**这一轮的每一帧都被静默丢弃**。
用户侧完全无感(live 走内存),库里这一轮**根本不存在**(不是残缺,是没有)。
唯一痕迹是一条 `level=WARN` 且文案是 "live unaffected" —— 措辞会让人以为无害。
实测 `turns_without_events = 0`,说明目前没发生过;但这是「发生了也查不出来」的形状:
丢的轮不会在 `agent_turns` 里留任何行,`WriteFailures()` 也不计它。

### R2 · `WriteFailures()` 只在进程退出时看一眼

`bridge.go:409-416` `ShutdownJournal` 里 `if n := b.log.WriteFailures(); n > 0 { slog.Warn(...) }`。
**这是全仓唯一读它的地方**(实测 grep 只有 4 处提及、1 处调用)。
也就是说:运行期间累计丢了多少行,要等到优雅重启那一刻才打一行日志;
`docker kill` / OOM 的话连这行也没有。没有指标、没有告警、没有接口。

### R3 · 非优雅退出丢异步队列

`ShutdownJournal` 在 `main.go:204` 被调,排在 `srv.Shutdown` 之后、且在水位 flush 之后
(`main.go:194` 注释:「必须在 ShutdownJournal 之前:两者都写 DB,水位是钱、journal 是历史,先保钱」)。
SIGTERM 路径完整。但 SIGKILL / OOMKill 会带走 `writeCh` 里最多 2048 行 + `overflow` 里最多 50000 行。
终帧是同步写的,所以丢的是中段 `tool_use` / `tool_result` / `content_start` —— **历史会变成
「有结论没过程」**,而 fold 时这种残缺不会报错,静默产出一份少了工具块的 transcript。

### R4 · 硬超时后的散帧黑洞

`hub.go:1620-1625` 的 `suppressStray` `continue` 在 tee 之前。超时轮之后 executor 仍可能
产出真实内容(工具跑完、模型继续吐),这些既不到前端也不入库。
（补偿:`onTurnTimeout`(`:1262-1286`)会先 `Append(EvError, turnTimeoutFrame)` 再 `endTurn`,
所以库里那一轮至少以 error 收尾,不会是 `running` 僵尸。)

### R5 · 200ms / 4KB 合并窗

非终帧路径下,进程若在窗内崩溃,最后一段 ≤4KB 的正文丢失。终帧同步写把这个窗
压到「只可能丢未完成轮的尾巴」,是可接受的设计取舍。

### R6 · `ev_seq` 在内存、跨进程不连续

`nextSeq` 只在 `deltaAccum` 内存里(`:53`),`dropTurn` 在 `CompleteTurn` 后清 accum(`:448-455`)。
理论风险:若某条路径在 `dropTurn` 之后仍对同一 `turnID` 调 `Append`,`accumLocked` 会新建
accum、`nextSeq` 从 0 起 ⇒ 撞 `uk_turn_ev_seq` ⇒ `createWithRetry` **把 duplicate key 当成功**
(`:131-133`)⇒ 这些帧静默消失、`failCnt` 不增。
**读码判定当前不可达**:所有终态路径都先在锁内把 `currentTurnID` 置 0
(`hub.go:1405`、`:1431`、`:1222`)再触发 CompleteTurn/FailTurn,置 0 之后 §4.2 闸门就关了。
但这条不变式没有任何测试或断言守着,属于「今天恰好对」。

### R7 · `RecordBlockedTurn` 的 `EvSeq: 1`

`eventlog_store.go:174` 硬写 `EvSeq: 1`,而正常轮的第一条事件(`user_message`)是 `ev_seq=0`。
无害(blocked 轮只有一条事件,且读侧按 `status<>'blocked'` 全过滤),但口径不一致,
将来若给 blocked 轮加第二条事件会踩。

---

## 6. 读路径(三级回退)

### 6.1 是否走 journal

`bridge.go:465-477` `readFromJournal`:**durable-by-default**。
只要 `b.log != nil`(即 `AGENT_TURN_JOURNAL != off`)就走 journal,
唯一 opt-out 是 `AGENT_JOURNAL_DAEMON_ONLY=<feature,…>` 紧急闸。
注释里记着极性反转的理由:旧的 opt-in 名单漏项导致 boltslides 整个 feature 历史静默读空。

`.env:85` 实测 `AGENT_TURN_JOURNAL=shadow`(≠off ⇒ 开);`.env:90` `AGENT_JOURNAL_READ=`(该 env 已不再被读);
`.env:87` `AGENT_JOURNAL_VALIDATE=off`。
bootstrap 另有一道 fail-fast:配了 `AGENT_EXECUTOR_FEATURES` 又把 journal 设成 off ⇒
`os.Exit(1)` 拒绝启动(`bootstrap.go:194-200`)。

### 6.2 三级回退链

`bridge.go:917-948` `readHistoryFromJournal`:

1. `ReadRecentTurns(sid, limitTurns)` → `FoldToMessages`
2. 折出为空 → `readArchive(sid)`(`archive.go:94-112`,读 `agent_session_archive`)
3. 仍为空 → `b.client.GetSessionMessages`(executor 兜底;对切流后会话必然返空,无害)

`hub.go:828-847` `seedHistoryFromJournal` 用**同一条三级链**(默认最近 30 轮),
把结果 + title + `appendSystemPrompt` / `addDirs` / `skills` / `honestyGuard` /
`research`(最后一张 research_state 快照)打包成 `seed_history` 帧喂 executor。
写失败有限重试 3 次,终败置 `seedFailed` ⇒ **fail-closed**,下一条用户消息被拦(`:910-925`)。

admin 会话监控走同一套但读 500 轮:`admin_monitor.go:118-130`。

### 6.3 `ReadRecentTurns` 的具体形状

`eventlog_store.go:257-280`:
- `limitTurns <= 0` → 默认 30
- 两条 SQL 都带 `status <> 'blocked'`(被配额拦下的轮**不占最近 N 轮名额、不进 totalTurns**)
- 先 `Order("seq DESC").Limit(n).Pluck("id")` 取轮 ID(命中 `uk_session_seq` 反向扫,无 filesort)
- 再 `WHERE turn_id IN ? ORDER BY id ASC`(此处 filesort,见 §3)

### 6.4 `FoldToMessages` 的折叠契约

`eventlog_store.go:366-551`,纯函数无 DB。产出形状与 daemon `GET /sessions/:id/messages` 逐块对齐。

- **轮边界硬约束**:只有 `EvUserMessage` 产出 `Type=="user"`;`tool_result` 是独立的
  `Type=="tool_result"`,不冒充 user ⇒ 用户轮数 parity 天然成立。
- 连续同类 assistant delta(text / thinking)合并成一条 message。
- `content_start` / `message_complete` / `permission_request` / `quota_blocked` **无 case ⇒ 不产 message**。
- `EvRoundDiscarded`(`:426-429`):直接清空当前累积 buffer(丢弃被作废轮的残缺前缀),不 flush。
- `EvError`(`:494-511`):折成 `Type=="error"`、content 是 **JSON 对象**(非块数组);
  executor 的 `convertFlatToAnthropic` 只认数组形 ⇒ 错误提示天然不回喂模型。
- `EvArtifact`(`:512-528`)、`EvEvidence`(`:529-545`)同款:折成合成 entry 给前端 replay 重建 chip,
  同样因为 content 块不是 text/tool_use 而不进模型上下文。
- `EvEvidence` 每轮只取**最后一条** `research_state` 全量快照(`pendingResearch` 推迟到轮边界 flush),
  `evidence_appended` 一律跳过 —— 注释写明理由:拼装增量 = 第二套证据口径。
- 字段名同时兜 camelCase(`toolUseId`/`toolName`)与 Anthropic 标准名(`tool_use_id`/`id`/`name`)。

---

## 7. `agent_session_archive` —— 什么时候写、写什么

建表:`0051_agent_session_archive_fields.sql:9-19`
模型:`repository.go:87-100`

```sql
CREATE TABLE agent_session_archive (
  agent_session_id VARCHAR(64)  PRIMARY KEY,
  feature_key      VARCHAR(64)  NOT NULL DEFAULT '',
  title            VARCHAR(255) NOT NULL DEFAULT '',
  total_turns      INT          NOT NULL DEFAULT 0,
  message_count    INT          NOT NULL DEFAULT 0,
  messages_json    LONGTEXT     NULL,     -- agent.SessionMessage[] 整包
  source           VARCHAR(32)  NOT NULL DEFAULT 'fork_jsonl',
  archived_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**一会话一行,整包 JSON,不可增量更新** —— 它是「fork(cc-haha)退役前的一次性历史搬运」,
不是运行期写入路径。两个写入器,都由 env 驱动、都在 bootstrap 起 goroutine:

| 写入器 | 触发 | 数据来源 | 代码 |
|---|---|---|---|
| `ArchiveFromFork` | `AGENT_ARCHIVE_FROM_FORK=1` | 调 fork 自己的 `GetSessionMessages`(要求 fork 容器在场) | `archive.go:30-90` / `bootstrap.go:236-243` |
| `ArchiveFromJsonl` | `AGENT_ARCHIVE_FROM_JSONL=<dir>` | **直读磁盘 jsonl**,自己折叠(fork 已删也能跑) | `archive_jsonl.go:56-132` / `bootstrap.go:247-254` |

`ArchiveFromJsonl` 的形状一致性做法值得记:它**不手写 jsonl→message 折叠**,
而是把 jsonl 的 content block 合成 `Event` 流(`parseJsonlToEvents`,`:145-213`)
再调**同一个** `FoldToMessages` ⇒ 与 journal 路径逐块一致(`:12-15` 注释)。

幂等三重跳过(`:75-83`):已有 archive 行 / journal 已有 turn / 找不到 jsonl。

### 🔴 生产实测:它每次 boot 都在跑

`docker-compose.yml:288` `AGENT_ARCHIVE_FROM_JSONL: ${AGENT_ARCHIVE_FROM_JSONL:-/fork-data}`
—— **默认值非空**,`docker-compose.yml:326` 把 `./data/agent:/fork-data:ro` 挂着(实测 134MB 仍在)。
prod compose 同样(`docker-compose.prod.yml:275`、`:307`)。

本次实测启动日志:

```
archive(jsonl): complete archived=0 skipped=452 no_jsonl_or_empty=56 total=508
```

读法:508 个 `agent_sessions` 行里,452 个已有 archive 或已有 journal turn(跳过),
新归档 0(迁移早已完成),**56 个会话三处都没有历史** —— 既无 journal turn、
无 archive 行、也找不到对应 jsonl。这 56 个会话点进去必然是空对话。
(实测佐证:有 turn 的 session 381 个,archive 91 行,并集 452。)

**实测表体量**:91 行 / 14.5MB(`data_length`),`messages_json` 合计 12.5MB,单行最大 0.54MB。
`source` 全部 `fork_jsonl`。archive 里有 2 行的 session 已不在 `agent_sessions`(孤儿归档)。

---

## 8. 体量与增长(全部实测)

### 8.1 表大小

| 表 | 行数 | data MB | index MB | 合计 MB |
|---|---|---|---|---|
| `agent_turn_events` | **150 821** | 47.9 | 20.8 | **68.7** |
| `agent_session_archive` | 91 | 14.5 | 0.0 | 14.5 |
| `agent_turns` | 882 | 0.4 | 0.4 | 0.9 |
| `agent_artifacts` | 1 040 | 0.5 | 0.3 | 0.8 |
| `agent_billing_ledger` | 711 | 0.1 | 0.1 | 0.3 |
| `agent_sessions` | 508 | 0.1 | 0.2 | 0.3 |
| `agent_saga_steps` | 5 | — | — | 0.1 |
| `agent_runs` | 1 | — | — | 0.1 |

事件流时间跨度:`2026-06-27 23:35:51` → `2026-08-07 15:15:26`(约 41 天)。

### 8.2 ev_type 分布 —— 行数与字节严重背离

| ev_type | 行数 | 占比 | 合计 MB | 字节占比 | 平均 B | 最大 KB |
|---|---|---|---|---|---|---|
| `thinking` | 103 154 | 68.4% | 10.45 | 15.5% | 106 | 0.7 |
| `content_delta` | 27 011 | 17.9% | 3.06 | 4.5% | 119 | 4.9 |
| `content_start` | 8 522 | 5.7% | 0.61 | 0.9% | 75 | 0.1 |
| `tool_result` | 3 031 | 2.0% | **6.95** | **24.4%** | 2 404 | **301.3** |
| `permission_request` | 3 028 | 2.0% | 2.48 | 8.7% | 860 | 38.6 |
| `tool_use` | 3 021 | 2.0% | 2.31 | 8.1% | 801 | 38.6 |
| `artifact` | 1 057 | 0.7% | 0.17 | 0.6% | 173 | 0.3 |
| `user_message` | 879 | 0.6% | 0.24 | 0.8% | 289 | 1.3 |
| `message_complete` | 711 | 0.5% | 0.65 | 2.3% | 960 | 2.8 |
| `evidence` | 236 | 0.2% | 0.05 | 0.2% | 222 | 0.6 |
| `error` | 160 | 0.1% | 0.02 | 0.1% | 137 | 3.6 |
| `round_discarded` | 8 | — | 0.00 | — | 27 | — |
| `quota_blocked` | 3 | — | 0.00 | — | 340 | 0.3 |
| **合计** | **150 821** | | **28.5** | | | |

（`SUM(LENGTH(payload))` 合计 28.5MB,表 `data_length` 47.9MB —— 差额是行头/页填充/InnoDB JSON 存储开销。）

**读法**:
- `thinking` 合并策略有效(平均 106B/行 ≈ 一段思考已被 4KB 窗合并),但仍占 68% 的行 ——
  行数压力主要来自它,而它**在 fold 时会产出 `type:"thinking"` 的 assistant message**
  (`eventlog_store.go:430-435`),即会进 seed_history 回喂模型。
- 字节大头是 `tool_result`(单条最大 301KB)。`payload` 是 `JSON` 列(MySQL 内部 LONGBLOB 上限 4GB),
  没有应用层截断 —— **未查实** agent 侧是否对 tool_result 体积封顶。
- `permission_request` 3028 条 ≈ `tool_use` 3021 条,几乎一对一 —— 说明自动 approve 的
  permission 帧全量入库,这部分 2.48MB 是纯审计冗余(前端 fold 不产 message)。

### 8.3 per-feature

| feature | 事件数 | MB | 轮数 | 事件/轮 |
|---|---|---|---|---|
| stat_lab | 131 389 | 18.87 | 711 | 184.8 |
| claw | 9 346 | 3.21 | 94 | 99.4 |
| prism | 3 523 | 1.27 | 20 | 176.2 |
| sci_draw | 3 158 | 0.83 | 18 | 175.4 |
| smart_search | 2 540 | 1.88 | 35 | 72.6 |
| boltslides | 865 | 0.94 | 4 | 216.3 |

**stat_lab 一个 feature 吃掉 87% 的行、66% 的字节**,且 184.8 事件/轮是全站最高。

### 8.4 日增长(实测)

| 日期 | 事件数 | MB |
|---|---|---|
| 2026-07-20 | 665 | 0.31 |
| 2026-07-21 | 3 158 | 0.83 |
| 2026-07-26 | 141 | 0.07 |
| 2026-08-02 | 6 431 | 1.64 |
| 2026-08-05 | 16 483 | 2.46 |
| **2026-08-06** | **114 906** | **16.41** |
| 2026-08-07(截至查询) | 75 | 0.01 |

2026-08-06 一天 11.5 万事件 / 16.4MB —— 是此前全部历史(约 3.6 万行)的 3 倍多。
这是 stat_lab 压测日,不是稳态用户流量,但它给出了**单日上限的量级**:
一个 feature 的一天可以顶掉此前一个半月。

按 08-06 的强度线性外推:~6GB/年 data + ~3GB/年 index。
按 07 月稳态(9600 行/月、7.5MB/月)外推:~90MB/年。
真实值取决于 stat_lab 的采纳曲线,**两者差 60 倍** —— 这正是「永久保留 + 零 TTL」
在这个仓库里的实际风险敞口。

---

## 9. 清理:TTL / 分区滚动 / reaper / 级联

### 9.1 会话历史:**零删除**

实测 grep(`internal/` + `cmd/` 全量,排除测试):
`agent_turns` / `agent_turn_events` / `agent_session_archive` 三张表
**没有任何一处 DELETE / Delete / TRUNCATE / DROP PARTITION**。
唯一的写操作是 INSERT 与 `agent_turns` 的 status UPDATE。

产品口径是明写的(`0071` 头注释 + `cleanup.go:227-228`):
「会话历史永久保留、绝不删除(产品要求):只延展分区、永不 DROP 分区。」

### 9.2 唯一的周期任务:分区延展

`cleanup.go:216-221`:`safego.Go("cleanup-agent-event-partitions")`,开机跑一次 + 每天 05:40。
纯加法。实测下次执行时间在启动日志里。

### 9.3 reaper:只收僵尸状态,不删数据

- boot 一次:`bridge.go:419-425` `ReconcileJournalOnBoot` → `bootstrap.go:172-175`
- 运行期 10 分钟一轮:`bridge.go:431-452` `StartJournalReaper`
- 实现:`eventlog_store.go:216-227` —— `UPDATE agent_turns SET status='aborted'
  WHERE status='running' AND created_at < NOW()-30min`。
  30min = 轮级硬超时默认 15min 的 2 倍;注释警告若某 feature 调大 `TurnTimeout` 超 30min 须同步上调。
- 实测 `status='running'` 当前 **0 行**,`turns_without_events` **0 行**。

### 9.4 级联:实测全断

**无外键**:`information_schema.KEY_COLUMN_USAGE` 对 `agent%` / `prism%` 表查
`REFERENCED_TABLE_NAME IS NOT NULL` → **零行**。所有级联都得靠应用层,而应用层没做。

| 删除动作 | 代码 | 清了什么 | **没清什么** |
|---|---|---|---|
| 用户删某个会话 | `bridge.go:1520-1539` `DeleteSessionByID` | executor 侧 session(含 workdir)+ `agent_sessions` 一行 + 内存水位 | `agent_turns` / `agent_turn_events` / `agent_session_archive` **全留**(成永久孤儿) |
| 重置会话 | `bridge.go:850-912` `ResetSession` | 建新 sid、`UpdateSessionID` repoint、删旧 executor session | 旧 sid 下的全部 journal 行留下,**且再也无法通过 `agent_sessions` 找到** |
| 删 prism 项目 | `prism/service.go:126-144` | MinIO 编译产物 + 全部 owner=project 的 agent 会话 + `DeleteProjectCascade` | 见 §10 的漏表;journal 同样全留 |
| **删用户** | `user/repository.go:489-531` | credit_* / wallet / library_* / users 主行(靠 users 的 FK CASCADE 带走 auth_providers / orders 等) | 代码注释 `:486-488` **自陈**:「仍未清理:peer_review_* / prism_* / user_staging_* 及其对象键、agent_sessions 映射与 agent 容器内 jsonl」。实际还要加上 `agent_turns` / `agent_turn_events` / `agent_session_archive` / `agent_artifacts` —— **删号后该用户的全部对话原文(含 `role_user_text`)与工具输出留在库里** |

**孤儿实测**(`agent_turns` LEFT JOIN `agent_sessions` 无匹配):

| feature | 孤儿会话数 | 孤儿轮数 |
|---|---|---|
| smart_search | 7 | 13 |
| sci_draw | 4 | 4 |
| claw | 2 | 15 |
| prism | 1 | 5 |
| **合计** | **14** | **37** |

`agent_session_archive` 另有 2 行孤儿。

> ⚠️ 口径差异:协调者今天给的孤儿数是 prism 64 / claw 10 / smart_search 7。
> 我这条 SQL 的定义是「`agent_turns.agent_session_id` 在 `agent_sessions` 里没有对应行」,
> 得到 prism 1 / claw 2 / smart_search 7。协调者的 prism 64 大概率是另一口径
> (如 `prism_projects.agent_session_id` 换过、或按 owner 维度统计)。**两者我没有对齐,
> 不确定哪个更贴近「用户看不到的历史」的真实量**。smart_search 的 7 两边一致。

### 9.5 会话工作区(对照)

`agent/src/server/sessions.ts:455` `WORKDIR_TTL_MS = EXECUTOR_WORKDIR_TTL_DAYS(默认 30) × 86400s`;
GC 逻辑 `:477-538`,双重活跃度判定(内存 `lastActiveAt` + 磁盘 mtime),删前再查一次。
**这是全链路唯一真正会删数据的 TTL**,且删的是工作区文件、不是对话。

本机实测 `./data/agent-sessions` 只有 18 个条目(9 个会话 + 9 个 `.active` 标记)、总计 20K,
而库里 508 个会话 / 227 个会话有产物 —— 与 30 天 GC + 本机是开发环境一致。

---

## 10. Prism 的正文文档 —— 与对话历史完全独立的另一套存储

**这是两套东西,一个字节都不共享。**

| | 对话历史 | prism 正文 |
|---|---|---|
| 真源 | `agent_turn_events` | `prism_projects.doc_struct`(current)+ `prism_struct_versions`(版本链) |
| 写入者 | hub tee(帧驱动) | `SaveStructVersion`(轮末 apply / 用户手改) |
| 结构 | append-only 事件 | current 指针 + 追加版本链 |
| 保留 | 永久 | 永久(但删项目时漏删,见下) |

### 10.1 双轨

`prism/model.go:79-95`:
- `SchemaLegacy`(旧裸 LaTeX):**已冻结只读**,正文在 `prism_files` + `prism_file_versions.body`
- `SchemaStruct`(新结构体,当前主轨):正文在 `prism_projects.doc_struct` +
  `prism_struct_versions.doc_struct`(`struct_model.go:161-173`)

`Project.ReadOnly()` 对所有项目恒 `true`(`model.go:88`);`EditFrozen()` 只对 legacy 为 true。

### 10.2 agent 怎么改正文

`prism/workspace.go:29-53` `materializeProject` —— **每轮 AI 之前**把 DB current 铺进会话 cwd:

| cwd 文件 | 内容 | 常量 |
|---|---|---|
| `document.md` | `structToEditorMarkdown(docStruct)` | `md_bridge.go:23` `EditorDocFile` |
| `references.bib` | `renderBib(d.Bibliography)` | `md_bridge.go:27` `BibFile` |
| `terminology.md` | `prism_projects.terminology` 真源 | `md_bridge.go:32` `TerminologyFile` |

agent 用原生 Read/Edit/Write 改这些文件;轮末 `collectWorkspaceChanges` / `applyStructRound`
读回 → `parseEditorMarkdown` → 合并进结构体 → `SaveStruct` → 重投影 → 可重编译。
**cwd 是可丢弃副本,DB 是权威**(`workspace.go:4-9` 注释)。
`authors` / `affiliations` / `bibliography` / `targetTemplate` **不进 agent 编辑面**,
parse 时从既有结构体保留(`md_bridge.go:12-14`)。

⚠️ 已知边界(注释自陈,`workspace.go:9`):MVP 只跟踪 DB 已有文件,**agent 新建的文件不固化**。

### 10.3 版本链

`prism/repository.go:33-59` `SaveStructVersion`:`version_no = cur.VersionNo + 1`,
`status` 在 `pending`/`current`/`superseded` 之间流转(`model.go:28-31`),追加不覆盖。

**实测体量**:
- `prism_struct_versions` 91 行 / 2.52MB,`doc_struct` 平均 **15 393 B**、最大 36.3KB
- `prism_file_versions` 285 行 / 3.52MB,`body` 平均 6 647 B、最大 30.4KB
- `prism_projects` 44 行,`prism_files` 86,`prism_compiles` 37(success 29 / error 8)
- `prism_chat_messages` **10 行,已 stranded**(`model.go:175-176` 明写「对话历史真源是 agent journal,DB 不再存对话」)
- `prism_revision_items` 0 行

### 10.4 🔴 `DeleteProjectCascade` 漏两张表

`prism/repository.go:99-121`,函数名与注释都写「全部子表(版本/文件/编译/编辑/对话)」,实际删的是:

```
prism_file_versions (按 file_id IN)  ✅
prism_files                          ✅
prism_compiles                       ✅
prism_edits                          ✅
prism_projects                       ✅
prism_struct_versions                ❌ 没删
prism_revision_items                 ❌ 没删
```

`prism_struct_versions` 恰恰是 **struct 轨(当前唯一在用的轨)的正文所在**。
删项目后正文版本链整条留库,平均 15KB/版本。

**实测已发生**:`prism_struct_versions` LEFT JOIN `prism_projects` 无匹配 → **1 行**孤儿。
(`prism_file_versions` 孤儿 0 行 —— 因为 legacy 轨那条链删对了。)

这既是存储泄漏,更是**删除语义不成立**:用户点「删除项目」,论文正文其实还在。

### 10.5 编译产物

`prism_compiles.pdf_object_key` / `log_object_key` → MinIO `BucketPrism`(`storage/storage.go:55`)。
`expires_at` 只用于**缓存命中判定**(`repository.go:462`:`expires_at > ?`),
**不是 TTL** —— 没有任何任务按它删行或删对象。
删对象只在两处显式调用:`service.go:128`(删项目)、`service.go:565-580`(显式清编译)。
桶上未查实是否配 lifecycle(`ensureTmpLifecycle` 只对 `BucketPaperPDFs` / `BucketFeedbackAttachments` 见到调用)。

---

## 11. 备份现状

### 11.1 脚本齐全

| 文件 | 作用 |
|---|---|
| `scripts/backup-all.sh` | 三件套冷备:`mysqldump --single-transaction --quick --routines --triggers --events` → `mysql.sql.gz`;`./data/agent` → `agent-claude.tar.gz`;`./data/agent-sessions` → `agent-sessions.tar.gz`;`./data/minio` → `minio.tar.gz`。落 `./backups/<ts>/`,写 `MANIFEST.txt`,`KEEP`(默认 7)滚动 |
| `scripts/backup-cron.sh` | cron 包装:`flock -n` 串行化、补 PATH、落 `backups/backup.log`、可选 `BACKUP_OFFSITE_DEST` rsync 异机 |
| `scripts/install-backup-cron.sh` | 幂等写 crontab(`# SCHOLAY_BACKUP` 标记),默认每天 04:00,`KEEP=14` |
| `scripts/RESTORE.md` | 恢复手册(**刻意不做成一键脚本**,因为恢复是破坏性操作) |

设计上考虑得很到位:`backup-all.sh:5-15` 明确点出 mysqldump 的三个盲区
(agent 容器盘的对话 jsonl、会话 cwd、MinIO 二进制),
`backup-cron.sh:6-9` 解释了为什么不做成 compose sidecar(挂 docker.sock = 给容器 root 等价权限)。

### 11.2 🔴 但它从未被定时执行

实测:

```
$ crontab -l
crontab: no crontab for youngp

$ ls -la backups/
20260604-172259/                    ← 2026-06-04 手动跑的一份全量
data-migrate-20260728-1756/         ← 2026-07-28 的迁移临时目录,不是备份
（无 backup.log,无 .backup.lock）
```

`backups/20260604-172259/` 内容完整(mysql.sql.gz 1.6MB / agent-claude 89MB /
agent-sessions 64MB / minio 44MB),证明脚本本身能跑通。

**结论:最近一份可用全量冷备的时间点是 2026-06-04,距今 64 天。**
这 64 天里落库的 14.8 万条事件、1040 条产物、全部 stat_lab 会话,**零备份**。
且 `agent_turn_events` 是永久保留的唯一真源、无第二副本、无 binlog PITR(未查实是否开 binlog)。

> 注:这是**本机(开发者 macOS)** 的 crontab。生产服务器的 crontab 我无法从这里读到,
> **不确定生产上是否装了**。但两点值得警惕:① 本次所有 SQL 打的就是这台机器上的
> `scholar_mysql`,而它的数据与协调者所称「生产实测」一致;② `backups/` 目录里没有
> 任何自 2026-06-04 之后的产物,若生产是同一份 repo checkout,那答案就是「没装」。
> 记忆索引里 `prod-audit-2026-07` 也记着「P0 运维=零备份(cron 从未装)」。

---

## 12. 风险清单(按严重度)

| # | 风险 | 证据 | 影响 |
|---|---|---|---|
| P0-1 | 定时备份从未运行,最近全量冷备 2026-06-04 | `crontab -l` 空;`ls backups/` | 唯一真源无副本;盘挂 = 64 天对话与产物全灭 |
| P0-2 | `BeginTurn` 失败 ⇒ 整轮零事件入库,只有一条 "live unaffected" 的 Warn | `hub.go:1876-1899` | 静默丢整轮历史,事后无法检测(丢的轮连行都没有) |
| P0-3 | `DeleteProjectCascade` 漏删 `prism_struct_versions` / `prism_revision_items` | `prism/repository.go:99-121`;实测 1 行孤儿 | 删项目后论文正文仍在库 —— 删除语义不成立 |
| P1-1 | 删用户不清任何 agent 数据 | `user/repository.go:486-488` 自陈 + 无外键 | 删号后 `role_user_text`(用户原文)与全部工具输出留存 |
| P1-2 | 分区裁剪恒为 0,分区数每月 +1 且永不回收 | EXPLAIN 实测 19 分区全扫;`cleanup.go:227-228` | 历史读成本随系统年龄线性劣化,与数据量无关 |
| P1-3 | 增长完全无界且 stat_lab 单 feature 占 87% 行 | 08-06 单日 11.5 万行 / 16.4MB | 稳态 vs 压测外推差 60 倍;无 TTL 无归档无冷热分层 |
| P1-4 | `WriteFailures()` 只在优雅退出时打一行日志 | `bridge.go:411`(全仓唯一调用点) | journal 完整性没有运行期可观测 |
| P2-1 | 删/重置会话留下永久 journal 孤儿 | 实测 14 会话 / 37 轮孤儿 + 2 行孤儿归档 | 存储泄漏 + 用户以为删掉了 |
| P2-2 | 56 个会话在 journal/archive/jsonl 三处都无历史 | 启动日志 `no_jsonl_or_empty=56` | 用户点进去是空对话,无法解释 |
| P2-3 | 非优雅退出丢 `writeCh`(2048)+ `overflow`(50000) 的中段帧 | `eventlog_batcher.go:35-36`, `:246-260` | 历史变「有结论无过程」,fold 不报错 |
| P2-4 | 硬超时后散帧既不广播也不入库 | `hub.go:1620-1625` | 超时轮的后续真实产出永久不可见 |
| P3-1 | `idx_sid_id` 零查询使用 | grep 全仓仅 `eventlog_store.go:251/275` 两条 SQL,均按 turn_id | 纯写放大(表 20.8MB 索引的一部分) |
| P3-2 | `ev_seq` 内存分配 + duplicate key 被当成功 | `eventlog_batcher.go:53`, `:131-133` | 今天不可达,但无测试守护该不变式 |
| P3-3 | `agent_turns.user_id` 是 `int unsigned`,`agent_sessions.user_id` 是 `bigint unsigned` | 两处 SHOW CREATE TABLE | 类型不一致;JOIN 可用但迁移/扩容时是坑 |
| P3-4 | `JournalValidator` 比对目标是 `client.GetSessionMessages`,而 executor 已无状态 | `eventlog_validate.go:26-33`, `:44-46` | 该校验器**疑似已失效**(`.env` 里 `=off`,未实测) |

---

## 13. 明确「没查实 / 不确定」的地方

1. **生产 crontab**。本机 `crontab -l` 为空;生产服务器的 crontab 我从这里读不到。
   §11.2 的推断有前提,不是直接证据。
2. **MySQL 是否开 binlog / 有无 PITR 能力**。未查。若开着,§11 的风险可以降一档。
3. **孤儿口径与协调者对不上**(prism 1 vs 64,claw 2 vs 10)。我给了我的 SQL 定义;
   两套口径没有对齐,不确定哪个更贴近用户体感。
4. **`tool_result` payload 是否有上游封顶**。库里最大 301KB,未去 agent 侧查是否有截断常量。
5. **`agent_turns.attempt` 的实际分布**。没跑 SQL(hub.go:701 注释说「全库为 0」,
   但那是 provider failover 上线前的观察,现已启用)。
6. **MinIO 各桶是否配 lifecycle**。只看到 `ensureTmpLifecycle` 对
   `BucketPaperPDFs` / `BucketFeedbackAttachments` 的调用,`BucketPrism` /
   `BucketAgentArtifacts` 未逐行确认。
7. **`prism_chat_messages` 那 10 行是什么时候的**。已确认 stranded(无代码读写),未查时间。
8. **前端如何消费 `hasMore` / 分页**。只看了后端契约(`ReadRecentTurns` 默认 30 轮),
   没看 `frontend-user` 侧。
9. **`JournalValidator` 是否真的失效**。`.env` 里 `=off`,没有开着跑过验证。
10. **本机 `./data/agent-sessions` 只有 20K / 9 个会话目录**是否等于生产状态。
    与 30 天 GC 一致,但也可能是开发机挂载问题(记忆索引里有「dev 缺 sessions 挂载」的记录)。

---

## 附:关键文件索引

| 关注点 | 文件 |
|---|---|
| 契约与 EvType 全表 | `backend/internal/agentbridge/eventlog.go` |
| GORM 模型 | `backend/internal/agentbridge/journal_model.go` |
| MySQL 实现 + 读侧 + fold | `backend/internal/agentbridge/eventlog_store.go` |
| 写侧合并 batcher | `backend/internal/agentbridge/eventlog_batcher.go` |
| 薄编排层 | `backend/internal/agentbridge/turncoord.go` |
| 归档(fork 在场) | `backend/internal/agentbridge/archive.go` |
| 归档(直读 jsonl) | `backend/internal/agentbridge/archive_jsonl.go` |
| journal==daemon 校验器 | `backend/internal/agentbridge/eventlog_validate.go` |
| tee 点 / seed / 轮生命周期 | `backend/internal/agentbridge/hub.go` |
| 读路径开关与三级回退 | `backend/internal/agentbridge/bridge.go` |
| admin transcript | `backend/internal/agentbridge/admin_monitor.go` |
| 分区延展任务 | `backend/internal/common/cleanup/cleanup.go` |
| 建表 + 分区 | `docker/mysql/migrations/0046_agent_turn_journal_fields.sql` |
| 索引 | `docker/mysql/migrations/0047_agent_turn_journal_indexes.sql` |
| 归档表 | `docker/mysql/migrations/0051_agent_session_archive_fields.sql` |
| 分区延展迁移 | `docker/mysql/migrations/0071_agent_tables_partition_indexes.sql` |
| 分区存储过程 | `docker/mysql/migrations/0000_utils.sql:134-173` |
| prism 正文模型 | `backend/internal/prism/model.go` / `struct_model.go` |
| prism cwd 铺源/回收 | `backend/internal/prism/workspace.go` / `md_bridge.go` |
| prism 删除级联 | `backend/internal/prism/repository.go:99-121` / `service.go:126-144` |
| 删用户 | `backend/internal/user/repository.go:489-531` |
| 备份 | `scripts/backup-all.sh` / `backup-cron.sh` / `install-backup-cron.sh` / `RESTORE.md` |
