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
	"errors"
	"log/slog"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"scholar-backend/internal/agent"
)

// eventlogStore 是 EventLog 的 MySQL 实现(agent_turns / agent_turn_events /
// agent_billing_ledger,迁移 0046-0047)。写侧 delta 合并由 deltaBatcher 承接。
type eventlogStore struct {
	db      *gorm.DB
	batcher *deltaBatcher
}

// NewEventLog 构造 EventLog 实现并启动写侧 batcher 后台 goroutine。
// bootstrap 调一次(此处有 *gorm.DB),经 Bridge.SetTurnCoordinator 注入。
func NewEventLog(db *gorm.DB) EventLog {
	return &eventlogStore{db: db, batcher: newDeltaBatcher(db)}
}

func journalKindOrDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// ── 写侧 ──

func (s *eventlogStore) BeginTurn(ctx context.Context, in TurnInput) (*Turn, bool, error) {
	t := &Turn{
		AgentSessionID: in.AgentSessionID, FeatureKey: in.FeatureKey, UserID: in.UserID,
		ClientTurnID: in.ClientTurnID, RoleUserText: in.RoleUserText, Status: "running",
		Kind: journalKindOrDefault(in.Kind, "interactive"), ModelMain: in.ModelMain,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ex Turn
		e := tx.Where("agent_session_id = ? AND client_turn_id = ?", in.AgentSessionID, in.ClientTurnID).First(&ex).Error
		if e == nil { // 浏览器重发同 clientTurnId → 命中既有行,幂等
			*t = ex
			t.existed = true
			return nil
		}
		if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}
		var maxSeq uint
		tx.Model(&Turn{}).Where("agent_session_id = ?", in.AgentSessionID).Select("COALESCE(MAX(seq),0)").Scan(&maxSeq)
		t.Seq = maxSeq + 1
		return tx.Create(t).Error
	})
	if err != nil && IsDuplicateKey(err) { // 并发同 clientTurnId → 回读既有行(沿用 repository.go 样板)
		var ex Turn
		if e2 := s.db.WithContext(ctx).Where("agent_session_id = ? AND client_turn_id = ?", in.AgentSessionID, in.ClientTurnID).First(&ex).Error; e2 == nil {
			return &ex, true, nil
		}
	}
	return t, t.existed, err
}

func (s *eventlogStore) Append(turnID uint64, sid string, evType EvType, frame []byte) {
	if turnID == 0 {
		return
	}
	s.batcher.append(turnID, sid, evType, frame)
}

func (s *eventlogStore) FlushTurn(ctx context.Context, turnID uint64) error {
	s.batcher.flushTurn(turnID)
	return nil
}

func (s *eventlogStore) CompleteTurn(ctx context.Context, turnID uint64, status, modelMain string, ledger *BillingLedgerRow) error {
	if turnID == 0 {
		return nil
	}
	// M5:终态前**同步**落任何残留 delta/think(终态事件 append 通常已同步写过,这里兜底),
	// 保证 status=complete 时该 turn 内容已持久,杜绝崩溃截断。失败已在 createWithRetry 计数+Error。
	_ = s.batcher.flushTurnSync(turnID)
	upd := map[string]any{"status": status, "completed_at": time.Now()}
	if modelMain != "" {
		upd["model_main"] = modelMain
	}
	if err := s.db.WithContext(ctx).Model(&Turn{}).Where("id = ?", turnID).Updates(upd).Error; err != nil {
		s.batcher.dropTurn(turnID)
		return err
	}
	if ledger != nil { // P0 shadow:turn_id 是 PK,重放幂等 no-op
		ledger.TurnID = turnID
		_ = s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(ledger).Error
	}
	s.batcher.dropTurn(turnID)
	return nil
}

// ReconcileStaleRunning 把「卡在 running 超过 30min」的 turn 标 aborted(M5 boot 清理 +
// W3-2c 运行期 reaper 共用同一写口)。进程崩在 turn 进行中会留 status=running 僵尸行 →
// 污染 ReadInFlightEvents(续流复活死轮)。30min 阈值是轮级硬超时(默认 15min,
// FeatureSpec.TurnTimeoutOrDefault)的 2 倍兜底 —— 正常轮绝不会活过它;若某 feature 调大
// TurnTimeout 超过 30min,此阈值须同步上调。
func (s *eventlogStore) ReconcileStaleRunning(ctx context.Context) error {
	res := s.db.WithContext(ctx).Model(&Turn{}).
		Where("status = ? AND created_at < ?", "running", time.Now().Add(-30*time.Minute)).
		Updates(map[string]any{"status": "aborted", "completed_at": time.Now()})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		slog.Info("agentbridge: reconciled stale running turns", "aborted", res.RowsAffected)
	}
	return nil
}

