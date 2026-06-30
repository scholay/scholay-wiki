// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"encoding/json"
	"time"
)

// ── Web-native 重构 · 事件溯源脊柱的 GORM 模型(见 docs/research/agent-service-analysis-2026-06/
//    DETAILED-DESIGN-P0-P1.md §1.5;迁移 0046-0049)。──
//
// 放独立文件而非塞进 repository.go(后者是 agent_sessions 映射 repo;turn 账本 / 事件日志 /
// 计费账本 / saga 是 event-sourcing 脊柱,独立关注点)。JSON 列用 json.RawMessage(与
// peerreview/model.go 一致,不引 gorm.io/datatypes 新依赖)。

// Turn = agent_turns 一行 = 一个 turn(工作单元:幂等/可回放/可计费/可归属)。
// P0: shadow 写;P1: 历史/在途读源。executor_id/lease_until/fence_token/attempt 现在定义、
// P3+ 才激活(见详细设计 §1.6 vestigial);P0/P1 恒默认值。
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
	Attempt        int        `gorm:"column:attempt;not null;default:0"`                       // P3+ INERT
	ExecutorID     string     `gorm:"column:executor_id;type:varchar(64);not null;default:''"` // P3+ INERT
	LeaseUntil     *time.Time `gorm:"column:lease_until"`                                      // P3+ INERT
	FenceToken     uint64     `gorm:"column:fence_token;not null;default:0"`                   // P3+ INERT
	CreatedAt      time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP(3)"`
	CompletedAt    *time.Time `gorm:"column:completed_at"`

	existed bool `gorm:"-"` // BeginTurn 内部回读命中标记,不映射列(浏览器重发去重)
}

func (Turn) TableName() string { return "agent_turns" }

// TurnEventRow = agent_turn_events 一行。Payload 直接是发给浏览器的 frame bytes;
// content_delta 已写侧合并(取代 hub.coalesceReplay)。表月度 RANGE 分区(见 0046)。
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

// BillingLedgerRow = agent_billing_ledger 一行 = per-turn 幂等计费。
// P0 仅 shadow/审计;真权威计费仍是 hub.go accrueTurnUsage→recordAgentTokens(P1 不动)。
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

// SagaStepRow = agent_saga_steps 一行(P5 消费;本文不写引擎,仅契约)。
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
