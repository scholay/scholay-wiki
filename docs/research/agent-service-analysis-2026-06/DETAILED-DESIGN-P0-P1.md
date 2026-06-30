<!-- 2026-06-27 · Implementation-ready detailed design for Foundation + P0 + P1 of the web-native re-architecture. Method: 6 parallel code-grounded design agents → synthesize → adversarial critique (verdict: APPROVE WITH MINOR FIXES, all applied) → finalize. 9 agents. Verified against branch audit-fixes-2026-06: real next migration = 0046. Companion to REPORT.md (diagnosis) + REDESIGN-BLUEPRINT.md (target+migration). -->

# Scholar Agent 重构 · 详细设计 (Foundation + P0 + P1)

> 本文是 Foundation 契约 + P0 (影子日志) + P1 (读/回放走日志) 的 implementation-ready 详细设计。已逐条核对真实代码(branch `audit-fixes-2026-06`),并修正了 blueprint 的若干占位/隐藏 bug。涉及 P2+ 的部分**只定契约、不写执行**。本版相对初稿已收口三处实现约束 + 一处编译级正名(见文末汇总)。

---

## 0. 范围与前置(本文覆盖什么、不覆盖什么、依赖的 v2 铁律)

### 0.1 覆盖
- **Foundation 契约(一次设计对、所有阶段共用)**:数据模型(表 + 迁移)、事件 schema + turn 生命周期、eventlog 读写契约、Projector 契约、Executor-seam 契约(P3 实现,现在冻结)、Saga 步模型(契约,P5 消费)。
- **P0 = 影子日志**:`hub.go` 在 jsonl + 内存 hub 仍权威的前提下,**额外**把每一帧 + 每个用户轮 append 进新日志;**从第一天就带 200ms/4KB 写侧合并 batcher**(绝不 per-delta 同步写 MySQL);+ journal==jsonl 持续校验 harness;+ peerreview 廉价止血(reconcile 跳过已持久化的 reviewer)。
- **P1 = 读/回放走日志**:`GetSessionMessages` 历史读 + 迟到/进行中续流读从日志取(不再走 daemon/replayBuf);删 `replayBuf`;**这一步即修复 active data-loss bug (HIGH#3) 与 agent-history-reentry bug**;fork 仍执行;**P1 计费语义完全不变**。

### 0.2 不覆盖(只定契约,不写执行)
P2(state 外置 Redis)、P3(新 executor + turn_id 计费翻转)、P4/P5/P6。新 TS executor 本体不在本文构建。

### 0.3 依赖的 v2 铁律(不可违反)
1. **存储栈 = MySQL 8 (utf8mb4) + Redis**,非 Postgres。无 `RETURNING`/`JSONB`;用 `JSON` 类型、`INSERT...ON DUPLICATE KEY UPDATE`、`FOR UPDATE SKIP LOCKED` 或 `RowsAffected==1` 认领。
2. **迁移号已核实**:磁盘最新 = `0045_seo_authors_orcid_fields.sql`,**下一个空号 = 0046**(blueprint 的 0071 是占位,作废)。存储过程签名(`0000_utils.sql` 已核实):`add_column_if_not_exists(table,col,def)`、`add_index_if_not_exists(table,name,cols,p_is_unique BOOLEAN)`。
3. **provider-agnostic**:绑定 Anthropic Messages API 协议,不绑 DeepSeek、不要求 Anthropic 模型。上游 = `agentconfig` 单行 `base_url+token+3 槽`,runtime 可切;DeepSeek 只是当前实例。
4. **clean-room,零 cc-haha 血统**:未来 executor 是从零自有 agent;无 jsonl/`~/.claude`/`--resume` 血统。seam 契约不得假设其中任何一个。
5. **single-host now,但不锁死 single-instance**:本文新增的任何东西都不得 process-local 到阻塞日后 2-replica。P0/P1 fork 仍执行 → sticky-by-session 仍需(jsonl 单写者墙到 P3 才拆),但日志/表必须 replica-safe。
6. **P0 batcher 强制**;**P1 jsonl 仍权威**(读切换一个 flag 可逆);持续(非一次性)journal==jsonl 校验。
7. **计费**:P1 不动计费语义(无 turn_id 账本翻转,那是 P3)。`agent_billing_ledger` P0 仅作影子记录。

---

## 1. 数据模型与迁移(真实迁移号、完整 DDL、GORM 模型、分区/保留)

四张逻辑表,按仓库 `_fields`/`_indexes` 拆分约定分四个文件。`agent_turns`/`agent_turn_events`/`agent_billing_ledger` 是 P0/P1 地基,合在 0046/0047;`agent_saga_steps` 是 P5 契约,单独 0048/0049。

> **分区表硬约束(load-bearing,blueprint 的 DDL 草案在此处会建表失败)**:`agent_turn_events` 用月度 RANGE 分区,分区列 `created_at` 必须进**每个** UNIQUE/PRIMARY KEY。故 `PRIMARY KEY (id, created_at)` + `UNIQUE (turn_id, ev_seq, created_at)`。`id` 仍 `AUTO_INCREMENT` 且全局单调(InnoDB 自增独立于分区),所以「历史读 = `ORDER BY id`」的全序成立。分区表唯一键不能事后用 `add_index_if_not_exists` 补(proc 发的是普通 `CREATE INDEX`),故 PK/uk **内联在建表 DDL**。

### 1.1 `0046_agent_turn_journal_fields.sql`

```sql
-- ============================================================================
-- 0046 · agent turn 账本 + 事件日志 + 计费影子。Web-native 重构地基。
--   agent_turns          : turn 账本(工作单元 = turn,幂等/可回放/可计费/可归属)。
--   agent_turn_events    : event-sourced 会话日志(真源演进目标),月度 RANGE 分区。
--   agent_billing_ledger : P0 仅 shadow 记录(turn_id 幂等);P3 才作权威账本。
-- P0: shadow 写(hub.go 额外 append),jsonl + 内存 hub 仍权威。
-- P1: 历史/在途读切到本表;fork 仍执行,计费语义不变。
-- lease/fence/executor_id/attempt 列现在定义、P3 才激活(见 §1.6 vestigial)。
-- 幂等: CREATE TABLE IF NOT EXISTS + add_column_if_not_exists。永不 DROP TABLE。
-- charset: utf8mb4(中文用户原文必须 utf8mb4,见 memory: migration-utf8-charset)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_turns` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT       COMMENT 'turn 全局自增主键',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '所属 agent 会话(=agent_sessions.agent_session_id)',
  `feature_key`      VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT 'smart_search/claw/prism/peerreview',
  `user_id`          INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT '归属用户(冗余,免 join 计费/审计)',
  `seq`              INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT 'per-session 单调轮号(回放/排序)',
  `client_turn_id`   VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '幂等键(浏览器/编排器给)→ exactly-once',
  `role_user_text`   MEDIUMTEXT                                    COMMENT '用户原文(已 strip、未注入 system prefix)',
  `status`           VARCHAR(16)     NOT NULL DEFAULT 'running'    COMMENT 'queued|running|complete|failed|aborted',
  `kind`             VARCHAR(24)     NOT NULL DEFAULT 'interactive' COMMENT 'interactive|memory_extract|title|saga_step(计费分流锚)',
  `model_main`       VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '本轮主模型(message_complete 回填)',
  `attempt`          INT             NOT NULL DEFAULT 0            COMMENT 'P3+ 重试计数→DLQ;P0/P1 恒 0',
  `executor_id`      VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT 'P3+ 租到本 turn 的 worker;P0/P1 恒空',
  `lease_until`      DATETIME(3)     NULL                          COMMENT 'P3+ 租约过期→重排队;P0/P1 恒 NULL',
  `fence_token`      BIGINT UNSIGNED NOT NULL DEFAULT 0            COMMENT 'P3+ 单调 fencing token 防 split-brain;P0/P1 恒 0',
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'turn 入队时刻',
  `completed_at`     DATETIME(3)     NULL                          COMMENT 'turn 终态时刻',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent turn 账本(turn ledger + lease + fence + 幂等键)';

-- 旧库兜底(本表全新,生产无存量,守迁移红线)。
CALL add_column_if_not_exists('agent_turns', 'kind',        "VARCHAR(24) NOT NULL DEFAULT 'interactive'");
CALL add_column_if_not_exists('agent_turns', 'executor_id', "VARCHAR(64) NOT NULL DEFAULT ''");
CALL add_column_if_not_exists('agent_turns', 'lease_until',  "DATETIME(3) NULL");
CALL add_column_if_not_exists('agent_turns', 'fence_token',  "BIGINT UNSIGNED NOT NULL DEFAULT 0");

-- ── 事件溯源日志(写最重、读最杂)。月度 RANGE 分区;唯一键含分区列 created_at。──
CREATE TABLE IF NOT EXISTS `agent_turn_events` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT       COMMENT '全局单调事件id(回放全序键)',
  `turn_id`          BIGINT UNSIGNED NOT NULL DEFAULT 0            COMMENT '所属 turn(=agent_turns.id)',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '冗余:免 join 按会话回放/监控',
  `ev_seq`           INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT 'turn 内序号(回放顺序 + Last-Event-ID)',
  `ev_type`          VARCHAR(32)     NOT NULL DEFAULT ''           COMMENT 'user_message|content_delta|tool_use|tool_result|message_complete|error|permission_request',
  `payload`          JSON            NOT NULL                      COMMENT '帧体,直接沿用发给浏览器的 frame shape(content_delta 已写侧合并)',
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '事件落库时刻(=RANGE 分区键)',
  PRIMARY KEY (`id`, `created_at`),
  UNIQUE KEY `uk_turn_ev_seq` (`turn_id`, `ev_seq`, `created_at`),
  KEY `idx_sid_id` (`agent_session_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent 事件溯源日志(月度 RANGE 分区)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_init   VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2607    VALUES LESS THAN (TO_DAYS('2026-08-01')),
  PARTITION p2608    VALUES LESS THAN (TO_DAYS('2026-09-01')),
  PARTITION p2609    VALUES LESS THAN (TO_DAYS('2026-10-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- ── 计费影子账本(turn_id 幂等)。P0 shadow,P3 权威。──
CREATE TABLE IF NOT EXISTS `agent_billing_ledger` (
  `turn_id`          BIGINT UNSIGNED NOT NULL                     COMMENT '幂等键 = turn(重放 ON DUPLICATE no-op)',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''          COMMENT '所属会话',
  `user_id`          INT UNSIGNED    NOT NULL DEFAULT 0           COMMENT '归属用户',
  `feature_key`      VARCHAR(64)     NOT NULL DEFAULT ''          COMMENT 'feature',
  `kind`             VARCHAR(24)     NOT NULL DEFAULT 'interactive' COMMENT '同 agent_turns.kind,计费分流',
  `input_tokens`     BIGINT          NOT NULL DEFAULT 0,
  `output_tokens`    BIGINT          NOT NULL DEFAULT 0,
  `cache_read`       BIGINT          NOT NULL DEFAULT 0,
  `cache_creation`   BIGINT          NOT NULL DEFAULT 0,
  `recorded_at`      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`turn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent per-turn 幂等计费账本(P0 shadow only)';
```

### 1.2 `0047_agent_turn_journal_indexes.sql`

```sql
-- ============================================================================
-- 0047 · agent_turns / agent_billing_ledger 索引
-- 注: agent_turn_events 的 PK/uk/idx 已随 0046 建表内联(分区表唯一键须含分区列,
--     不能事后 add_index_if_not_exists 再补)。本文件只补非分区表索引。
-- ============================================================================

-- exactly-once 幂等(同会话同 client_turn_id 只一行)。见 §2.4: BeginTurn 必须给真 UUID,绝不留 ''。
CALL add_index_if_not_exists('agent_turns', 'uk_session_client_turn', '`agent_session_id`, `client_turn_id`', TRUE);
-- per-session 轮号单调唯一(回放/分页排序键)。
CALL add_index_if_not_exists('agent_turns', 'uk_session_seq',         '`agent_session_id`, `seq`',            TRUE);
-- 在途轮定位(P1: WHERE agent_session_id=? AND status='running')。
CALL add_index_if_not_exists('agent_turns', 'idx_session_status',     '`agent_session_id`, `status`',         FALSE);
-- P3 reconciler 扫过期租约(P0/P1 不启用该扫描)。
CALL add_index_if_not_exists('agent_turns', 'idx_status_lease',       '`status`, `lease_until`',              FALSE);
-- admin 监控/审计按用户时间窗。
CALL add_index_if_not_exists('agent_turns', 'idx_user_created',       '`user_id`, `created_at`',              FALSE);

-- 计费对账报告(SUM by user / session)。
CALL add_index_if_not_exists('agent_billing_ledger', 'idx_user_recorded',    '`user_id`, `recorded_at`',          FALSE);
CALL add_index_if_not_exists('agent_billing_ledger', 'idx_session_recorded', '`agent_session_id`, `recorded_at`', FALSE);
```

### 1.3 `0048_agent_saga_steps_fields.sql`(P5 契约,现在建表)

```sql
-- ============================================================================
-- 0048 · agent_saga_steps —— 通用 durable 多步编排底座(P5 peerreview 骑它)。
--   每 (saga_id, step_key) 一行 = per-round 记账。原子认领 = RowsAffected==1 UPDATE
--   (MySQL 无 RETURNING);租约过期→reconciler 重排队;attempt>=MaxRetry→failed(DLQ)。
-- 幂等: CREATE TABLE IF NOT EXISTS。utf8mb4(中文 output_ref/error)。本表 P0/P1 不消费。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_saga_steps` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `saga_id`      VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '命名空间化, e.g. peerreview:<submissionID>',
  `feature_key`  VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '编排所属 feature',
  `step_key`     VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT 'methodology|alpha|beta|gamma|chief',
  `status`       VARCHAR(16)     NOT NULL DEFAULT 'pending' COMMENT 'pending|running|done|failed',
  `attempt`      INT             NOT NULL DEFAULT 0   COMMENT '每次认领自增;>=MaxRetry→failed DLQ',
  `executor_id`  VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '认领该步的 worker',
  `lease_until`  DATETIME(3)     NULL                 COMMENT '租约过期→reconciler 重排队',
  `turn_id`      BIGINT UNSIGNED NULL                 COMMENT '执行该步的 turn(=agent_turns.id)',
  `output_ref`   JSON            NULL                 COMMENT '结构化结果(ReviewerOutput/methodology 文本)',
  `error`        TEXT            NULL                 COMMENT '终态失败原因(DLQ 可读)',
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='多 agent 编排 per-step 进度(P5 消费)';
```

### 1.4 `0049_agent_saga_steps_indexes.sql`

```sql
-- 每 (saga, step) 唯一 = exactly-one-row-per-round 硬守卫(取代应用层"已存在就跳")。
CALL add_index_if_not_exists('agent_saga_steps', 'uk_saga_step',     '`saga_id`, `step_key`',     TRUE);
-- 按 saga 取全步进度(resume / 流式投影 / status 派生)。
CALL add_index_if_not_exists('agent_saga_steps', 'idx_saga_status',  '`saga_id`, `status`',       FALSE);
-- reconciler 扫过期租约 + 待认领步。
CALL add_index_if_not_exists('agent_saga_steps', 'idx_status_lease', '`status`, `lease_until`',   FALSE);
```

### 1.5 GORM 模型(`backend/internal/agentbridge/journal_model.go`,新文件)

放新文件而非塞进 `repository.go`(后者是 `agent_sessions` 映射 repo;日志/turn/账本/saga 是 event-sourcing 脊柱,独立关注点)。tag/`TableName()`/nullable 指针风格镜像 `SessionRow`(repository.go:43-67)。**JSON 列用 `json.RawMessage`**(与 `peerreview/model.go` 一致,不引 `gorm.io/datatypes` 新依赖)。

```go
package agentbridge

import (
	"encoding/json"
	"time"
)

// Turn = agent_turns 一行 = 一个 turn(工作单元)。见 0046/0047。
// P0: shadow 写;P1: 历史/在途读源。lease/fence/executor_id/attempt 见 §1.6 vestigial。
type Turn struct {
	ID             uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	AgentSessionID string     `gorm:"column:agent_session_id;type:varchar(64);not null;default:''"`
	FeatureKey     string     `gorm:"column:feature_key;type:varchar(64);not null;default:''"`
	UserID         uint       `gorm:"column:user_id;not null;default:0"`
	Seq            uint       `gorm:"column:seq;not null;default:0"`
	ClientTurnID   string     `gorm:"column:client_turn_id;type:varchar(64);not null;default:''"`
	RoleUserText   string     `gorm:"column:role_user_text;type:mediumtext"`
	Status         string     `gorm:"column:status;type:varchar(16);not null;default:'running'"`
	Kind           string     `gorm:"column:kind;type:varchar(24);not null;default:'interactive'"`
	ModelMain      string     `gorm:"column:model_main;type:varchar(64);not null;default:''"`
	Attempt        int        `gorm:"column:attempt;not null;default:0"`     // P3+ INERT
	ExecutorID     string     `gorm:"column:executor_id;type:varchar(64);not null;default:''"` // P3+ INERT
	LeaseUntil     *time.Time `gorm:"column:lease_until"`                    // P3+ INERT
	FenceToken     uint64     `gorm:"column:fence_token;not null;default:0"` // P3+ INERT
	CreatedAt      time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP(3)"`
	CompletedAt    *time.Time `gorm:"column:completed_at"`

	existed bool `gorm:"-"` // BeginTurn 内部回读命中标记,不映射列(见 §4.2)
}
func (Turn) TableName() string { return "agent_turns" }

// TurnEventRow = agent_turn_events 一行。Payload 直接是发给浏览器的 frame bytes;
// content_delta 已写侧合并(取代 hub.coalesceReplay)。
type TurnEventRow struct {
	ID             uint64          `gorm:"column:id;primaryKey;autoIncrement"`
	TurnID         uint64          `gorm:"column:turn_id;not null;default:0"`
	AgentSessionID string          `gorm:"column:agent_session_id;type:varchar(64);not null;default:''"`
	EvSeq          uint            `gorm:"column:ev_seq;not null;default:0"`
	EvType         string          `gorm:"column:ev_type;type:varchar(32);not null;default:''"`
	Payload        json.RawMessage `gorm:"column:payload;type:json;not null"`
	CreatedAt      time.Time       `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP(3)"`
}
func (TurnEventRow) TableName() string { return "agent_turn_events" }

// BillingLedgerRow = agent_billing_ledger 一行 = per-turn 幂等计费。P0 shadow only。
type BillingLedgerRow struct {
	TurnID         uint64    `gorm:"column:turn_id;primaryKey"`
	AgentSessionID string    `gorm:"column:agent_session_id;type:varchar(64);not null;default:''"`
	UserID         uint      `gorm:"column:user_id;not null;default:0"`
	FeatureKey     string    `gorm:"column:feature_key;type:varchar(64);not null;default:''"`
	Kind           string    `gorm:"column:kind;type:varchar(24);not null;default:'interactive'"`
	InputTokens    int64     `gorm:"column:input_tokens;not null;default:0"`
	OutputTokens   int64     `gorm:"column:output_tokens;not null;default:0"`
	CacheRead      int64     `gorm:"column:cache_read;not null;default:0"`
	CacheCreation  int64     `gorm:"column:cache_creation;not null;default:0"`
	RecordedAt     time.Time `gorm:"column:recorded_at;not null;default:CURRENT_TIMESTAMP(3)"`
}
func (BillingLedgerRow) TableName() string { return "agent_billing_ledger" }

// SagaStepRow = agent_saga_steps 一行。P5 消费(本文不写引擎)。
type SagaStepRow struct {
	ID         uint64          `gorm:"column:id;primaryKey;autoIncrement"`
	SagaID     string          `gorm:"column:saga_id;type:varchar(64);not null;default:''"`
	FeatureKey string          `gorm:"column:feature_key;type:varchar(64);not null;default:''"`
	StepKey    string          `gorm:"column:step_key;type:varchar(64);not null;default:''"`
	Status     string          `gorm:"column:status;type:varchar(16);not null;default:'pending'"`
	Attempt    int             `gorm:"column:attempt;not null;default:0"`
	ExecutorID string          `gorm:"column:executor_id;type:varchar(64);not null;default:''"`
	LeaseUntil *time.Time      `gorm:"column:lease_until"`
	TurnID     *uint64         `gorm:"column:turn_id"`
	OutputRef  json.RawMessage `gorm:"column:output_ref;type:json"`
	Error      string          `gorm:"column:error;type:text"`
	CreatedAt  time.Time       `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP(3)"`
	UpdatedAt  time.Time       `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP(3)"`
}
func (SagaStepRow) TableName() string { return "agent_saga_steps" }
```

### 1.6 Vestigial 列(现在定义,P3+ 激活)— 不得误导

| 列 (表) | 激活阶段 | P0/P1 为何 inert |
|---|---|---|
| `agent_turns.executor_id` | **P3+** | 标识哪个 stateless worker 租了 turn。P0/P1 fork 仍执行(无 worker 池),恒 `''`。现在定义是为冻结 turn 行形。 |
| `agent_turns.lease_until` | **P3+** | crash 检测:过期租约→重排队。P0/P1 无 leasing(sticky+jsonl 单写者墙仍在),恒 NULL。`idx_status_lease` 存在但 reconciler 扫描 P3 才调度。 |
| `agent_turns.fence_token` | **P3+** | 单调 fencing token 防过期 leaseholder 双写。无 leasing 即无意义,恒 0。现在定义因日后给在途 turn 补 fence 不安全。 |
| `agent_turns.attempt` | **P3+** | 重试/DLQ 计数。P0/P1 无重排队→0。 |
| `agent_turns.kind` | **P0 部分** | P0 即写(`interactive`/`memory_extract`/`title`),让 P3 计费翻转 + 现有 `recordOutOfBandTokens kind=memory_extract` 对齐。**非 vestigial,早需。** |
| `agent_billing_ledger.*` (整表) | **P3 权威** | P0 仅 shadow 记录,真账本仍 `llm_token_usage`(`recordAgentTokens`)+ 日额度 `vip.AddUsage`。**P1 不动计费语义。**表存在让影子对账 harness 在 P3 切换前验证 per-turn 数。 |
| `agent_saga_steps.*` (整表) | **P5** | 纯契约。P0 peerreview 廉价止血只用既有 `peer_review_reports`,不碰本表。 |

### 1.7 容量 / 保留 / 分区计划

**行量估算公式**(上线前用真实流量中位数算,别拍脑袋):
```
日行数 ≈ 日活_turn数 × (coalesced_delta行 + tool行) / turn
  coalesced_delta行 = O(content-blocks),由 §3 的 200ms/4KB batcher 封顶(不是 O(tokens))
  tool行 = 该 turn 的 MCP/Bash 调用数(claw/prism 高,smart_search≈0)
月增行数 = 日行数 × 30;月增磁盘 ≈ 月增行数 × 平均行字节(payload JSON 主导)
```
P0 写日志但不读 → 免费攒一周影子数据,据此定分区周期 + 保留 N。

**分区**:月度 `RANGE (TO_DAYS(created_at))`(DDL 见 §1.1)。`DROP PARTITION` 删旧月是 O(1) 元数据,不 IO storm。

**归档 job(幂等,独立于 schema-sync,绝不进迁移文件)**:Go 后台任务(挂 `internal/common/cleanup/`)或 cron 容器,**取 Redis advisory lock 保证 2-replica 只跑一次**:
1. **滚动新分区**:每月 `ALTER TABLE agent_turn_events REORGANIZE PARTITION p_future INTO (...)`,守「本月分区不存在」幂等。
2. **删旧分区**:`ALTER TABLE ... DROP PARTITION pYYMM`(老于保留 N),且**仅在**收尾步把折叠后精简 transcript 归档(窄表/MinIO)之后。verbose 行可弃,合规副本另存。

**读写隔离(硬规则)**:
- **Live 扇出绝不读 MySQL**。Live = Redis Stream(P2);P0/P1 仍来自内存 hub(jsonl 权威)。MySQL 只读于 (a) 历史分页 (b) 迟到续流回放(Redis Stream 已 trim 的行)。
- **写**:per-delta 行绝不入 MySQL,只有合并行(O(content-blocks))+ turn 终态。这正是 200ms/4KB batcher 的全部意义。
- 历史读用 `idx_sid_id (agent_session_id, id)` 加 `id` 窗口;admin 监控读限 `agent_session_id` + 时间窗,绝不全表扫。

---

## 2. 事件 schema 与 turn 生命周期(跨阶段契约)

### 2.1 事件 taxonomy(`ev_type`)与 payload 形状

`payload` JSON 存**今天发给浏览器的那一份 frame body 原样**(`broadcastAgent` 扇出的字节),使 P1 读路径零再编码漂移地重建相同 wire 帧。帧来源已逐行核对 `upstreamLoop`(hub.go:343-438):

| `ev_type` | 来源 | payload 形状 | 入日志? | 今天广播? |
|---|---|---|---|---|
| `user_message` | turn-begin 由 `extractUserMessageContent`(ws.go) 取**原文**(= `userEchoFrame` 用的 content) | `{"type":"user_message","content":"<原文>"}` | **是**(持久化取代内存 `inFlightUserText`) | 否(用户自己输入) |
| `content_delta` | 上游帧,hub.go:437 扇出 | `{"type":"content_delta","text":"…"}` 或 toolInput 变体 | **是,合并写**(§3) | 是 |
| `tool_use` | 上游帧 | passthrough | 是 | 是 |
| `tool_result` | 上游帧 | passthrough | 是 | 是 |
| `permission_request` | 上游,hub.go:358 | passthrough(auto 模式仍透传,fold 忽略) | 是(审计) | 是 |
| `message_complete` | 上游,hub.go:371 | 整帧含 usage/calls/session_total | **是 — TURN 终结符** | 是 |
| `error` | 合成(quota/prompt)或上游 error,**仅当它终结一轮** | `{"type":"error","code","message","retryable"}` | 是(终结轮时) | 是 |

**显式不入日志**(纯后端信号,`continue` 不广播,hub.go:412/421):`token_usage`、`memory_update`、`ping`/`pong`。也不入:`busy`(per-subscriber 竞态守卫,非任何 turn 的事件)、`user_echo`(派生 — 迟到者从日志的 `user_message` 合成,§4)、`session_title_updated`(标题真源在 DB 经 `OnTitleResult`,P0/P1 跳过保 payload 精简)。`displaced`/`resync_user`(Hub 模型下死代码,不入)。

### 2.2 `ev_seq` / `id` 语义(Last-Event-ID)
- `ev_seq` = **per-turn** 单调(0 基),`AppendEvent` 在合并锁内分配(**delta 与非 delta 共用同一 `accum.nextSeq`、同一把 `mu`**,见 §3.2 硬约束),`UNIQUE(turn_id, ev_seq, created_at)` 保无 gap 无 dup。
- `id` = 全局单调(AUTO_INCREMENT),**跨轮排序键**;整会话 transcript 读 = `ORDER BY id`。
- P0/P1 live tail 仍是内存 hub,浏览器**不**经 wire 发 Last-Event-ID;cursor 是 server 内部(Projector 在迟到订阅者 attach 时算)。wire Last-Event-ID 协议是 P2 契约(Redis Stream entry id),schema 已为此塑形(`ev_seq` 是稳定 per-turn 序数)。

### 2.3 turn 状态机

```
              BeginTurn (幂等 INSERT, status=running)
   (none) ─────────────────────────────────────────► running
                                                        │
   [P0/P1: 写 queued→running 的 begin 由同一 hub goroutine 本地完成;          │
    P3+: executor XREADGROUP 认领 queued→running 带 fence/lease]               │
                                                ┌───────┼────────────┐
              CompleteTurn(message_complete)    ▼       ▼ FailTurn    ▼ AbortTurn
                                             complete  failed       aborted
                                            (terminal)(terminal)   (terminal)
```
**终态** `complete|failed|aborted` 不可再转(重投递是幂等 no-op)。`status` 默认 `running`(P0 begin 即 running,因 fork 同 goroutine 立即执行,无独立 queued 阶段;`queued` 留给 P3 executor 池)。

| 转换 | P0/P1 触发(fork 执行) | P3+ 触发(契约) | 调用方 | 写列 |
|---|---|---|---|---|
| →`running` | `handleUserMessage` 接受 user_message(配额 + busy 门后) | executor `UPDATE...WHERE status='queued' AND RowsAffected==1` | `TurnCoordinator.BeginTurn` | INSERT 整行 status='running' |
| `running`→`complete` | `upstreamLoop` `message_complete`(hub.go:371) | executor 发 message_complete | `TurnCoordinator.CompleteTurn` | status='complete'、completed_at、model_main;+ shadow ledger |
| `running`→`failed` | turn 内 error / 上游读错(hub.go:349-354 `endTurn`)/ 权限写失败(hub.go:362) | executor crash→租约过期 reconciler;`attempt>=Max` | `TurnCoordinator.FailTurn` | status='failed'、completed_at |
| `running`→`aborted` | front `stop_generation`(readLoop)/ hub `shutdown` 含在途轮(hub.go:244) | 同 + 租约回收判定 abort | `TurnCoordinator.AbortTurn` | status='aborted'、completed_at |

**P0/P1 诚实声明**:内存 `inFlight` bool(hub.go:65)**仍是权威 busy 门**;`agent_turns.status` 并行写为影子,**尚不**用来拒并发轮(P2 才让 `turnlock:<sid>`+status 权威)。`executor_id`/`lease_until`/`fence_token`/`attempt` 写 inert 默认。

### 2.4 `client_turn_id` 来源
- **生成方 = 浏览器,每次 send-click 一次**,跨自动重发稳定(reconnect-resend/双击),使唯一键去重。
- **wire 变更**(唯一一处):`user_message` 帧加 `clientTurnId`:`{"type":"user_message","content":"…","clientTurnId":"<uuid-v4>"}`。前端在 `frontend-user/src/shared/hooks/useAgentSocket.ts`(memory: agent-ws-hook-unify)提交时 `crypto.randomUUID()`,持于 pending-turn 对象至该轮 `message_complete`/`error`。
- **后端解析**:`extractClientTurnID(raw []byte) string`(ws.go,镜像 `extractUserMessageContent` ws.go:393)。空(旧客户端)→ `handleUserMessage` 内 mint `uuid.NewString()`(`github.com/google/uuid`,本仓既有依赖,见 service.go:42、library upload),故唯一键永不撞;代价是旧客户端丢跨 reconnect 去重(= 今天行为,无回归)。
- **并发旧客户端诚实声明**:两个旧客户端并发各 mint 不同 UUID → 两行都 INSERT 成功 = 同句话两轮。这正是旧客户端无去重的**既有行为**(无回归)。
- **P5 编排**:`saga.go` 入队步-as-turn 时 `client_turn_id = saga_id + ":" + step_key + ":" + attempt`,deterministic,使 saga 重试在 turn 层也幂等(契约,不在本文建)。

---

## 3. eventlog 读写契约 + 写侧 batcher + Projector 契约

### 3.1 `eventlog.go`(新文件)读写契约

```go
package agentbridge

import (
	"context"
	"encoding/json"
	"time"

	"scholar-backend/internal/agent"
)

type EvType string
const (
	EvUserMessage       EvType = "user_message"
	EvContentDelta      EvType = "content_delta"
	EvToolUse           EvType = "tool_use"
	EvToolResult        EvType = "tool_result"
	EvPermissionRequest EvType = "permission_request"
	EvMessageComplete   EvType = "message_complete"
	EvError             EvType = "error"
)

// Event 是读路径返回的一个事件(对应 TurnEventRow,但读侧轻量视图)。
type Event struct {
	ID        uint64
	TurnID    uint64
	EvSeq     uint
	EvType    EvType
	Payload   json.RawMessage // == broadcastAgent 扇出的字节
	CreatedAt time.Time
}

// EventLog 是 append-only 会话日志契约。
//   P0: BeginTurn/Append/FlushTurn/CompleteTurn(写);jsonl 仍权威。
//   P1: ReadTurnEvents/ReadInFlightEvents/ReadRecentTurns/FoldToMessages(读)。
//   P2: 同一 interface 下 Append 额外 XADD Redis,调用方零改动。
type EventLog interface {
	// BeginTurn 幂等 INSERT agent_turns(status=running),幂等于 (agent_session_id, client_turn_id)。
	// 命中既有行 → existed=true(浏览器重发),不报错。seq 由事务内 MAX(seq)+1 分配。
	BeginTurn(ctx context.Context, in TurnInput) (turn *Turn, existed bool, err error)

	// Append 写一个事件。content_delta 走合并 batcher(§3.2);其余(tool/complete/error/
	// permission)先 flush 当前 delta 再立即 INSERT(低频、顺序敏感)。frame = 浏览器 wire 字节。
	// 绝不在同步扇出热路径:调用方在 broadcastAgent 之后调,batcher 推迟实际 MySQL 写。
	// ev_seq 分配:delta 与非 delta 共用同一 per-turn accum.nextSeq、同一把锁(§3.2 硬约束)。
	Append(turnID uint64, sid string, evType EvType, frame []byte)

	// FlushTurn 强制把该 turn 缓冲的合并 delta 立即落 MySQL。turn 终结符(message_complete/error)
	// 时同步调,使终态绝不滞留在 <200ms 批窗。
	FlushTurn(ctx context.Context, turnID uint64) error

	// CompleteTurn 翻终态(complete/failed/aborted)+ completed_at + model_main;
	// 并 INSERT...ON DUPLICATE KEY UPDATE 写 shadow agent_billing_ledger(幂等)。内部先 FlushTurn。
	CompleteTurn(ctx context.Context, turnID uint64, status string, modelMain string, ledger *BillingLedgerRow) error

	// ── 读侧(P1)──
	// ReadInFlightEvents 返回某 session 当前 running turn 的事件(ORDER BY ev_seq)+ 该 turn。
	// 驱动 addSubscriber 迟到续流(取代 replayBuf)。调用方须在 hub 锁外调用(§8.2 锁内 DB 约束)。
	ReadInFlightEvents(ctx context.Context, sid string) (turn *Turn, evs []Event, err error)

	// ReadRecentTurns 返回某 session 最近 limitTurns 个用户轮的事件(ORDER BY id)+ 总轮数 + 是否有更早。
	// 驱动 GetSessionMessages 历史读。
	ReadRecentTurns(ctx context.Context, sid string, limitTurns int) (evs []Event, totalTurns int, hasMore bool, err error)

	// FoldToMessages 把扁平事件流折叠成 agent.SessionMessage[](GetSessionMessages 已返回的形状),
	// 纯函数无 DB。使读切换对 handler/前端不可见。轮边界硬约束见 §3.1.1。
	FoldToMessages(evs []Event) []agent.SessionMessage
}

type TurnInput struct {
	AgentSessionID, FeatureKey, ClientTurnID, RoleUserText, ModelMain, Kind string
	UserID uint
}
```

#### 3.1.1 `FoldToMessages` 折叠契约 + 轮边界硬约束(parity 关键)

**返回 `[]agent.SessionMessage` 的理由**:`GetSessionMessages` 已返回 `SessionMessagesResult{Messages []agent.SessionMessage}`(bridge.go:559),`agent.SessionMessage.Content` 是 `json.RawMessage` 携带 Anthropic content[] 协议原样(client.go:618-635),前端 `replayHistoryAsTurns`/`foldMessagesIntoTurns` 已消费此。**P1 必须产出字节级一致的 `SessionMessage`** 使读切换可一键回退。折叠映射:
- 一个 `user_message` 事件 → `SessionMessage{Type:"user", Content:[{"type":"text","text":content}]}`
- 两个 `user_message` 间的一串 `content_delta`(text)+`tool_use`+`tool_result` → assistant `SessionMessage`(s) 重建 content[] blocks(合并 delta text 成 text block;每个 tool_use/tool_result 一个 block)。

**轮边界硬约束(防 totalTurns 与 daemon 路径分叉,破坏分页 parity)**:agent 的 daemon 路径里,带 `tool_result` 的 user entry 被分类为 `type=='tool_result'`(见 `sliceRecentTurns` 注释 bridge.go:432),**不计作用户轮**。journal 路径不经过 agent 的 `entryToMessage` 分类,故 `FoldToMessages` 必须自己保证此不变式:
- **只有 `EvUserMessage` 事件生成 `Type:"user"` 的 `SessionMessage`。**
- **`EvToolResult` 事件绝不生成新的 `Type:"user"` message** —— 它折进**前一个 assistant message**(作为 content[] 内一个 `tool_result` block,Anthropic 协议里 tool_result 虽在 user role 但在本日志的轮模型里归 assistant 轮的产物)。
- 因此 `sliceRecentTurns`(bridge.go:434)对 journal 流计「用户轮」时,数的恰好是 `EvUserMessage` 个数 = daemon 路径数的 `type==user` 个数,两路 `totalTurns` 一致,分页 parity 成立。

`stripInjectionFromMessages`(bridge.go:576)折叠后仍跑;因 `user_message` 存的是**原文(注入前)**(§2.1),对日志源读多为 no-op,保留作 parity/安全。

### 3.2 写侧合并 batcher(200ms / 4KB)— P0 强制

新文件 `eventlog_batcher.go`。per-turn 内存累加器,触发 flush 于:200ms tick **或** 累计 4096 字节 **或** 任一非 delta 事件 **或** turn 完成。

```go
type deltaAccum struct {
	turnID  uint64
	sid     string
	buf     strings.Builder // 合并文本(O(content-block) 非 O(token))
	bytes   int
	nextSeq uint            // 下一个 ev_seq(delta 与非 delta 共用)
	timer   *time.Timer     // 200ms flush
}
type deltaBatcher struct {
	mu      sync.Mutex
	db      *gorm.DB
	accums  map[uint64]*deltaAccum
	flushCh chan uint64
}
```

**`ev_seq` 分配硬约束(防撞 `UNIQUE(turn_id, ev_seq)`)**:
- 所有事件 —— delta **和** 非 delta —— 的 `ev_seq` 都从**同一** `accum.nextSeq++` 取号,且**都在同一把 `b.mu` 下**完成「取号 + 入缓冲/INSERT」。
- `content_delta`(text)→ 在 `mu` 下 append `buf`,`bytes>=4096` 立即 flush(flush 时该合并行用当前 `nextSeq++` 占一个号),否则(重)armed 200ms timer。复用 `coalesceReplay`(hub.go:620)的合并意图,但**搬到写侧**。
- **非 delta**(tool_use/tool_result/complete/error/permission)→ 在**同一把 `mu`** 下:先 flush 当前 delta 缓冲(它占 `nextSeq++`),**再**用**同一 `accum.nextSeq++`** 给本非 delta 事件取号并 INSERT。绝不让非 delta 走独立的 seq 来源,否则与 delta 行 seq 乱序/撞 UNIQUE。
- P0/P1 `upstreamLoop` 是 per-(feature,session) 单 goroutine(jsonl 单写者不变式仍在),故 `nextSeq` 无需 DB 取;`UNIQUE(turn_id,ev_seq,created_at)` 是 P2 多写者的 replica-safe 兜底,非 P0/P1 正确性依赖。

**为何 O(content-blocks) 非 O(tokens)**:每行携整段合并文本,封顶 4KB/200ms → 2000 个 tiny delta 串出的 50KB 文本约 13 行(50KB/4KB)而非 2000。非文本事件强制 flush-then-insert 关闭当前 text block,正是 Anthropic 协议的 content-block 分界,故行数跟 content-blocks 走。

**为何脱离同步浏览器扇出热路径**(`upstreamLoop` hub.go:437 后的关键顺序):
```
mt, data := agentConn.ReadMessage()
... 现有 hook switch(permission/message_complete/token_usage/...) 不动 ...
h.broadcastAgent(data)                              // (A) 不变 —— 先扇出给订阅者,内存同步
eventLog.Append(turnID, sid, classify(data), data) // (B) 新 —— append 在扇出之后
```
(A) 用户感知路径零加 MySQL 延迟;(B) `content_delta` 只做内存 `buf` append + 可能 arm timer,**delta 路径完全无 MySQL**,真 INSERT 在 batcher 自己的 goroutine(timer/flushCh 驱动),绝不阻塞 `upstreamLoop`。≤200ms 持久化滞后是公认的 eventual-consistency seam:crash 时日志可落后 RAM 一个批窗,有界且接受。

### 3.3 Projector 契约(P1 消费;P2 换 substrate)

P0/P1 live tail 仍是内存 hub。Projector 是 hub 扇出收敛进的契约;P1 只替换**回放/读**成员,**live 扇出**留内存。逐成员映射:

| hub.go 成员(真实) | Projector 替换 | P1 变化 | 等 P2 |
|---|---|---|---|
| `bridge.hubs sync.Map` + `hubKey`(hub.go:128) | (P2) Redis Stream `agent:stream:<sid>` | 不变 | ✅ |
| `subs map`(hub.go:62) | (P2) N 个 `XREAD BLOCK` 消费者 | 不变 | ✅ |
| `broadcastAgent`(hub.go:270) | (P2) `XADD` + 内存扇出 | 不变;**P0 起扇出后加 `Append`** | ✅ XADD |
| `replayBuf`(hub.go:63) + `coalesceReplay`(hub.go:620) | `EventLog.ReadInFlightEvents` + 写侧 batcher | **P1 删**;`addSubscriber` 迟到回放改读日志 | — |
| `inFlightUserText`(hub.go:64) | 日志的 `user_message` 事件 | **P1 删**;迟到者从日志合成 `user_echo` | — |
| `inFlight` bool(hub.go:65)+`beginTurn`/`endTurn`(hub.go:321/334) | (P2) `turnlock:<sid>` + `status='running'` | 不变(仍内存 busy 门);P0 起建 turn 行 | ✅ |
| `addSubscriber` 迟到块(hub.go:216-224) | `ReadInFlightEvents`→`trySend` 折叠帧 | **P1 重写**:读日志而非 replayBuf/inFlightUserText。**这行修 HIGH#3 + history-reentry** | — |
| `GetSessionMessages`(bridge.go:559)→daemon 往返 | `ReadRecentTurns`→`FoldToMessages` | **P1 重写**:折日志非 daemon | — |

**合法 process-local(不动)**:`subscriber.out` channel + `writeLoop` 背压、`frontWriteDeadline`、per-socket goroutine、P0/P1 内存扇出本身。这些是 socket 不是共享 state。

---

## 4. TurnCoordinator 与计费不变性(P1 计费语义不动的 seam)

### 4.1 `turncoord.go`(新文件)

`TurnCoordinator` 串在**保留的配额门**(`PreUserMessage`)与**保留的 `OnMessageComplete`**之间,是幂等 seam。`Bridge` 加字段 `turns *TurnCoordinator`,hub 经 `f.bridge.turns` 访问,**全程 nil-guard**(未 wired/测试不 panic)。

```go
type TurnCoordinator struct {
	log EventLog // 复用 §3.1 的 EventLog(BeginTurn/CompleteTurn/Append 都在其上);允许 nil
}
func NewTurnCoordinator(log EventLog) *TurnCoordinator { return &TurnCoordinator{log: log} }

type BeginTurnResult struct {
	TurnID      uint64
	AlreadySeen bool // 同 client_turn_id 重复 → caller 丢弃此帧、不转 agent
}

// BeginTurn — 用户消息被接受后(配额门 + busy 门通过后)调用。
//   1. 幂等 INSERT agent_turns(status=running),幂等于 (sid, clientTurnId)。
//   2. Append {user_message} 事件(原文此刻落库 → 取代内存 inFlightUserText 持久版)。
// 重复 clientTurnId 时不重复 append,返回既有 turnID + AlreadySeen=true。
// user_echo 广播仍由 hub 现有 echoToOthers 做(见 §4.4),不在此。
func (tc *TurnCoordinator) BeginTurn(ctx context.Context, in TurnInput) (BeginTurnResult, error) {
	if tc == nil || tc.log == nil {
		return BeginTurnResult{}, nil
	}
	turn, existed, err := tc.log.BeginTurn(ctx, in)
	if err != nil {
		return BeginTurnResult{}, err
	}
	if existed {
		return BeginTurnResult{TurnID: turn.ID, AlreadySeen: true}, nil
	}
	payload, _ := json.Marshal(map[string]string{"type": "user_message", "content": in.RoleUserText})
	tc.log.Append(turn.ID, in.AgentSessionID, EvUserMessage, payload)
	return BeginTurnResult{TurnID: turn.ID}, nil
}

// CompleteTurn — message_complete 时调用。翻 status=complete + model_main + shadow ledger。
// **P1 仅审计影子**;真权威计费仍是 hub.go accrueTurnUsage→recordAgentTokens(完全不动,见 §4.3)。
func (tc *TurnCoordinator) CompleteTurn(ctx context.Context, turnID uint64, modelMain string, ledger *BillingLedgerRow) error {
	if tc == nil || tc.log == nil || turnID == 0 {
		return nil
	}
	return tc.log.CompleteTurn(ctx, turnID, "complete", modelMain, ledger)
}
func (tc *TurnCoordinator) FailTurn(ctx context.Context, turnID uint64) error {
	if tc == nil || tc.log == nil || turnID == 0 { return nil }
	return tc.log.CompleteTurn(ctx, turnID, "failed", "", nil)
}
func (tc *TurnCoordinator) AbortTurn(ctx context.Context, turnID uint64) error {
	if tc == nil || tc.log == nil || turnID == 0 { return nil }
	return tc.log.CompleteTurn(ctx, turnID, "aborted", "", nil)
}
```

> 注:本设计把 turn 账本写收口进 `EventLog`(`BeginTurn`/`CompleteTurn` 既建 turn 行又管事件),`TurnCoordinator` 是薄编排层。这消解了「TurnCoordinator 直接持 repo」vs「经 EventLog」的重叠 —— 单一写口在 `EventLog` 实现里(`eventlogStore`),它内部既写 `agent_turns` 又写 `agent_turn_events` 又写 `agent_billing_ledger`,事务一致。

### 4.2 `eventlogStore` 写实现(`agent_turns` 幂等插入)

`eventlogStore.BeginTurn` 在事务内分配 seq + 幂等插入(复用既有 `IsDuplicateKey` repository.go:27 与 `clause.OnConflict` repository.go:302 样板)。`Turn.existed`(§1.5 的 `gorm:"-"` 字段)做内部命中标记:
```go
func (s *eventlogStore) BeginTurn(ctx context.Context, in TurnInput) (*Turn, bool, error) {
	t := &Turn{AgentSessionID: in.AgentSessionID, FeatureKey: in.FeatureKey, UserID: in.UserID,
		ClientTurnID: in.ClientTurnID, RoleUserText: in.RoleUserText, Status: "running",
		Kind: orDefault(in.Kind, "interactive"), ModelMain: in.ModelMain}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ex Turn
		e := tx.Where("agent_session_id=? AND client_turn_id=?", in.AgentSessionID, in.ClientTurnID).First(&ex).Error
		if e == nil { *t = ex; t.existed = true; return nil }
		if !errors.Is(e, gorm.ErrRecordNotFound) { return e }
		var maxSeq uint
		tx.Model(&Turn{}).Where("agent_session_id=?", in.AgentSessionID).Select("COALESCE(MAX(seq),0)").Scan(&maxSeq)
		t.Seq = maxSeq + 1
		return tx.Create(t).Error
	})
	if err != nil && IsDuplicateKey(err) { // 并发同 clientTurnId → 回读既有行
		var ex Turn
		if e2 := s.db.WithContext(ctx).Where("agent_session_id=? AND client_turn_id=?", in.AgentSessionID, in.ClientTurnID).First(&ex).Error; e2 == nil {
			return &ex, true, nil
		}
	}
	return t, t.existed, err
}
```

### 4.3 计费在 P1 如何完全不动 + P3 翻转的精确 seam

**P1 权威计费路径 = 今天逐字一份,以下全不碰**:
- `bridge.go:70 tokenWatermarks sync.Map`、`bridge.go:76 watermarkMu`、`bridge.go:112 accrueTurnUsage`(累计水位减增量的拆分机)。
- `upstreamLoop` 里 `accrueTurnUsage`(message_complete 内,hub.go:383)→ `recordAgentTokens`(hub.go:387,唯一 decrement 点,memory: ai-token-billing-map)入 `llm_token_usage`。
- 日额度经 `recordAgentTokens` 下游 + `PreUserMessage` 配额门(`StandardHooks`→`vip`)。
- `recordOutOfBandTokens`(title/memory-extract,`token_usage` case)不动,故不重复计记忆抽取。

**`agent_billing_ledger` 在 P1 仅 shadow/审计**:`CompleteTurn` 每 turn 写一行(agent 的 `message_complete.usage` 整数增量),`INSERT...ON DUPLICATE KEY UPDATE` 幂等。**无人读它**做配额/记账;存在只为 P3 翻转数据就绪 + 对账报告(`SUM(agent_billing_ledger) vs SUM(llm_token_usage where source=agent)`)。

**P3 翻转 seam(仅一处,绝不在 P1 —— 此处为前瞻说明,防把 seam 画死角)**:executor 报的 `usage` 已是 per-turn(非会话累计),水位拆分不再需要。翻转 = (a) 让 `CompleteTurn` 的事务**也**驱动 `recordAgentTokens`(把 hub.go 的 `recordAgentTokens` 调用搬进 `CompleteTurn` 事务,keyed/幂等于 `turn_id`);(b) 删 `accrueTurnUsage`/`tokenWatermarks`/`watermarkMu`(bridge.go:70-156)。因 `recordAgentTokens` 已是单一 decrement 点,翻转触一处调用 + 一段删除,非重新设计。`vip.AddUsage` 日额度仍经 `recordAgentTokens`,配额语义跨翻转保持。

### 4.4 hub.go 接入点(精确)

`sessionHub` 加字段(hub.go:49 struct):`currentTurnID uint64`(`h.mu` 守护)+ `completedThisTurn bool`(`beginTurn` 重置,区分 complete/drop/abort)。

**A — `handleUserMessage`(hub.go:523),在 busy 门 `beginTurn` 成功(hub.go:550)之后、prompt 注入/`writeAgent` 之前**,用 stripped `content`(非注入的 `data`):

```go
// hub.go:553 `if !h.beginTurn(content) {...}` 之后插入:
if f.bridge.turns != nil {
	clientTurnID := extractClientTurnID(data) // ws.go 新 helper
	if clientTurnID == "" { clientTurnID = uuid.NewString() } // github.com/google/uuid,本仓既有依赖
	res, terr := f.bridge.turns.BeginTurn(h.hookCtx, TurnInput{
		AgentSessionID: h.sessionID, FeatureKey: f.spec.Key, UserID: h.userID,
		ClientTurnID: clientTurnID, RoleUserText: content,
	})
	if terr != nil {
		slog.Warn("agentbridge: shadow BeginTurn failed (live unaffected)",
			"feature", f.spec.Key, "session_id", h.sessionID, "err", terr)
	} else if res.AlreadySeen {
		h.endTurn() // 重复 clientTurnId(浏览器重发)→ 释放刚开的内存轮、丢帧、不转 agent
		return
	} else {
		h.mu.Lock(); h.currentTurnID = res.TurnID; h.completedThisTurn = false; h.mu.Unlock()
	}
}
```
现有 `echoToOthers(userEchoFrame(content), s)`(hub.go:600)**保留不动**(它仍是 live user_echo 扇出;P2 才换 Redis)。

**B — `upstreamLoop` 的 `message_complete` case(hub.go:371)**:`accrueTurnUsage`→`recordAgentTokens`(hub.go:383-390)、`OnMessageComplete`(hub.go:376)、记忆抽取 dispatch 全不动。在 `h.endTurn()`(hub.go:406)前加 shadow CompleteTurn:
```go
if f.bridge.turns != nil {
	h.mu.Lock(); tid := h.currentTurnID; h.currentTurnID = 0; h.completedThisTurn = true; h.mu.Unlock()
	if tid != 0 {
		ledger := buildLedgerRow(tid, h.userID, h.sessionID, f.spec.Key, usage) // 从 extractMessageComplete 的 usage
		safego.Go("agentbridge-turn-complete:"+f.spec.Key, func() {
			if err := f.bridge.turns.CompleteTurn(h.hookCtx, tid, usage.Model, ledger); err != nil {
				slog.Warn("agentbridge: shadow CompleteTurn failed (billing unaffected)",
					"feature", f.spec.Key, "turn_id", tid, "err", err)
			}
		})
	}
}
```

**C — `endTurn`(hub.go:334)是三种关闭(complete/turn 内 error/上游 drop)的单一 chokepoint**。fail/abort 兜底:在 `upstreamLoop` 上游读错路径(hub.go:349-354)与 `shutdown`(hub.go:244),若 `currentTurnID != 0` 且 `!completedThisTurn` 调 `FailTurn`/`AbortTurn`(safego,best-effort)。`completedThisTurn` 区分:见过 message_complete → CompleteTurn 已处理(B 置 true);否则按 drop=fail / shutdown=abort。

**接入序不变式**(相对两个保留 hook):
```
PreUserMessage 配额门(hooks StandardHooks→vip)       [保留, hub.go:535]
  → 内存 busy 门 beginTurn()                          [保留, hub.go:550]
  → TurnCoordinator.BeginTurn(shadow insert + journal) [新]  ← 幂等 seam
  → writeAgent(user_message)                          [保留, hub.go:591]
  → echoToOthers(user_echo)                           [保留, hub.go:600]
  ... message_complete:
     accrueTurnUsage → recordAgentTokens(权威计费)     [保留, hub.go:383/387]
     OnMessageComplete slog hook                       [保留, hub.go:376]
     TurnCoordinator.CompleteTurn(shadow ledger)       [新]  ← 审计 seam
     endTurn()                                         [保留, hub.go:406]
