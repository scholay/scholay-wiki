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
	"log/slog"
	"sync/atomic"
)

// ── 「整轮 journal 丢失」计数器 ──────────────────────────────────────────────
//
// BeginTurn 失败 = 这一轮在 agent_turns 里连行都没有 ⇒ hub 的 currentTurnID 保持 0 ⇒
// 该轮**所有**帧都被 `tid != 0` 的 tee 闸门丢弃。用户看到的对话完全正常(live 走内存 hub),
// 但历史里这一轮永久不存在:重入看不到、管理端会话监控看不到、事后追责查不到。
//
// journal 已经是 executor feature 历史的唯一真源(jsonl fork 已退役),所以这不是"影子日志抖了一下",
// 是不可恢复的数据丢失。此前它只留下一条写着「live unaffected」的 WARN —— 措辞和级别都在暗示
// 「没事」,于是没人会去搜它。现在:Error + 计数器,消息里带上稳定的可搜索串。
//
// 排障入口:
//
//	docker logs scholar_backend | grep JOURNAL_TURN_LOST
var journalTurnLossCnt atomic.Int64

// JournalTurnLosses 返回本进程累计「整轮 journal 丢失」次数(=0 才可信历史完整)。
// 由 Bridge.ShutdownJournal 与 journal reaper 周期性播报,见 bridge.go。
func JournalTurnLosses() int64 { return journalTurnLossCnt.Load() }

// ── TurnCoordinator(详细设计 §4.1)──
//
// 串在「保留的配额门」(PreUserMessage)与「保留的 OnMessageComplete」之间的幂等 seam。
// 它是薄编排层;turn 账本与事件的实际写口收口在 EventLog 实现(eventlogStore)里,事务一致。
// 全程 nil-guard:未 wired(bootstrap 没注入 EventLog)/测试场景下,所有方法都是 no-op,
// 绝不 panic、绝不影响 live —— P0 的 shadow 写永远是「锦上添花」,不是 live 依赖。
type TurnCoordinator struct {
	log EventLog // 复用 EventLog;允许 nil
}

func NewTurnCoordinator(log EventLog) *TurnCoordinator {
	return &TurnCoordinator{log: log}
}

// BeginTurnResult 是 BeginTurn 的返回。
type BeginTurnResult struct {
	TurnID      uint64
	AlreadySeen bool // 同 client_turn_id 重复(浏览器重发)→ caller 丢弃此帧、不转 agent
}

// BeginTurn — 用户消息被接受后(配额门 + 内存 busy 门通过后)调用。
//  1. 幂等 INSERT agent_turns(status=running),幂等于 (sid, clientTurnId)。
//  2. Append {user_message} 事件(原文此刻落库 → 取代内存 inFlightUserText 的持久版)。
//
// 重复 clientTurnId 时不重复 append,返回既有 turnID + AlreadySeen=true。
// user_echo 广播仍由 hub 现有 echoToOthers 做(P2 才换 Redis),不在此。
func (tc *TurnCoordinator) BeginTurn(ctx context.Context, in TurnInput) (BeginTurnResult, error) {
	if tc == nil || tc.log == nil {
		return BeginTurnResult{}, nil
	}
	turn, existed, err := tc.log.BeginTurn(ctx, in)
	if err != nil {
		// 计数 + Error 收口在这里而不是 hub:这是唯一必然经过的窄口,而且 TurnInput 里就有
		// 定位一轮所需的全部字段。调用方的行为一个字都不改(live 仍走内存 hub + 上游 WS)。
		n := journalTurnLossCnt.Add(1)
		slog.Error("JOURNAL_TURN_LOST: BeginTurn 失败,该轮整轮无 turn 行,所有事件被丢弃(不可恢复;live 不受影响)",
			"feature", in.FeatureKey, "session_id", in.AgentSessionID, "user_id", in.UserID,
			"client_turn_id", in.ClientTurnID, "err", err, "total_lost_turns", n)
		return BeginTurnResult{}, err
	}
	if existed {
		return BeginTurnResult{TurnID: turn.ID, AlreadySeen: true}, nil
	}
	payload := append([]byte(nil), in.UserPayload...)
	if frameType(payload) != string(EvUserMessage) {
		payload, _ = json.Marshal(map[string]string{"type": string(EvUserMessage), "content": in.RoleUserText})
	}
	tc.log.Append(turn.ID, in.AgentSessionID, EvUserMessage, payload)
	return BeginTurnResult{TurnID: turn.ID}, nil
}

// Append 透传一个事件到日志(hub 在 broadcastAgent 之后调,见详细设计 §3.2 (B))。
func (tc *TurnCoordinator) Append(turnID uint64, sid string, evType EvType, frame []byte) {
	if tc == nil || tc.log == nil {
		return
	}
	tc.log.Append(turnID, sid, evType, frame)
}

// CompleteTurn — message_complete 时调用。翻 status=complete + model_main + shadow ledger。
// P1 仅审计影子;真权威计费仍是 hub.go accrueTurnUsage→recordAgentTokens(完全不动)。
func (tc *TurnCoordinator) CompleteTurn(ctx context.Context, turnID uint64, modelMain string, ledger *BillingLedgerRow) error {
	return tc.FinalizeTurn(ctx, turnID, "complete", modelMain, ledger)
}

// FinalizeTurn 是终态的单一写入口。用户 stop 后 executor 仍会发
// message_complete，该轮必须记 aborted 而非 complete，但已发生的模型/用量仍照实落账。
func (tc *TurnCoordinator) FinalizeTurn(ctx context.Context, turnID uint64, status, modelMain string, ledger *BillingLedgerRow) error {
	if tc == nil || tc.log == nil || turnID == 0 {
		return nil
	}
	if status != "complete" && status != "aborted" && status != "failed" {
		status = "failed"
	}
	return tc.log.CompleteTurn(ctx, turnID, status, modelMain, ledger)
}

// FailTurn / AbortTurn — turn 内错误 / 上游 drop / 前端 stop / hub shutdown 含在途轮时调。
func (tc *TurnCoordinator) FailTurn(ctx context.Context, turnID uint64) error {
	if tc == nil || tc.log == nil || turnID == 0 {
		return nil
	}
	return tc.log.CompleteTurn(ctx, turnID, "failed", "", nil)
}

func (tc *TurnCoordinator) AbortTurn(ctx context.Context, turnID uint64) error {
	if tc == nil || tc.log == nil || turnID == 0 {
		return nil
	}
	return tc.log.CompleteTurn(ctx, turnID, "aborted", "", nil)
}

// readLog 暴露底层 EventLog 给 Bridge 的 P1 读路径(GetSessionMessages / addSubscriber 续流)。
// nil-safe:未 wired 返回 nil,调用方回落 daemon 路径。
func (tc *TurnCoordinator) readLog() EventLog {
	if tc == nil {
		return nil
	}
	return tc.log
}
