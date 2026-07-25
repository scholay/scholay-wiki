// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"encoding/json"
	"time"

	"scholar-backend/internal/agent"
)

// ── Web-native 重构 · append-only 会话事件日志契约(详细设计 §3.1)。──
//
//	P0: BeginTurn / Append / FlushTurn / CompleteTurn(写);jsonl + 内存 hub 仍权威。
//	P1: ReadInFlightEvents / ReadRecentTurns / FoldToMessages(读);读切到日志,删 replayBuf。
//	P2: 同一 interface 下 Append 额外 XADD Redis Stream,调用方零改动。
//
// 反转状态归属:后端拥有会话真源,executor 跨轮无状态。工作单元 = turn(幂等/可回放/
// 可计费/可归属),不是 session-process。

// EvType 是会话事件类型;payload 直接沿用今天发给浏览器的 frame shape(详细设计 §2.1)。
type EvType string

const (
	EvUserMessage       EvType = "user_message"
	EvContentStart      EvType = "content_start" // 块边界标记(in-flight replay 用;fold 不产 message)
	EvContentDelta      EvType = "content_delta"
	EvThinking          EvType = "thinking" // 思考块(fold 产 assistant/thinking;当前写侧暂未落,见 §4 MEDIUM-4)
	EvToolUse           EvType = "tool_use"
	EvToolResult        EvType = "tool_result"
	EvPermissionRequest EvType = "permission_request"
	EvMessageComplete   EvType = "message_complete"
	EvError             EvType = "error"
	EvArtifact          EvType = "artifact" // 产物带外声明(执行器 diff ./out/ 后发);fold 产 turn.artifacts,replay 随轮重建
	EvRoundDiscarded    EvType = "round_discarded" // DSML 作废重打:回放时丢弃本轮在途累积的残缺前缀(审计 [10])
)

// Event 是读路径返回的一个事件(对应 TurnEventRow 的轻量读侧视图)。
type Event struct {
	ID        uint64
	TurnID    uint64
	EvSeq     uint
	EvType    EvType
	Payload   json.RawMessage // == broadcastAgent 扇出的字节
	CreatedAt time.Time
}

// TurnInput 描述一次 BeginTurn 的入参。
type TurnInput struct {
	AgentSessionID string
	FeatureKey     string
	ClientTurnID   string
	RoleUserText   string
	ModelMain      string
	Kind           string
	UserID         uint
}

// EventLog 是 append-only 会话日志的读写契约。实现见 eventlogStore(eventlog_store.go)。
// 所有方法对 nil 接收者无意义(用 TurnCoordinator 的 nil-guard 包裹),实现本身假设非 nil。
type EventLog interface {
	// BeginTurn 幂等 INSERT agent_turns(status=running),幂等于 (agent_session_id, client_turn_id)。
	// 命中既有行 → existed=true(浏览器重发),不报错。seq 由事务内 MAX(seq)+1 分配。
	BeginTurn(ctx context.Context, in TurnInput) (turn *Turn, existed bool, err error)

	// Append 写一个事件(fire-and-forget 进 batcher)。content_delta 走合并 batcher;
	// 其余(tool/complete/error/permission)先 flush 当前 delta 再立即取号 INSERT。
	// frame = 浏览器 wire 字节。绝不在同步扇出热路径:调用方在 broadcastAgent 之后调,
	// batcher 推迟真正 MySQL 写。ev_seq:delta 与非 delta 共用同一 per-turn 序号、同一锁。
	Append(turnID uint64, sid string, evType EvType, frame []byte)

	// FlushTurn 强制把该 turn 缓冲的合并 delta 立即落库(turn 终结符时调,使终态不滞留批窗)。
	FlushTurn(ctx context.Context, turnID uint64) error

	// CompleteTurn 翻终态(complete/failed/aborted)+ completed_at + model_main;
	// ledger != nil 时 INSERT...ON DUPLICATE KEY 幂等写 shadow agent_billing_ledger。内部先 FlushTurn。
	CompleteTurn(ctx context.Context, turnID uint64, status string, modelMain string, ledger *BillingLedgerRow) error

	// ── 读侧(P1)──
	// ReadInFlightEvents 返回某 session 当前 running turn 的事件(ORDER BY ev_seq)+ 该 turn。
	// 驱动 addSubscriber 迟到续流(取代 replayBuf)。调用方须在 hub 锁外调用(详细设计 §8.2)。
	ReadInFlightEvents(ctx context.Context, sid string) (turn *Turn, evs []Event, err error)

	// ReadRecentTurns 返回某 session 最近 limitTurns 个轮的事件(ORDER BY id)+ 总轮数 + 是否有更早。
	// 驱动 GetSessionMessages 历史读。
	ReadRecentTurns(ctx context.Context, sid string, limitTurns int) (evs []Event, totalTurns int, hasMore bool, err error)

	// FoldToMessages 把扁平事件流折叠成 agent.SessionMessage[](GetSessionMessages 返回的形状),
	// 纯函数无 DB。轮边界硬约束:只有 EvUserMessage 生成 Type=="user" 的 message(详细设计 §3.1.1)。
	FoldToMessages(evs []Event) []agent.SessionMessage

	// ── 可靠性(M4/M5)──
	// ReconcileStaleRunning 启动时把卡死的 running turn 标 aborted(进程崩留下的僵尸轮)。
	ReconcileStaleRunning(ctx context.Context) error
	// Shutdown 优雅停机 drain 写通道(防重启丢未落盘事件)。
	Shutdown(ctx context.Context)
	// WriteFailures 累计落库失败数(=0 才可信 journal 完整)。
	WriteFailures() int64
}