```

---

## 5. Executor-seam 契约(provider-agnostic、零 cc-haha 血统;P3 实现,现在定契约)

### 5.1 现状 seam 与修正
当前 seam 是**具体 `*agent.Client`(非 interface)**(bridge.go:37),一次性注入 bootstrap.go:110→{111(`agentConfigService.SetAgentClient`), 128(`agentbridge.New`)}。blueprint「pluggable seam 已保留」方向对但需 interface 化。WS pipe **今天不走 `agent.Client`** —— smartsearch/claw/prism 用 `client.BaseURL()`/`client.AuthToken()`(client.go:817/820)直连 fork WS,hub.go 跑上游 pipe。故 seam 实为**两道**:(a) HTTP `agent.Client` 方法,(b) hub.go 裸 WS dial(承载 live 流,P1 替读侧、P3 替执行侧)。

**Foundation 动作(P0 做,零行为变更)**:把 seam 从具体指针提升为 interface,使 P3 是接线 swap 非重写:
1. 新 `internal/agent/executor.go` 含 `Executor` interface(§5.2)+ 一个捕获 agentbridge **今天实调方法**的 legacy `Client` interface(`CreateSession`/`DeleteSession`/`GetSessionMessages`/`GetSessionContextEstimate`/`ListSessions`/`PatchSession`/workspace 方法/`ServerSideChatStreaming`/`BaseURL`/`AuthToken`)。
2. `Bridge.client`(bridge.go:37)与 `New` 参数(bridge.go:166)改为该 interface 类型。`*agent.Client` 已满足 → bootstrap.go:128/111 **编译不变**。
3. P3 提供 `executorAdapter` 实现同 interface 但背靠 `Executor.RunTurn`/`AllocSandbox`;flip 在 bootstrap.go 一行 + flag。

### 5.2 目标 `Executor` interface(provider-agnostic、turn 为工作单元、无 jsonl/--resume)

```go
package agent

