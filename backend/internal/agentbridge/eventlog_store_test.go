// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// W3 P1-A 失败轮历史回放读侧单测:FoldToMessages 对 EvError 按冻结契约折出
// {Type:"error", Content:{"code","message"}}(content 为 JSON 对象),顺序按事件流位置。

package agentbridge

import (
	"encoding/json"
	"errors"
	"testing"
)

// foldStore FoldToMessages 是纯函数,不触 db/batcher,零值接收者即可测。
func foldStore() *eventlogStore { return &eventlogStore{} }

func TestFoldToMessagesEvError(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"帮我搜索"}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"正在处理"}`)},
		// 第 1 波 hub 净化后 Append 的 error 帧形态(可能带 usage/calls,只取 code/message)
		{EvType: EvError, Payload: json.RawMessage(`{"type":"error","code":"empty_turn","message":"模型没有返回任何内容,本轮未完成,请重试。","retryable":true,"usage":{"input_tokens":0}}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 3 {
		t.Fatalf("FoldToMessages len = %d, want 3 (user + assistant + error)", len(msgs))
	}
	if msgs[0].Type != "user" || msgs[1].Type != "assistant" {
		t.Fatalf("unexpected leading types: %s, %s", msgs[0].Type, msgs[1].Type)
	}
	errMsg := msgs[2]
	if errMsg.Type != "error" {
		t.Fatalf("last message type = %q, want \"error\"", errMsg.Type)
	}
	// 冻结契约:content 是 {"code","message"} JSON 对象(不是块数组)
	var content map[string]string
	if err := json.Unmarshal(errMsg.Content, &content); err != nil {
		t.Fatalf("error content not a JSON object: %v (raw: %s)", err, errMsg.Content)
	}
	if content["code"] != "empty_turn" {
		t.Errorf("code = %q, want \"empty_turn\"", content["code"])
	}
	if content["message"] != "模型没有返回任何内容,本轮未完成,请重试。" {
		t.Errorf("message = %q, unexpected", content["message"])
	}
	if _, has := content["usage"]; has {
		t.Errorf("content should only carry code/message, got usage passthrough")
	}
}

func TestFoldToMessagesEvErrorDefaultCode(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"hi"}`)},
		{EvType: EvError, Payload: json.RawMessage(`{"type":"error","message":"上游服务不可用"}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 2 || msgs[1].Type != "error" {
		t.Fatalf("unexpected fold result: %+v", msgs)
	}
	var content map[string]string
	if err := json.Unmarshal(msgs[1].Content, &content); err != nil {
		t.Fatalf("error content not a JSON object: %v", err)
	}
	if content["code"] != "error" {
		t.Errorf("missing code should default to \"error\", got %q", content["code"])
	}
}

func TestFoldToMessagesEvErrorFlushesAssistantBuffer(t *testing.T) {
	// error 事件必须先 flush 累积中的 assistant 文本 —— 错误提示出现在已流出正文**之后**。
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"q"}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"部分"}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"回答"}`)},
		{EvType: EvError, Payload: json.RawMessage(`{"type":"error","code":"turn_timeout","message":"超时"}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 3 {
		t.Fatalf("len = %d, want 3", len(msgs))
	}
	if msgs[1].Type != "assistant" {
		t.Fatalf("assistant text not flushed before error entry: %+v", msgs)
	}
	var blocks []map[string]string
	if err := json.Unmarshal(msgs[1].Content, &blocks); err != nil || len(blocks) != 1 || blocks[0]["text"] != "部分回答" {
		t.Fatalf("assistant content unexpected: %s", msgs[1].Content)
	}
	if msgs[2].Type != "error" {
		t.Fatalf("error entry must follow flushed assistant text, got %q", msgs[2].Type)
	}
}

