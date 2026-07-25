// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// W2 P1-a 诚实性事后雷达单测:DOI 抽取(尾部标点/lowercase/去重)与证据语料比对。

package agentbridge

import (
	"encoding/json"
	"reflect"
	"testing"

	"scholar-backend/internal/agent"
)

func TestExtractDOIs(t *testing.T) {
	text := "见 10.1038/s41586-021-03819-2。另参考 (10.1145/3292500.3330701) 与 " +
		"HTTPS://DOI.ORG/10.1016/J.CELL.2023.01.001, 重复 10.1038/s41586-021-03819-2."
	got := extractDOIs(text)
	want := []string{
		"10.1038/s41586-021-03819-2",
		"10.1145/3292500.3330701",
		"10.1016/j.cell.2023.01.001",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("extractDOIs = %v, want %v", got, want)
	}
}

func TestUnverifiedDOIs(t *testing.T) {
	jMsgs := []agent.SessionMessage{
		// 用户粘贴的 DOI = 合法来源
		{Type: "user", Content: json.RawMessage(`[{"type":"text","text":"帮我看看 10.1000/user.pasted"}]`)},
		// 工具返回的 DOI = 合法来源(大小写不同也要命中)
		{Type: "tool_result", Content: json.RawMessage(`[{"type":"tool_result","content":"{\"doi\":\"10.1038/S41586-021-03819-2\"}"}]`)},
		// assistant 旧轮文本不算证据(不能自洗白)
		{Type: "assistant", Content: json.RawMessage(`[{"type":"text","text":"之前提到 10.9999/fabricated.111"}]`)},
	}
	asst := "综述引用:10.1038/s41586-021-03819-2 与 10.1000/user.pasted 均已核实;" +
		"另有 10.9999/fabricated.111 和 10.8888/made.up.222。"
	got := unverifiedDOIs(asst, journalEvidenceCorpus(jMsgs))
	want := []string{"10.9999/fabricated.111", "10.8888/made.up.222"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unverifiedDOIs = %v, want %v", got, want)
	}
}

func TestUnverifiedDOIsAllVerified(t *testing.T) {
	jMsgs := []agent.SessionMessage{
		{Type: "tool_result", Content: json.RawMessage(`[{"content":"10.1038/s41586-021-03819-2"}]`)},
	}
	if got := unverifiedDOIs("引用 10.1038/s41586-021-03819-2.", journalEvidenceCorpus(jMsgs)); len(got) != 0 {
		t.Fatalf("verified DOI reported as unverified: %v", got)
	}
}