type Executor interface {
	// AllocSandbox 取代 CreateSession:只预留 sandbox + 返回 handle 存进 agent_sessions,
	// 不创建 conversation(无服务端 transcript)。opts 携 per-session 工具策略/skill 目录/沙箱档,
	// 不携 system prompt(prompt 每 turn)。
	AllocSandbox(ctx context.Context, req AllocSandboxRequest) (*SandboxHandle, error)
	ReleaseSandbox(ctx context.Context, sandboxID string) error

	// RunTurn 执行一个 turn 到终态,经 sink 流式回 typed events。执行器被喂完整 turn 输入
	// (折叠 history + system prompt + 工具 allow-list + tier + sandbox + provider),不跨调用持状态。
	// 取代「hub.upstreamLoop 裸 WS」与「ServerSideChatStreaming」二者:交互轮与服务端轮同一调用。
	RunTurn(ctx context.Context, in TurnInput, sink EventSink) error

	// PushProviderConfig 设 runtime 上游(base_url + token + 模型槽),provider-agnostic;
	// 取代 PushConfig 的 fork /api/providers preset/activate 三步。runtime 可切。
	PushProviderConfig(ctx context.Context, cfg ProviderConfig) error
	Health(ctx context.Context) error
}

type EventSink interface {
	// Emit per event;调用方实现 = append 日志(agent_turn_events)+ XADD Redis(P2)。
	// 顺序由 EvSeq 保证,非调用时序。permission_request 后执行器须等调用方裁决(控制面所有)。
	Emit(ctx context.Context, ev TurnEvent) error
}

