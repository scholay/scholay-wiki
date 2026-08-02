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

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/safego"
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

// 被门禁拦下、从未转发给 agent 的轮在 journal 里的固定标记(2026-07-31 线上审计 §五)。
// status=blocked 是**读侧过滤键**:所有前端回放/续流读路径都排除它,故它永远不会被误渲染成对话轮。
const (
	turnStatusBlocked = "blocked"
	turnKindQuota     = "quota"
	// 幂等键前缀:blocked 行与真实轮共用 uk_session_client_turn 唯一索引,必须隔离命名空间 ——
	// 否则用户被拦后充值、前端原样重发同一个 clientTurnId 会被 BeginTurn 判成「已送达」直接丢帧。
	blockedTurnIDPrefix = "blocked:"
	maxClientTurnIDLen  = 64 // = agent_turns.client_turn_id 列宽
	turnKindHookBlock   = "hook" // PreUserMessage 非配额原因的拒绝(panic 兜底等),别混进配额漏斗
)

// blockedTurnKind 把门禁拒绝错误映射成 agent_turns.kind:配额漏斗要的是纯净的 kind='quota',
// 其它 hook 拒绝单独归 'hook'(数量极小,但混进去会污染转化率口径)。
func blockedTurnKind(err error) string {
	if errors.Is(err, ErrQuotaExceeded) {
		return turnKindQuota
	}
	return turnKindHookBlock
}

// ── 写侧 ──

func (s *eventlogStore) BeginTurn(ctx context.Context, in TurnInput) (*Turn, bool, error) {
	t := &Turn{
		AgentSessionID: in.AgentSessionID, FeatureKey: in.FeatureKey, UserID: in.UserID,
		ClientTurnID: in.ClientTurnID, RoleUserText: in.RoleUserText, Status: "running",
		Kind: journalKindOrDefault(in.Kind, "interactive"), ModelMain: in.ModelMain,
	}
	insert := func(tx *gorm.DB) error {
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
		t.ID, t.Seq = 0, maxSeq+1 // 重试时清掉上一次 Create 已回填的自增 ID,避免带 ID 重插
		return tx.Create(t).Error
	}
	// 2026-07-31 线上审计 §五:RecordBlockedTurn 起了本表**第二个并发写者**(异步落配额拦截行),
	// 它与本函数抢同一条 uk_session_seq(MAX(seq)+1 竞态)。撞键时旧代码只按 client_turn_id 回读,
	// 回读不中就直接失败 → 那一轮 turnID=0、整轮事件无处可落(journal 静默缺一轮)。故补有界重试:
	// seq 撞了就重算再插;client_turn_id 撞了走下面的回读幂等路径。
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = s.db.WithContext(ctx).Transaction(insert)
		if err == nil || !IsDuplicateKey(err) {
			break
		}
		// 并发同 clientTurnId → 回读既有行(沿用 repository.go 样板),命中即幂等返回。
		var ex Turn
		if e2 := s.db.WithContext(ctx).Where("agent_session_id = ? AND client_turn_id = ?", in.AgentSessionID, in.ClientTurnID).First(&ex).Error; e2 == nil {
			return &ex, true, nil
		}
		// 回读不中 = 撞的是 seq 而非 clientTurnId → 重算 MAX(seq)+1 再试。
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

// BumpAttempt 记录该 turn 的重投次数(2026-07-31 线上审计 §五)。GREATEST 保证幂等取大:
// 重复调用 / 乱序到达都不会把计数改小,也不需要读-改-写事务。
func (s *eventlogStore) BumpAttempt(ctx context.Context, turnID uint64, n int) error {
	if turnID == 0 || n <= 0 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&Turn{}).Where("id = ?", turnID).
		Update("attempt", gorm.Expr("GREATEST(attempt, ?)", n)).Error
}