// 2026-07-31 线上审计 §五(配额拦截 journal 化)的冻结约束:EvQuotaBlocked **绝不产 message** ——
// 它是漏斗数据不是对话内容。若哪天有人给 FoldToMessages 加了 case,历史回放里会凭空多出一条
// 从未发出的用户消息 / 一条重复的额度错误(前端 blocked 轮语义由实时 error 帧独占)。
func TestFoldToMessagesIgnoresQuotaBlocked(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"帮我改这段"}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"好的"}`)},
		{EvType: EvQuotaBlocked, Payload: json.RawMessage(`{"type":"error","code":"quota_exceeded","message":"今日额度已用完","quota":{"reset_at":"2026-08-01T00:00:00+08:00"}}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 2 {
		t.Fatalf("len = %d, want 2 (user + assistant);quota_blocked 不得折出任何 message: %+v", len(msgs), msgs)
	}
	if msgs[0].Type != "user" || msgs[1].Type != "assistant" {
		t.Fatalf("unexpected types: %s, %s", msgs[0].Type, msgs[1].Type)
	}
}

// 2026-08 证据账本 P0-c:EvEvidence 的 research_state **全量快照**折出一条带外合成 entry
// (Type=="research_state", content=[原帧]),让历史回放还原 ResearchStateChip —— 范式同 EvArtifact。
// 增量帧 evidence_appended 一律不折(拼装增量 = 第二份台账,终稿否决清单 #2)。
//
// ⏪ 本用例的前身叫 TestFoldToMessagesIgnoresEvidence,断言的是「EvEvidence 绝不产 message」。
// 那条约束真正要守的是「不回喂模型上下文」,而它由 executor 侧 convertFlatToAnthropic
// (只留 text/tool_use 块)保证,与「产不产 entry」是两件事 —— 一刀切的代价是刷新后所有
// 已完成轮的 chip 全部消失,恰好抹掉「本轮未检索」那一格。
func TestFoldToMessagesResearchStateEntry(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"帮我找几篇"}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"evidence_appended","ids":["E1","E2"]}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"找到了"}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":16,"queries":3,"by_origin":{"retrieval":14,"user_text":2}}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 3 {
		t.Fatalf("len = %d, want 3 (user + assistant + research_state): %+v", len(msgs), msgs)
	}
	if msgs[0].Type != "user" || msgs[1].Type != "assistant" {
		t.Fatalf("unexpected leading types: %s, %s", msgs[0].Type, msgs[1].Type)
	}
	// 位置:在本轮 assistant 之后(前端 replay 据此绑回「当前轮」)。
	if msgs[2].Type != "research_state" {
		t.Fatalf("last message type = %q, want \"research_state\"", msgs[2].Type)
	}
	// content = [原帧](wire 的 snake_case 原样透传,前端 replay 一次性转驼峰)。
	var blocks []struct {
		Type        string         `json:"type"`
		Queries     int            `json:"queries"`
		LedgerTotal int            `json:"ledger_total"`
		ByOrigin    map[string]int `json:"by_origin"`
	}
	if err := json.Unmarshal(msgs[2].Content, &blocks); err != nil {
		t.Fatalf("content 不是块数组: %v (%s)", err, msgs[2].Content)
	}
	if len(blocks) != 1 {
		t.Fatalf("content 块数 = %d, want 1", len(blocks))
	}
	b := blocks[0]
	if b.Type != "research_state" || b.Queries != 3 || b.LedgerTotal != 16 || b.ByOrigin["retrieval"] != 14 {
		t.Fatalf("快照字段未原样透传: %+v", b)
	}
}

// 只有增量帧(evidence_appended)时不得折出任何 entry —— 否则用户会看到一枚数字全 0 的
// chip,而那不是「本轮未检索」,是「我们没数据但装作有」。
func TestFoldToMessagesIgnoresEvidenceAppended(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"帮我找几篇"}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"evidence_appended","ids":["E1","E2"]}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"找到了"}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	if len(msgs) != 2 {
		t.Fatalf("len = %d, want 2 (user + assistant);evidence_appended 不得折出 entry: %+v", len(msgs), msgs)
	}
}