// TurnInput 是一个 turn 的完整自包含输入。执行器别无所需 —— 无 jsonl 查找、无 --resume、无前序进程。
type TurnInput struct {
	TurnID       int64           // = agent_turns.id(幂等 + 计费键)
	SessionID    string          // 仅用于流寻址
	SandboxID    string
	FeatureKey   string
	Messages     []MessageParam  // 折叠 history,Anthropic Messages API 形状,控制面从 agent_turn_events 建
	System       []SystemBlock   // 控制面装配(规则 + per-user 记忆前缀),映射 Anthropic system,前缀稳定保 cache
	AllowedTools []ToolSpec      // 控制面 per-turn 解析(decidePermission 逻辑上提),执行器不得放宽
	Tier         ModelTier       // fast|strong → agentconfig 槽,执行器 run 时解析
	Sandbox      SandboxProfile  // claw=bash+egress / prism=compile/network_none ...
	Provider     *ProviderConfig // nil = 用上次 PushProviderConfig;非 nil = 本 turn pin
	ClientTurnID string
}

type ModelTier string
const ( TierFast ModelTier = "fast"; TierStrong ModelTier = "strong" )

// ProviderConfig 是 provider-agnostic 上游绑定 = 一个 agentconfig 行的 runtime 镜像。
// 任何 Anthropic-Messages-API 兼容上游(Anthropic 官方 / DeepSeek / 网关)都插这里。无 vendor 名。
type ProviderConfig struct {
	BaseURL   string
	AuthToken string               // 永不日志/回吐
	Slots     map[ModelTier]string // fast→haiku槽, strong→sonnet|opus槽
	Main      string               // legacy main 槽迁移 parity
}