// Shutdown 优雅停机:drain 写 batcher(把通道里未落盘事件写完)。main 在 srv.Shutdown 后调。
func (s *eventlogStore) Shutdown(ctx context.Context) {
	s.batcher.Shutdown(ctx)
}

// WriteFailures 累计落库失败数(M4 可观测;=0 才可信 journal 完整)。
func (s *eventlogStore) WriteFailures() int64 {
	return s.batcher.writeFailures()
}

// ── 读侧(P1)──

func (s *eventlogStore) ReadInFlightEvents(ctx context.Context, sid string) (*Turn, []Event, error) {
	var t Turn
	e := s.db.WithContext(ctx).Where("agent_session_id = ? AND status = ?", sid, "running").Order("id DESC").First(&t).Error
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return nil, nil, nil // 无在途轮
	}
	if e != nil {
		return nil, nil, e
	}
	var rows []TurnEventRow
	if err := s.db.WithContext(ctx).Where("turn_id = ?", t.ID).Order("ev_seq ASC").Find(&rows).Error; err != nil {
		return &t, nil, err
	}
	return &t, toEvents(rows), nil
}

func (s *eventlogStore) ReadRecentTurns(ctx context.Context, sid string, limitTurns int) ([]Event, int, bool, error) {
	if limitTurns <= 0 {
		limitTurns = 30
	}
	var total int64
	s.db.WithContext(ctx).Model(&Turn{}).Where("agent_session_id = ?", sid).Count(&total)
	if total == 0 {
		return nil, 0, false, nil
	}
	var turnIDs []uint64
	s.db.WithContext(ctx).Model(&Turn{}).Where("agent_session_id = ?", sid).
		Order("seq DESC").Limit(limitTurns).Pluck("id", &turnIDs)
	if len(turnIDs) == 0 {
		return nil, int(total), false, nil
	}
	var rows []TurnEventRow
	if err := s.db.WithContext(ctx).Where("turn_id IN ?", turnIDs).Order("id ASC").Find(&rows).Error; err != nil {
		return nil, int(total), false, err
	}
	hasMore := int64(limitTurns) < total
	return toEvents(rows), int(total), hasMore, nil
}

func toEvents(rows []TurnEventRow) []Event {
	out := make([]Event, 0, len(rows))
	for _, r := range rows {
		out = append(out, Event{
			ID: r.ID, TurnID: r.TurnID, EvSeq: r.EvSeq, EvType: EvType(r.EvType),
			Payload: r.Payload, CreatedAt: r.CreatedAt,
		})
	}
	return out
}