// 同轮多条 research_state(重投 / 续流会重复发)取**最后一条**,一轮至多一条 entry ——
// 与实时 fold 的 `case 'research_state'`(全量快照,后到覆盖先到)同构。
func TestFoldToMessagesResearchStateLastWinsPerTurn(t *testing.T) {
	evs := []Event{
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"找几篇"}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":4,"queries":1}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":16,"queries":3}`)},
		{EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"总结一下"}`)},
		{EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"好的"}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":16,"queries":0}`)},
	}
	msgs := foldStore().FoldToMessages(evs)
	// user, research(轮1), user, assistant, research(轮2)
	var got []string
	for _, m := range msgs {
		got = append(got, m.Type)
	}
	want := []string{"user", "research_state", "user", "assistant", "research_state"}
	if len(got) != len(want) {
		t.Fatalf("types = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("types = %v, want %v", got, want)
		}
	}
	type snap struct {
		Queries     int `json:"queries"`
		LedgerTotal int `json:"ledger_total"`
	}
	var s1, s2 []snap
	if err := json.Unmarshal(msgs[1].Content, &s1); err != nil {
		t.Fatalf("轮1 快照不可解析: %v", err)
	}
	if err := json.Unmarshal(msgs[4].Content, &s2); err != nil {
		t.Fatalf("轮2 快照不可解析: %v", err)
	}
	if s1[0].Queries != 3 || s1[0].LedgerTotal != 16 {
		t.Fatalf("轮1 应取最后一条快照(queries=3, total=16),got %+v", s1[0])
	}
	if s2[0].Queries != 0 || s2[0].LedgerTotal != 16 {
		t.Fatalf("轮2 快照 got %+v, want queries=0 total=16(「本轮未检索」必须活着到达前端)", s2[0])
	}
}

// latestResearchState:只认全量快照 research_state、取最后一条;evidence_appended 增量与
// 其它事件类型一律跳过(P0 不拼装增量,拼半套等于第二份台账)。
func TestLatestResearchState(t *testing.T) {
	if got := latestResearchState(nil); got != nil {
		t.Fatalf("空事件流应返回 nil,got %s", got)
	}
	onlyIncrement := []Event{
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"evidence_appended","ids":["E1"]}`)},
		{EvType: EvToolResult, Payload: json.RawMessage(`{"type":"tool_result","toolUseId":"t1"}`)},
	}
	if got := latestResearchState(onlyIncrement); got != nil {
		t.Fatalf("只有增量事件时应返回 nil,got %s", got)
	}
	evs := []Event{
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":4,"queries":1}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"evidence_appended","ids":["E5"]}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"research_state","ledger_total":16,"queries":3}`)},
		{EvType: EvEvidence, Payload: json.RawMessage(`{"type":"evidence_appended","ids":["E17"]}`)},
	}
	var snap struct {
		Type        string `json:"type"`
		LedgerTotal int    `json:"ledger_total"`
	}
	if err := json.Unmarshal(latestResearchState(evs), &snap); err != nil {
		t.Fatalf("快照不可解析: %v", err)
	}
	if snap.Type != "research_state" || snap.LedgerTotal != 16 {
		t.Fatalf("应取最后一条 research_state 全量快照,got %+v", snap)
	}
}

// blockedTurnKind:配额拒绝归 quota(漏斗口径),其它 hook 拒绝单独归 hook,不得混。
func TestBlockedTurnKind(t *testing.T) {
	if got := blockedTurnKind(NewQuotaError("今日额度已用完")); got != turnKindQuota {
		t.Errorf("quota 拒绝 kind = %q, want %q", got, turnKindQuota)
	}
	if got := blockedTurnKind(errors.New("internal hook error")); got != turnKindHookBlock {
		t.Errorf("非配额拒绝 kind = %q, want %q", got, turnKindHookBlock)
	}
}