// RecordBlockedTurn 落一条被门禁拦下的轮(契约见 EventLog 接口注释)。一个事务两行:
// agent_turns(status=blocked/kind=quota/completed_at=now) + 一条 EvQuotaBlocked 事件。
// 不走 batcher —— blocked 轮没有后续的 FlushTurn/CompleteTurn 来触发落盘,直接同步 INSERT 更简单也更准。
func (s *eventlogStore) RecordBlockedTurn(ctx context.Context, in TurnInput, payload []byte) error {
	if in.AgentSessionID == "" {
		return nil
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	cid := in.ClientTurnID
	if cid == "" {
		cid = uuid.NewString() // 老客户端不带 clientTurnId → mint,保证每次尝试各占一行(漏斗要的是次数)
	}
	cid = blockedTurnIDPrefix + cid
	if len(cid) > maxClientTurnIDLen {
		cid = cid[:maxClientTurnIDLen]
	}
	now := time.Now()
	t := &Turn{
		AgentSessionID: in.AgentSessionID, FeatureKey: in.FeatureKey, UserID: in.UserID,
		ClientTurnID: cid, RoleUserText: in.RoleUserText,
		Status: turnStatusBlocked, Kind: journalKindOrDefault(in.Kind, turnKindQuota),
		CompletedAt: &now,
	}
	insert := func(tx *gorm.DB) error {
		var ex Turn
		e := tx.Where("agent_session_id = ? AND client_turn_id = ?", in.AgentSessionID, cid).First(&ex).Error
		if e == nil {
			return nil // 同一次拦截重复上报(前端未送达看门狗重发同 id)→ 幂等 no-op
		}
		if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}
		// seq 与真实轮共用 uk_session_seq 唯一索引 → 必须取号(不能恒 0,否则同会话第二次拦截撞键)。
		var maxSeq uint
		tx.Model(&Turn{}).Where("agent_session_id = ?", in.AgentSessionID).Select("COALESCE(MAX(seq),0)").Scan(&maxSeq)
		t.ID, t.Seq = 0, maxSeq+1 // 重试时清掉上一次已回填的自增 ID(同 BeginTurn)
		if cerr := tx.Create(t).Error; cerr != nil {
			return cerr
		}
		return tx.Create(&TurnEventRow{
			TurnID: t.ID, AgentSessionID: in.AgentSessionID, EvSeq: 1,
			EvType: string(EvQuotaBlocked), Payload: payload,
		}).Error
	}
	var err error
	for attempt := 0; attempt < 3; attempt++ { // 与 BeginTurn 抢 MAX(seq)+1 时重算再试
		err = s.db.WithContext(ctx).Transaction(insert)
		if err == nil || !IsDuplicateKey(err) {
			return err
		}
	}
	return nil // 三次仍撞键:让步(漏斗少一行远轻于把错误往上抛),调用方本就只 Warn
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
	// blocked 轮(配额门拦下、从未执行)排除在回放之外(2026-07-31 线上审计 §五):它不是对话内容,
	// 既不该占「最近 N 轮」的名额把真历史挤出 seed_history,也不该出现在 totalTurns / hasMore 口径里。
	var total int64
	s.db.WithContext(ctx).Model(&Turn{}).Where("agent_session_id = ? AND status <> ?", sid, turnStatusBlocked).Count(&total)
	if total == 0 {
		return nil, 0, false, nil
	}
	var turnIDs []uint64
	s.db.WithContext(ctx).Model(&Turn{}).Where("agent_session_id = ? AND status <> ?", sid, turnStatusBlocked).
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

// RecordBlocked —— TurnCoordinator 侧的门禁拦截落库入口(方法定义在此,与 RecordBlockedTurn 同处一屏)。
// 2026-07-31 线上审计 §五:配额墙是全站最强付费触发器(拦截→支付最快 35 秒;9 个被拦用户 5 人付费、
// 贡献 97% 订单额),但这条漏斗此前只有一条 INFO 日志,docker json-file 轮转后即失 —— 上线半年靠
// grep 日志逐条对时才算得出转化率。落成 agent_turns(status=blocked, kind=quota) 后它是一等公民数据。
//
// 两条硬约束:
//  ① **绝不阻塞拦截本身**:异步 goroutine + 自带 3s 超时的独立 ctx(调用方的 hookCtx 会随 hub 关闭
//     被 cancel,不能借用),写库失败只 slog.Warn —— 拦截照常生效,用户照常收到 error 帧;
//  ② **绝不进前端回放**:读侧按 status 过滤(ReadRecentTurns)+ EvQuotaBlocked 在 FoldToMessages
//     无 case,两道都保证它不会被误渲染成对话轮。
func (tc *TurnCoordinator) RecordBlocked(in TurnInput, payload []byte) {
	if tc == nil || tc.log == nil {
		return
	}
	safego.Go("agentbridge-record-blocked-turn", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := tc.log.RecordBlockedTurn(ctx, in, payload); err != nil {
			slog.Warn("agentbridge: record blocked turn failed (interception unaffected)",
				"feature", in.FeatureKey, "session_id", in.AgentSessionID, "user_id", in.UserID, "err", err)
		}
	})
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

// researchStateSnapshot 判定一条事件是否是证据账本的**全量快照**(EvEvidence 里 type=research_state
// 的那种),是则原样返回其 payload,否则 nil。
//
// 刻意只认 research_state、跳过 evidence_appended:前者带 ledger_total / queries / by_origin,
// **单条即当前态**;后者是增量事件,拼装是 P1 的事 —— 拼半套会长出第二套证据口径
// (终稿否决清单 #2/#13:台账只能有一份)。
//
// EvEvidence 的两个读侧出口共用这一个判定 —— latestResearchState(seed_history 的重建入口)
// 与 FoldToMessages(历史回放的过程 chip)。同一份「什么算快照」,两条读侧口径不可能漂移。
func researchStateSnapshot(e Event) json.RawMessage {
	if e.EvType != EvEvidence {
		return nil
	}
	var f struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(e.Payload, &f); err != nil || f.Type != "research_state" {
		return nil
	}
	return e.Payload
}

// latestResearchState 取整段事件流里最后一条 research_state 快照(没有则 nil)。
//
// 2026-08 证据账本 P0-c(终稿 §五 P0-b 最后一条):seedHistoryFromJournal 把它挂到 seed_history
// 的 `research` 字段,作为「executor workdir 被 GC / 换机后账本文件没了」时的重建入口。
// P0 只负责把字段带上,消费(executor 据此重建 evidence/ledger.jsonl)在 P1。
func latestResearchState(evs []Event) json.RawMessage {
	for i := len(evs) - 1; i >= 0; i-- {
		if snap := researchStateSnapshot(evs[i]); snap != nil {
			return snap
		}
	}
	return nil
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
	// 本轮最后一条 research_state 全量快照(后到覆盖先到);在轮边界(下一条 user_message)与
	// 事件流末尾折出一条合成 entry。见 case EvEvidence。
	var pendingResearch json.RawMessage
	flushResearch := func() {
		if pendingResearch == nil {
			return
		}
		content, _ := json.Marshal([]json.RawMessage{pendingResearch})
		out = append(out, agent.SessionMessage{Type: "research_state", Content: content})
		pendingResearch = nil
	}
	for _, e := range evs {
		switch e.EvType {
		case EvUserMessage:
			flushAsst()
			flushResearch()
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
		case EvEvidence:
			// 取证过程计数带外声明 → 合成一条 `research_state` entry(content = [原帧])。范式与
			// EvArtifact 逐条相同:带外声明入 journal → 折出合成 entry → 前端 replay 绑回对应轮。
			// 没有它,刷新/重入后已完成轮的 ResearchStateChip 就消失 —— 而「本轮未检索」那一格
			// 正是这枚 chip 存在的全部理由,第二天回来复盘时看不到它等于没做。
			//
			// 只认 research_state 全量快照(researchStateSnapshot 判定);evidence_appended 是增量,
			// 拼装等于第二份台账(终稿否决清单 #2),那是 P1 的 [[E<n>]] resolve 才做的事。
			// 同轮多条(重投 / 续流会重复发)取**最后一条** —— 与实时 fold 的 `case 'research_state'`
			// (后到覆盖先到)同构,故 flush 推迟到轮边界,一轮至多产出一条。
			//
			// 🔴 **不回喂模型**:executor 侧 convertFlatToAnthropic 只保留 type=="text"/"tool_use"
			// 的块,本 entry 的块两者都不是 → seed_history 里整条被丢弃(与 artifact / error 同款保证)。
			// 引擎口径的账本真源仍只有 evidence/ledger.jsonl 一份。
			if snap := researchStateSnapshot(e); snap != nil {
				pendingResearch = snap
			}
		}
	}
	flushAsst()
	flushResearch()
	return out
}