// FoldToMessages 折叠事件流成 agent.SessionMessage[](详细设计 §3.1.1 + §4 journal 中性化,修 HIGH-1)。
//
// 与 daemon GET /api/sessions/:id/messages 的形状逐块对齐(实测 2026-06):daemon 把每个
// content block 摊成独立 typed message —— user→[text]、assistant→[thinking]/[text]、
// tool_use→[{type,id,name,input}]、tool_result→[{tool_use_id,type,content}]。本折叠产出同形,
// 让 validator apples-to-apples 比,且 AGENT_JOURNAL_READ 打开后前端 replay 与 daemon 路径无差。
//
// 轮边界硬约束:只有 EvUserMessage 生成 Type=="user" 的 message;tool_result 是独立的
// Type=="tool_result"(不冒充 user,故 user 轮数 parity 自然成立)。连续同类 assistant
// delta(text/thinking)合并成一条 message。content_start/message_complete/error/permission 不产 message。
//
// 字段名:写侧 journal 当前存浏览器 wire 帧(camelCase: toolUseId/toolName);此处解析时
// 同时兜 Anthropic 标准名(id/name/tool_use_id),使新执行器发标准帧时本折叠也正确。
func (s *eventlogStore) FoldToMessages(evs []Event) []agent.SessionMessage {
	var out []agent.SessionMessage
	var buf string     // 当前累积的 assistant 文本/思考
	var bufKind string // "text" | "thinking" | ""
	flushAsst := func() {
		if bufKind == "" || buf == "" {
			buf, bufKind = "", ""
			return
		}
		var block map[string]string
		if bufKind == "thinking" {
			block = map[string]string{"type": "thinking", "thinking": buf}
		} else {
			block = map[string]string{"type": "text", "text": buf}
		}
		content, _ := json.Marshal([]map[string]string{block})
		out = append(out, agent.SessionMessage{Type: "assistant", Content: content})
		buf, bufKind = "", ""
	}
	emitAsst := func(kind, text string) {
		if text == "" {
			return
		}
		if bufKind != "" && bufKind != kind {
			flushAsst()
		}
		bufKind = kind
		buf += text
	}
	for _, e := range evs {
		switch e.EvType {
		case EvUserMessage:
			flushAsst()
			var f struct {
				Content string `json:"content"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			content, _ := json.Marshal([]map[string]string{{"type": "text", "text": f.Content}})
			out = append(out, agent.SessionMessage{Type: "user", Content: content})
		case EvContentDelta:
			var f struct {
				Text      string          `json:"text"`
				ToolInput json.RawMessage `json:"toolInput"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			if f.ToolInput == nil && f.Text != "" {
				emitAsst("text", f.Text)
			}
		case EvRoundDiscarded:
			// DSML 作废重打(审计 [10]):丢弃当前正在累积但尚未 flush 的 assistant 文本 —— 即被作废
			// 那一轮的残缺前缀(该路径保证无 tool_use,故 buf 内只可能是本轮 text 前缀)。不 flush,直接清空。
			buf, bufKind = "", ""
		case EvThinking:
			var f struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			emitAsst("thinking", f.Text)
		case EvToolUse:
			flushAsst()
			var f struct {
				ToolUseID string          `json:"toolUseId"`
				ID        string          `json:"id"`
				ToolName  string          `json:"toolName"`
				Name      string          `json:"name"`
				Input     json.RawMessage `json:"input"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			id := f.ToolUseID
			if id == "" {
				id = f.ID
			}
			name := f.ToolName
			if name == "" {
				name = f.Name
			}
			input := f.Input
			if len(input) == 0 {
				input = json.RawMessage("{}")
			}
			block, _ := json.Marshal(map[string]any{"type": "tool_use", "id": id, "name": name, "input": input})
			content, _ := json.Marshal([]json.RawMessage{block})
			out = append(out, agent.SessionMessage{Type: "tool_use", Content: content})
		case EvToolResult:
			flushAsst()
			var f struct {
				ToolUseID  string          `json:"toolUseId"`
				ToolUseID2 string          `json:"tool_use_id"`
				Content    json.RawMessage `json:"content"`
				IsError    *bool           `json:"isError"`
				IsError2   *bool           `json:"is_error"`
				// W5 P0-A3(冻结契约 #1):工具错误双轨制 —— userMessage 是给用户的脱敏摘要
				// (仅 isError 时出现),content 仍是给模型的全量指引。历史回放透传给前端
				// ToolErrorFold 优先渲染;旧事件无此字段 → 零值跳过,天然向后兼容。
				UserMessage string `json:"userMessage"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			id := f.ToolUseID
			if id == "" {
				id = f.ToolUseID2
			}
			blk := map[string]any{"type": "tool_result", "tool_use_id": id}
			if len(f.Content) > 0 {
				blk["content"] = f.Content
			}
			if f.IsError != nil {
				blk["is_error"] = *f.IsError
			} else if f.IsError2 != nil {
				blk["is_error"] = *f.IsError2
			}
			if f.UserMessage != "" {
				blk["user_message"] = f.UserMessage
			}
			block, _ := json.Marshal(blk)
			content, _ := json.Marshal([]json.RawMessage{block})
			out = append(out, agent.SessionMessage{Type: "tool_result", Content: content})
		case EvError:
			// W3 P1-A 失败轮错误持久化读侧(冻结契约):journal 里的 EvError 帧(hub 侧已净化,
			// 形如 {"type":"error","code":...,"message":...,可能带 usage/calls})折成 Type=="error"
			// 的 message,content 为 {"code","message"} **JSON 对象**(非块数组;缺省 code="error")。
			// 位置按事件流原序(该轮 user 之后)→ 前端历史回放与实时 fold 的 error 终帧同构。
			// executor seed_history 侧(convertFlatToAnthropic)只认 content 为数组的 text 块,
			// 对象形 content 天然被跳过 —— 错误提示不会回喂模型上下文。
			flushAsst()
			var f struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			if f.Code == "" {
				f.Code = "error"
			}
			content, _ := json.Marshal(map[string]string{"code": f.Code, "message": f.Message})
			out = append(out, agent.SessionMessage{Type: "error", Content: content})
		case EvArtifact:
			// 产物带外声明 → 合成一条 artifact entry(content = 产物字段数组)。前端 replay 据此
			// 把产物绑回「当前轮」,与实时 fold 的 case 'artifact' 同构(见 shared TurnArtifact)。
			flushAsst()
			var f struct {
				Name string `json:"name"`
				Path string `json:"path"`
				Kind string `json:"kind"`
				Mime string `json:"mime"`
				Size int64  `json:"size"`
			}
			_ = json.Unmarshal(e.Payload, &f)
			block, _ := json.Marshal(map[string]any{
				"name": f.Name, "path": f.Path, "kind": f.Kind, "mime": f.Mime, "size": f.Size,
			})
			content, _ := json.Marshal([]json.RawMessage{block})
			out = append(out, agent.SessionMessage{Type: "artifact", Content: content})
		}
	}
	flushAsst()
	return out
}