// TurnEvent — 执行器发回的 typed 事件。Payload 复用今天发浏览器的帧形状(agent_turn_events.payload 直插)。
type TurnEvent struct {
	TurnID  int64
	EvSeq   int
	Type    EvType          // 复用 §3.1 的 user_message|content_delta|tool_use|tool_result|message_complete|error|permission_request|token_usage
	Payload json.RawMessage
}
```

**执行器须守的契约**:(1) **per-turn usage 在终态事件**(`message_complete` 携本轮 `{input,output,cache_read,cache_creation}`)→ 让 P3 翻 turn_id 账本;**P1 不消费它计费**。(2) **`EvSeq` per-turn 单调**(日志 uk + Projector 回放都依赖,不依赖 wall-clock)。(3) **permission 控制面所有**:执行器发 `permission_request` 并等裁决,绝不自批。(4) **执行器不持久化 transcript**(不写 jsonl/`~/.claude`);history 只经 `TurnInput.Messages` 抵达。

### 5.3 现方法降级映射(节选)
- `CreateSession`→`AllocSandbox`(`AppendSystemPrompt` 字段死,prompt 每 turn);**P0/P1 不变**(fork 仍建 session)。
- `GetSessionMessages`→**backend-local 日志读**(**P1 核心**,修 HIGH#3 + history-reentry;`SessionMessage` 形状保留,前端 fold 不变)。
- WS dial + `hub.upstreamLoop`→`RunTurn`+`EventSink`(**P1 替读侧续流,P3 替执行侧**)。
- `ServerSideChatStreaming`(client.go;peerreview 服务端轮的现行调用,service.go:586/1395/1652)→`RunTurn`;P3 前 peerreview 保现行 streaming 循环。(注:`agent.Client` 上另有 `EnqueueChatMessage`/`GetChatStatus` enqueue/poll API,client.go:725/759,但**当前 peerreview 编排不调它们**,走的是 `chatWithRetry`→`ServerSideChatStreaming`;二者同归 `RunTurn`。)
- `PushConfig`(client.go:844 的 `/api/providers` 三步 + 硬编码 `APIFormat:"anthropic"`)→`PushProviderConfig`(provider preset/activate dance 删,anthropic 成协议不变式;**`AgentPusher` interface agentconfig/service.go:23 + `push_status`/`pushAsync` 机制保留不动** —— 新执行器适配器实现 `AgentPusher`)。

agentconfig 单行 4 槽形状(`BaseURL`/`APIKey`/`MainModel`/`HaikuModel`/`SonnetModel`/`OpusModel`,model.go:31-36)**已经**是 provider-agnostic 上游配置。P0 加 `agentconfig.ProviderConfigFromRow(cfg) ProviderConfig` 适配器把 seam 用 provider-agnostic 术语表达,但 `PushConfig` 底下仍干现有 `/api/providers` 直到 P3。

### 5.4 P0/P1 must-not(防把 seam 画死角)
- **日志别烙 fork 形状**:`agent_turn_events.payload` 用**我们的** `TurnEvent`/`EvType` 词表(浏览器帧形状),Go 类型名为 `TurnEvent`/`TurnEventRow` 绝不 `agent.SessionMessage`;别加 fork 专属事件(无 `set_runtime_config`、无 jsonl `parentUuid`/`isSidechain` 成一等列,要存只塞 `payload` 内)。
- **日志键别绑 fork session-process identity**:键 `(agent_session_id, seq)` 与 `(turn_id, ev_seq)`(逻辑、执行器无关标识)。
- **别 per-delta 落 MySQL**、别让日志编码 token 级粒度(200ms/4KB batcher 保 O(content-blocks))。
- **P1 别改计费语义**(§4.3)。
- **别引读 fork session-meta 的 per-turn prompt 装配**:prompt 装配留 Go(`MemoryBlocks` 前缀,bridge.go:183),`TurnInput.System` 已控制面所有。
- **WS pipe 别把「per-session 单长连」当契约**:日志/Projector 按 `(feature,session)` Redis stream key 寻址,非进程内连接句柄,使日后无状态 `RunTurn` 能从任一 replica 发进同一流。

---

## 6. Saga 契约(P5 消费,现在定)

表见 §1.3/§1.4(`agent_saga_steps`,0048/0049)。Go 契约 `backend/internal/agentbridge/saga.go`(类型 + 认领/reconcile 签名,引擎体延到 P5)。`ModelTier` 是**新共享类型**(今天不存在),复用 §5.2 定义。

```go
type SagaSpec struct { FeatureKey string; Steps []SagaStep }

