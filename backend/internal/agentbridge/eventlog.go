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
	// EvQuotaBlocked:配额/门禁在**转发给 agent 之前**拦下的一次尝试(2026-07-31 线上审计 §五)。
	// 刻意**不在 FoldToMessages 里设 case** —— 它不是对话内容,永远不产 message、不进前端回放;
	// 前端的 blocked 轮语义仍完全由实时 error 帧驱动(shared/types/chat.ts 的 Turn.blocked)。
	// 它只服务 SQL 复盘:agent_turns(status=blocked, kind=quota) + 本事件的结构化 quota payload。
	EvQuotaBlocked EvType = "quota_blocked"
	// EvEvidence:证据账本的**引擎口径**过程状态(2026-08 证据账本 P0-c,终稿 §五 P0-b/P0-c)。
	// 承接执行器发的 research_state 帧(payload 即原帧)。
	//
	// ⚠️ classifyJournalEv 同时收 `evidence_appended`,但**执行器目前一帧都不发**
	// (2026-08-01 实测 agent/src 零命中);它是 P1 增量通道的预留位,三侧(本文件的读侧、
	// 前端 fold、hub 的入账白名单)都已按「收到即忽略」写好了显式 no-op。
	// 别把这行读成「有两种帧在流」—— 今天流里只有 research_state 一种。
	//
	// 它记录的是「引擎数出来的检索次数 / 账本条数 / 来源构成」,与模型在正文里**自称**做了什么
	// 相互独立 —— 生产判别力集中在这一维:本纪元内有过工具调用的轮 DOI 接地率 98%,
	// 失忆纪元(零工具)43%。今天这个差值对用户和 SQL 都不可见,本事件让它可见。
	//
	// 两个读侧出口(都只认 research_state **全量快照**,evidence_appended 一律跳过 ——
	// 拼装增量 = 第二套证据口径,终稿否决清单 #2):
	//   ① latestResearchState → seed_history 的 research 字段(账本文件丢失后的重建入口);
	//   ② FoldToMessages → 每轮一条 Type=="research_state" 合成 entry,让历史回放还原过程 chip
	//      (范式同 EvArtifact)。它**不是对话内容**:executor 的 convertFlatToAnthropic 只留
	//      text/tool_use 块,这条 entry 在 seed_history 里被整条丢弃,绝不回喂模型上下文。
	EvEvidence EvType = "evidence"
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
	// UserPayload 是已通过注入面清理、附件物化与 fold 的完整 user_message 帧。
	// 新写入保留 attachments 结构；旧/服务端调用方为空时仍回退 RoleUserText。
	UserPayload json.RawMessage
	ModelMain   string
	Kind        string
	UserID      uint
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

	// BumpAttempt 把某 turn 的 attempt 记到 n(2026-07-31 线上审计 §五:轮级 provider 故障转移)。
	// 该列此前恒 0(设计上标 "P3+ INERT"),现在正式启用:attempt>0 = 这一轮换过 provider 重投过几次。
	// 幂等按「取大」语义(重复/乱序调用不会把计数改小)。turnID==0 → no-op。
	BumpAttempt(ctx context.Context, turnID uint64, n int) error

	// CompleteTurn 翻终态(complete/failed/aborted)+ completed_at + model_main;
	// ledger != nil 时 INSERT...ON DUPLICATE KEY 幂等写 shadow agent_billing_ledger。内部先 FlushTurn。
	CompleteTurn(ctx context.Context, turnID uint64, status string, modelMain string, ledger *BillingLedgerRow) error

	// RecordBlockedTurn 落一条「被门禁(配额)在转发给 agent 之前拦下、从未执行」的轮:
	// agent_turns(status=blocked, kind=quota, completed_at=now) + EvUserMessage(保留附件/引用)
	// + EvQuotaBlocked(payload = 已发给用户的 error 帧,含冻结契约的结构化 quota 对象)。
	// 2026-07-31 线上审计 §五:配额墙是最强付费触发器(9 个被拦用户 5 人付费、贡献 97% 订单额),
	// 而拦截此前只有一条 INFO 日志 —— docker json-file 轮转即失,转化漏斗无法复盘。
	// 幂等键用 "blocked:"+clientTurnID(**绝不**与真实轮的 (sid, client_turn_id) 撞:撞了会让用户
	// 充值后原样重发被 BeginTurn 判成「已送达」直接丢帧)。
	RecordBlockedTurn(ctx context.Context, in TurnInput, userPayload, payload []byte) error

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
