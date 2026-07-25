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