type SagaCtx struct {
	SagaID string
	Ctx    context.Context
	// Output 返回某已完成依赖步的 output_ref(unmarshal 进 v),缺/不可解返回 false
	// (镜像 buildChiefPrompt 缺依赖降级,service.go:1962)。
	Output func(stepKey string, v any) (ok bool)
}

type SagaStep struct {
	Key       string      // methodology|alpha|beta|gamma|chief
	Tier      ModelTier   // → agentconfig 槽
	DependsOn []string    // chief:{alpha,beta,gamma};alpha/beta/gamma:{methodology}
	MaxRetry  int         // attempt>=MaxRetry → status='failed'(DLQ),绝不静默 wedge
	BuildPrompt func(SagaCtx) (prompt string, model ModelTier, err error) // persona/skill 选择留在步内,PersonaRandomPicker/feature_prompts 不搬
	Validate    func(reply string) (output any, ok bool)                  // ok=false 触发有界 in-round 重试;终态 !ok 仍 done 存 raw(对齐 ContentMd=raw)
}

// SagaStore — MySQL 步账本。replica-safe:认领原子、无 process-local。P5 实现。
type SagaStore interface {
	EnsureSteps(ctx context.Context, sagaID, featureKey string, steps []SagaStep) error // INSERT IGNORE(uk_saga_step 使重声明 no-op)
	// ClaimStep — MySQL 原子认领(无 RETURNING):
	//   UPDATE agent_saga_steps SET status='running',executor_id=?,attempt=attempt+1,
	//     lease_until=NOW(3)+INTERVAL ? SECOND
	//   WHERE saga_id=? AND step_key=? AND status='pending'   → RowsAffected==1 才算认领。
	//  (worker 池变体:SELECT id ... WHERE status='pending' AND <deps done> FOR UPDATE SKIP LOCKED LIMIT 1。)
	ClaimStep(ctx context.Context, sagaID, stepKey, executorID string, lease time.Duration) (claimed bool, err error)
	CompleteStep(ctx context.Context, sagaID, stepKey string, outputRef json.RawMessage, turnID *uint64) error // 先提交 output_ref 再 done(commit-before-mark)
	FailStep(ctx context.Context, sagaID, stepKey, reason string) error // attempt>=MaxRetry → failed + error(DLQ)
	LoadSteps(ctx context.Context, sagaID string) ([]SagaStepRow, error)
	// ReclaimExpired — reconciler 原语(P5 取代 peerreview ReconcileStaleOnBoot+StaleSweeper):
	//   UPDATE ... SET status='pending',executor_id='',lease_until=NULL
	//     WHERE status='running' AND lease_until<NOW(3)              -- 崩溃持有者
	//   + status='running' AND attempt>=MaxRetry → 'failed'(poison→DLQ)。Redis advisory lock 单飞。
	ReclaimExpired(ctx context.Context, now time.Time) (requeued, deadLettered int, err error)
}
```

**纪律(poison-message 铁律,owner 排除 Temporal 故显式)**:① 原子认领 = 条件 UPDATE 的 `RowsAffected==1`(或 `FOR UPDATE SKIP LOCKED`),无 `RETURNING`;② 租约过期 reconcile 重排队,Redis advisory lock 使 2-replica 只一个 sweep(取代 `StrandedReviewIDs` 的 single-instance 假设);③ `attempt>=MaxRetry → failed`(DLQ),`attempt` 在认领内自增,poison 步终被 dead-letter 不死循环;④ commit-before-mark + commit-before-enqueue-dependent,gap 内 crash → 步可重认领、幂等重跑、upsert 覆盖。

**peerreview → 契约 1:1 映射**(P5 = 声明 SagaSpec + 4 prompt picker):`runMethodologyPhase`(service.go:553)→`{methodology, TierFast, deps:nil}`;`alpha|beta|gamma` 轮(service.go:1559)→三个 `{TierStrong, deps:[methodology], MaxRetry:2}`;chief(service.go:1586)→`{TierStrong, deps:[alpha,beta,gamma], MaxRetry:2}`;`ReconcileStaleOnBoot`+`StaleSweeper`(service.go:195/242)→通用 `ReclaimExpired`+Redis lock。**保留不动**:`PersonaRandomPicker`/reviewer-roster skill/`feature_prompts`、`AddDirs` skill 加载、`scoringSessionDeny`、`Submit` 内 VIP 配额、chief 缺依赖降级(经 `SagaCtx.Output` 返回 ok=false)。`peer_review_reports` 仍是用户面成品;`agent_saga_steps.output_ref` 是编排内部记录。

---

## 7. P0 落地(影子写 + batcher + journal==jsonl 持续校验 + peerreview 廉价止血)— 精确改动清单

### 7.1 影子写(行为中性)
1. **新** `eventlog.go`(`EventLog` interface + `eventlogStore` MySQL 实现)、`eventlog_batcher.go`(200ms/4KB)、`turncoord.go`、`journal_model.go`、`saga.go`(契约,P0 不接线引擎)、`internal/agent/executor.go`(seam interface,§5.1)。
2. `bridge.go`:加字段 `turns *TurnCoordinator`、`log EventLog`、`SetTurnCoordinator(*TurnCoordinator)`(镜像 `SetLLMUsageRecorder` bridge.go:172)、`readFromJournal(featureKey string) bool`(P1 用)。`Bridge.client` 改 interface 类型(§5.1)。
3. `hub.go`:`sessionHub` 加 `currentTurnID uint64` + `completedThisTurn bool`;接入点 A/B/C(§4.4);引入 `github.com/google/uuid`。
4. `ws.go`:加 `extractClientTurnID(raw []byte) string`(镜像 `extractUserMessageContent` ws.go:393)。
5. `bootstrap.go`(在 :128 `agentBridge := agentbridge.New(...)` 后,`db := database.GetDB()` 已在 :100 在 scope):
```go
if os.Getenv("AGENT_TURN_JOURNAL") == "shadow" {
	log := agentbridge.NewEventLog(db)
	agentBridge.SetTurnCoordinator(agentbridge.NewTurnCoordinator(log))
	// SetTurnCoordinator 内部同时把 log 存进 bridge.log(供 P1 读路径用),与读 flag 解耦
}
```

### 7.2 校验 harness(§7.4)与 peerreview 止血(§7.3)随 P0 同发。

### 7.3 peerreview 廉价止血(零迁移、零新表、零 flag — 首跑字节级等同今天)

`service.go` 5 处改(全复用既有 `GetReportByRole` repository.go:288 + `parseReviewerJSON` service.go:1986)。`UpsertReport` 的 OnConflict 键 `(submission_id, role)`(repository.go:276)使重跑覆盖安全:

- **新 helper**(近 `buildReportFromReviewer` ~service.go:1690):
```go
func (s *Service) loadPersistedReviewer(submissionID uint64, role string) (out *ReviewerOutput, done bool) {
	rep, err := s.repo.GetReportByRole(submissionID, role)
	if err != nil { return nil, false } // ErrNotFound/DB err → 跑(重跑经 OnConflict 覆盖,安全)
	if parsed, ok := parseReviewerJSON(rep.ContentMd); ok { return parsed, true }
	return nil, true // degraded 行已存:跳轮,chief 该槽自然降级(同原始行为)
}
func (s *Service) allReviewersPersisted(submissionID uint64) bool {
	for _, role := range []string{"alpha", "beta", "gamma"} {
		if _, err := s.repo.GetReportByRole(submissionID, role); err != nil { return false }
	}
	return true
}
```
- **reviewer 循环(service.go:1559)**:循环体首加 gap-fill 守卫 —— `if persisted, done := s.loadPersistedReviewer(submissionID, role); done { if persisted != nil { reviewerOutputs[role] = persisted }; s.broker.Done(submissionID, ReviewerSlot(role)); continue }`。**关键正确性**:必须从持久化 `ContentMd` rehydrate `reviewerOutputs[role]`,否则 chief 静默丢该 reviewer 真实意见(`buildChiefPrompt` service.go:1962-1968 缺则降级)。
- **chief(service.go:1586)**:`buildChiefPrompt` 前加 `if _, err := s.repo.GetReportByRole(submissionID, "chief"); err == nil { s.broker.Done(submissionID, chiefSlot); _ = s.repo.MarkCompleted(submissionID); return }`(crash 在 chief upsert 与 MarkCompleted 之间的兜底)。
- **methodology(service.go:1551)**:`if s.allReviewersPersisted(submissionID) { choices = builtinReviewerChoices() } else { methodology, choices = s.runMethodologyPhase(...) }`(全 reviewer 已存时跳整个 methodology 会话 + 选择 —— 最大单笔浪费;`choices` 仅在非跳分支被 `choices[i]` 索引,`builtinReviewerChoices()` 返 3 保 len 不变式)。

效果:debt#4 从「重烧 methodology+alpha+beta+gamma+chief」降为「只填缺的 role 行 + chief」。`ReconcileStaleOnBoot`/`StrandedReviewIDs` 不动,止血在 `runReviewBackground` 内,自动护住所有 re-entry 路径。回滚 = 撤 `continue` 守卫,纯逻辑无 schema。

### 7.4 journal==jsonl 持续校验(非一次性)

新 `eventlog_validate.go`,bootstrap 起后台 goroutine(`safego.Go`),`AGENT_JOURNAL_VALIDATE=on` 守。60s ticker 扫 `agent_turns WHERE completed_at > lastScan AND status='complete'`(限批量,只比最近完成轮,非全表),对每 session:
- 折日志(`FoldToMessages(ReadRecentTurns(sid,N))`)vs daemon(`client.GetSessionMessages(sid,N)`),比 ① 用户轮数 ② per-turn assistant 文本(归一化空白后比等;不等算相似度) ③ tool 调用名序列。
- 不符 → `slog.Error("journal_validate_mismatch", "kind","turn_count", "session_id", ...)`(label `journal_validate=1`,`docker logs scholar_backend | grep journal_validate` 可见);导出进程计数 `mismatch_total` 供 P1 读切前判「日志当下可信否」。
- **此 harness 贯穿 P1/P2 长跑**作 online 安全网(blueprint §8 P3 回滚不变式),P0 后不删。

### 7.5 P0 回滚
`AGENT_TURN_JOURNAL` unset/`off` → 不构造 coordinator(`bridge.turns` nil + `bridge.log` nil)→ 每处新代码 nil-guard no-op → **零行为变更、零 MySQL 写、重启即回退**。表幂等留着无害。peerreview 止血独立于 flag,撤守卫即回退。

---

## 8. P1 落地(读/回放走日志、删 replayBuf、修 data-loss + history-reentry bug)— 精确改动清单 + 回滚

**`AGENT_JOURNAL_READ`(per-feature CSV,默认空)守**;jsonl 仍权威,flag 只改**读**。

### 8.1 历史读 — `GetSessionMessages`(bridge.go:559)+ `GetSessionMessagesByID`(bridge.go:585)+ `PaginateSessionMessages`(bridge.go:617)
```go
if f.bridge.readFromJournal(f.spec.Key) && f.bridge.log != nil {
	evs, total, hasMore, jerr := f.bridge.log.ReadRecentTurns(ctx, sessionID, limitTurns)
	if jerr == nil {
		msgs := f.bridge.log.FoldToMessages(evs)
		stripInjectionFromMessages(msgs) // 保留(原文存的是 strip 前,多为 no-op 安全网)
		return &SessionMessagesResult{SessionID: sessionID, Messages: msgs, TotalTurns: total, HasMore: hasMore}, nil
	}
	slog.Warn("agentbridge: journal history read failed, fallback daemon", "feature", f.spec.Key, "err", jerr)
	// fall through —— jsonl 仍权威
}
// ── 既有 daemon 路径不变(fallback)──
```
`sliceRecentTurns`(bridge.go:434)的轮窗逻辑保留,作用于日志轮;轮计数依赖 §3.1.1 的轮边界硬约束(只有 `EvUserMessage` 生成 `type==user`,tool_result 不计),保证 journal 与 daemon 两路 `totalTurns` 一致、分页 parity 不分叉。**修 history-reentry-staletime bug**:历史成持久 backend 读,轮完成即一致(`CompleteTurn` 同步 flush),前端 staleTime 竞态无 stale/空后端可争。

### 8.2 进行中续流 — `addSubscriber`(hub.go:204,改 hub.go:216-224 块)

**锁内 DB 调用硬约束**:`ReadInFlightEvents` 是 MySQL 往返,**绝不在 `h.mu` 内做**(会拉长持锁时间,阻塞同 hub 的 `broadcastAgent`/`beginTurn`)。改为「锁外读日志 → 进锁注册 + 补 live 增量」两段:

```go
// 第一段(锁外):snapshot 是否在途(快读)+ 读日志
var jTurn *Turn
var jEvs []Event
useJournal := h.inFlightSnapshot() && h.f.bridge.readFromJournal(h.f.spec.Key) && h.f.bridge.log != nil
if useJournal {
	if t, evs, jerr := h.f.bridge.log.ReadInFlightEvents(context.Background(), h.sessionID); jerr == nil && t != nil {
		jTurn, jEvs = t, evs
	} else {
		useJournal = false // 读错 → 落回 replayBuf 路径
	}
}

// 第二段(进锁):注册 sub + 据 useJournal 选回放源。锁内只做内存操作,无 DB。
h.mu.Lock()
if h.inFlight {
	if useJournal && jTurn != nil {
		if jTurn.RoleUserText != "" { trySend(sub.out, userEchoFrame(jTurn.RoleUserText)) } // 从日志 user_message 合成 echo
		for _, ev := range jEvs { trySend(sub.out, ev.Payload) }
	} else {
		if h.inFlightUserText != "" { trySend(sub.out, userEchoFrame(h.inFlightUserText)) }
		for _, fr := range h.replayBuf { trySend(sub.out, fr) }
	}
}
h.subs[sub] = struct{}{}
h.mu.Unlock()
safego.Go("agentbridge-hub-sub-write:"+h.f.spec.Key, sub.writeLoop)
return sub
```
（`inFlightSnapshot()` = 短临 `h.mu` 读 `h.inFlight` 的 helper,非长持。）
**排序注**:日志读在锁外发生,batcher 异步 flush,日志可落后内存 ≤200ms。可接受:订阅者随后收 live `broadcastAgent` 帧补齐,小重叠在前端 fold(content_delta 合并)幂等。**data-loss 修复是真的**:即便所有 sub 离开、hub 中途 `shutdown`,部分 assistant 内容已 durable 在 `agent_turn_events`,重连 tab 从日志回放 —— 这是 `replayBuf`(RAM,shutdown 即弃)永远做不到的。
**两段间窗诚实声明**:锁外读日志与进锁注册之间,可能有新 live 帧扇出(此 sub 尚未在 `subs` 中,漏接)。但该 sub 注册后立即收所有后续 live 帧,且漏接窗内的帧已 durable 在日志、会在回放集里(回放快照取自该 sub 注册前的日志)—— 净效果与单段锁内相同,重叠由前端 fold 幂等吸收。

### 8.3 删 `replayBuf`(分阶段)
P1 发布时 `replayBuf` **仍在**作 fallback(flag off / 日志读错)。待 `AGENT_JOURNAL_READ` 全 feature on **且**校验 harness 清洁 N 天后,**P1 内后续 commit** 删:`sessionHub.replayBuf`(hub.go:63)、`coalesceReplay`(hub.go:620)、`contentDeltaText`(hub.go:639)、`broadcastAgent` 内 `replayBuf` 写(hub.go:272-274)、`beginTurn`/`endTurn` 的 `replayBuf`/`inFlightUserText` 写(hub.go:328/337)、`addSubscriber` 的 replayBuf 分支。**flag-on → soak → delete**,使读切换在日志读证稳前一直一键可逆。

### 8.4 P1 计费不动
`accrueTurnUsage`/`tokenWatermarks`/`recordAgentTokens`/`StandardHooks` 零改;`agent_billing_ledger` 仍 P0 shadow;**无 turn_id 账本翻转**(P3,经 `EventSink`+`CompleteTurn` 事务 seam §4.3)。

### 8.5 P1 回滚
从 `AGENT_JOURNAL_READ` 移除某 feature(或清空),重启 → 读即回 daemon 路径(逐字保留)。**仅因 jsonl 贯穿 P1-P2 权威**(P4a 才退役)且校验 harness 长跑作 online 守卫 —— 报不符则运营在用户见漂移前清 flag。

---

## 9. 改动文件清单 + 落地顺序(可逐条执行)+ 每步的 feature-flag/回滚

| 步 | 文件 → 改动 | flag | 回滚 |
|---|---|---|---|
| 1 | `docker/mysql/migrations/0046_agent_turn_journal_fields.sql`、`0047_*_indexes.sql`、`0048_agent_saga_steps_fields.sql`、`0049_*_indexes.sql` **新建** | — | 幂等可重放;表新增无破坏,不回滚 |
| 2 | `internal/agentbridge/journal_model.go` **新** GORM 模型 | — | 删文件 |
| 3 | `internal/agent/executor.go` **新** `Executor`/`EventSink`/`TurnInput`/`ProviderConfig`/legacy `Client` interface(§5) | — | 删文件;`Bridge.client` 改 interface 类型(`*agent.Client` 已满足,编译不变) |
| 4 | `internal/agentbridge/eventlog.go` **新** + `eventlog_batcher.go` **新** + `saga.go` **新**(契约) | — | 删文件 |
| 5 | `internal/agentbridge/turncoord.go` **新** + `bridge.go` 加 `turns`/`log`/`SetTurnCoordinator`/`readFromJournal` 字段 | — | nil-guard 使未接线即 no-op |
| 6 | `internal/agentbridge/ws.go` 加 `extractClientTurnID` | — | 删函数 |
| 7 | `internal/agentbridge/hub.go` 加 `currentTurnID`/`completedThisTurn` + `inFlightSnapshot` helper + 接入点 A/B/C(§4.4)+ import `github.com/google/uuid` **P0 影子写** | `AGENT_TURN_JOURNAL=shadow` | 设 `off`/unset → nil-guard no-op,零行为变更 |
| 8 | `internal/peerreview/service.go` **P0 止血**(§7.3,5 处) | 无 flag(首跑等同) | 撤 `continue` 守卫 |
| 9 | `internal/agentbridge/eventlog_validate.go` **新** 持续校验 | `AGENT_JOURNAL_VALIDATE=on` | 设 off |
| 10 | `cmd/server/bootstrap.go`(:128 后)接线 `SetTurnCoordinator` + 启 validate(§7.1) | 上述 flag | 删接线 |
| 11 | **P1**:`bridge.go` `GetSessionMessages`/`GetSessionMessagesByID`/`PaginateSessionMessages` 日志读(§8.1)+ `hub.go` `addSubscriber` 锁外日志续流(§8.2) | `AGENT_JOURNAL_READ=<csv>` | 清 CSV → 回 daemon 路径 |
| 12 | **P1 soak 后**:删 `replayBuf`/`coalesceReplay`/`contentDeltaText`(§8.3) | — | git revert |

**不动**:四个 `*/spec.go`、`hooks.go`、`wstoken.go`、`repository.go`(`agent_sessions` 部分)、`agent/client.go` 内部逻辑、`agentconfig/service.go`(`AgentPusher` 机制)。

**canary 顺序**:`AGENT_JOURNAL_READ` 先开 `smart_search`(最薄,MCP-only)→ 观察校验 harness → 再 `claw`/`prism`/`peerreview`。

**验证(无本地 Go,memory: backend-verify-docker-build)**:`docker compose build backend`;`docker-compose restart schema-sync backend` 后 `docker logs scholar_schema_sync` 确认 0046-0049 幂等应用;`AGENT_TURN_JOURNAL=off` 时确认 diff 是纯 no-op。

---

## 10. 验收标准(每个 P0/P1 子项怎么验证「做对了」)

**P0 影子写**
- 迁移:`docker logs scholar_schema_sync` 无错;重复 restart schema-sync 不报错(幂等)。`SHOW CREATE TABLE agent_turn_events` 含分区 + `PRIMARY KEY(id,created_at)` + `UNIQUE(turn_id,ev_seq,created_at)`。
- 行为中性:`AGENT_TURN_JOURNAL=off` 与开启,前端交互/计费/历史完全一致(对比 `llm_token_usage` 增量、WS 帧序)。
- batcher O(content-blocks):一轮流 N KB 文本,`SELECT COUNT(*) FROM agent_turn_events WHERE turn_id=? AND ev_type='content_delta'` ≈ ceil(bytes/4096),**非** delta 数;`upstreamLoop` 无新增同步 MySQL 写(代码审查 + 压测延迟无回归)。
- ev_seq 无撞:`SELECT turn_id, COUNT(*), COUNT(DISTINCT ev_seq) FROM agent_turn_events GROUP BY turn_id HAVING COUNT(*)!=COUNT(DISTINCT ev_seq)` 空集(delta 与非 delta 共用同一 nextSeq、同锁,§3.2)。
- 终态不丢:turn 完成后 `agent_turns.status='complete'` 且该 turn 末 `content_delta`/`message_complete` 均在表(无滞留批窗)。
- shadow ledger:`agent_billing_ledger` 每完成 turn 一行,`turn_id` 幂等(重投不增行);**不影响** `llm_token_usage`。

**P0 校验 harness**
- 注入人造分歧(临时跳一条 `Append`)→ `journal_validate_mismatch` 在 60s 内出现在 logs 且 `mismatch_total` 自增;正常流稳态 `mismatch_total==0`。

**P0 peerreview 止血**
- 首跑:全 `GetReportByRole` 返 ErrNotFound → 与今天字节级等同(reviewer/chief 调用次数不变)。
- resume:种子 submission 仅 alpha+beta 行、无 gamma/chief → 重启后只跑 gamma+chief(fake bridge 计 `ServerSideChatStreaming` 调用 = 2);methodology 不重跑(全 reviewer 在时跳;此例非全 reviewer 故仍跑,但 alpha/beta 不重烧);chief prompt 含 alpha/beta 真实意见(从 `ContentMd` rehydrate,非降级文案)。

**P1 历史读**
- `AGENT_JOURNAL_READ=smart_search`:`GetSessionMessages` 返回的 `[]SessionMessage` 与 daemon 路径字节级等同(diff 工具比对);前端 fold 渲染无差异。
- 轮计数 parity:同会话 journal 路径 `TotalTurns` == daemon 路径 `TotalTurns`(验 §3.1.1 tool_result 不计用户轮的硬约束;含多 tool 调用的会话尤其要测)。
- history-reentry bug:实时对话结束后立即切走再回,历史不空、不 404(对比 fix 前必现的空白)。
- fallback:人为令日志读报错 → 自动落 daemon,用户无感。

**P1 进行中续流(修 HIGH#3)**
- 两浏览器:A 发起长轮,B 中途 join → B 立即见用户气泡 + 已产出助手内容(从日志续流)。
- data-loss:A 发起轮 → 中途关闭**所有** tab(hub shutdown)→ 新 tab 重连 → 部分 assistant 内容仍回放(从 `agent_turn_events`)。fix 前此场景内容永久丢失。
- ≤200ms 重叠幂等:续流回放 + live 帧的重叠区,前端最终渲染无重复块。
- 锁内无 DB:压测并发 join 时,`addSubscriber` 不因日志慢查询阻塞 `broadcastAgent`(§8.2 锁外读,代码审查确认 `h.mu` 持锁段无 DB 调用)。

**P1 计费不变**
- 全程 `llm_token_usage` 写入、`vip` 日额度扣减与 P0/今天逐字一致;`agent_billing_ledger` 只增不被读用于配额(代码审查确认无消费点)。

**回滚**
- 任一 flag 翻 off + 重启,系统回到上一已知良好态,无残留(turn 表保留无害,读路径瞬切 daemon)。

---

**关键 load-bearing 修正汇总**(对 blueprint + 对初稿):① 最新迁移是 `0045` 非 `0071`,新号 0046-0049;② 分区表 `agent_turn_events` 必须 `PRIMARY KEY(id,created_at)` + `UNIQUE(turn_id,ev_seq,created_at)`(blueprint 的 `(id)`/`(turn_id,ev_seq)` 会在 CREATE TABLE 失败);③ proc 是 `add_index_if_not_exists(table,name,cols,p_is_unique BOOLEAN)`;④ seam 当前是具体 `*agent.Client` 非 interface(需 P0 廉价提升);⑤ JSON 列用 `json.RawMessage`(与 peerreview 一致,不引新依赖);⑥ turn 默认 `status='running'`(P0 fork 同 goroutine 立即执行,无独立 queued 阶段;queued 留 P3);⑦ peerreview 止血必须从 `ContentMd` rehydrate chief 上下文,否则静默丢 reviewer 意见;⑧ **UUID 兜底用 `uuid.NewString()`(`github.com/google/uuid`,本仓既有依赖,service.go:42 已用),`utils.NewUUID` 不存在**;⑨ **`FoldToMessages` 轮边界硬约束:`tool_result` 不生成 `type==user` message**,否则 `totalTurns` 与 daemon 路径分叉破坏分页 parity;⑩ **batcher 非 delta 事件 `ev_seq` 必须与 delta 共用同一 `accum.nextSeq` 且同锁**,否则撞 `UNIQUE(turn_id,ev_seq)`;⑪ **§8.2 续流 `ReadInFlightEvents` 移出 `h.mu`(锁外读 + 进锁注册两段)**,避免锁内 MySQL 往返阻塞 hub;⑫ peerreview 服务端轮现行方法是 `ServerSideChatStreaming`(非 `ServerSideChat`/非 `EnqueueChatMessage`+poll)。

相关文件路径(绝对):`/Users/youngp/mypro/fuck_副本/scholar/docker/mysql/migrations/{0046,0047,0048,0049}_*.sql`、`/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/{eventlog.go,eventlog_batcher.go,eventlog_validate.go,turncoord.go,journal_model.go,saga.go,hub.go,bridge.go,ws.go}`、`/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agent/executor.go`、`/Users/youngp/mypro/fuck_副本/scholar/backend/internal/peerreview/service.go`、`/Users/youngp/mypro/fuck_副本/scholar/backend/cmd/server/bootstrap.go`。
