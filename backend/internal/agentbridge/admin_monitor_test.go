package agentbridge

import (
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentattachstore"

	"github.com/gin-gonic/gin"
)

func TestAdminMonitorFeatureClosedSet(t *testing.T) {
	for _, feature := range []string{"smart_search", "claw", "prism", "boltslides", "sci_draw", "stat_lab"} {
		if !isAdminMonitorFeature(feature) {
			t.Errorf("feature %q should be allowed", feature)
		}
	}
	for _, feature := range []string{"", "peerreview", "CLAW", "unknown", "claw' OR 1=1"} {
		if isAdminMonitorFeature(feature) {
			t.Errorf("feature %q should be rejected", feature)
		}
	}
}

func TestAdminSessionSearchClauseIncludesSessionAndTitle(t *testing.T) {
	sql, args := adminSessionSearchClause(`  42  `)
	for _, want := range []string{"u.id = ?", "u.username", "s.agent_session_id", "s.title"} {
		if !strings.Contains(sql, want) {
			t.Errorf("search SQL %q missing %q", sql, want)
		}
	}
	if got, want := len(args), 6; got != want { // user id + 3 user LIKE + session LIKE + title LIKE
		t.Fatalf("args len = %d, want %d: %#v", got, want, args)
	}
	if got, want := args[len(args)-1], `%42%`; got != want {
		t.Errorf("escaped title LIKE = %#v, want %#v", got, want)
	}
	_, escapedArgs := adminSessionSearchClause(`_%`)
	if got, want := escapedArgs[len(escapedArgs)-1], `%\_\%%`; got != want {
		t.Errorf("escaped wildcard LIKE = %#v, want %#v", got, want)
	}

	if sql, args := adminSessionSearchClause("  "); sql != "" || args != nil {
		t.Fatalf("empty keyword = (%q, %#v), want empty", sql, args)
	}
}

func TestAdminLimitTurns(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		query string
		want  int
	}{
		{"", 60},
		{"?limit_turns=120", 120},
		{"?limitTurns=80", 80},
		{"?limit_turns=0", 60},
		{"?limit_turns=oops", 60},
		{"?limit_turns=9999", 200},
	}
	for _, test := range tests {
		req := httptest.NewRequest("GET", "/admin/messages"+test.query, nil)
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = req
		if got := adminLimitTurns(ctx); got != test.want {
			t.Errorf("query %q: limit = %d, want %d", test.query, got, test.want)
		}
	}
}

func TestAdminBeforeSeqAndStructured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		query string
		want  uint
		bad   bool
	}{
		{"", 0, false}, {"?before_seq=81", 81, false},
		{"?before_seq=0", 0, true}, {"?before_seq=-1", 0, true}, {"?before_seq=nope", 0, true},
	} {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("GET", "/admin/messages"+tc.query, nil)
		got, err := adminBeforeSeq(ctx)
		if (err != nil) != tc.bad {
			t.Fatalf("query %q error=%v, want bad=%v", tc.query, err, tc.bad)
		}
		if !tc.bad && tc.want == 0 && got != nil {
			t.Fatalf("query %q got cursor=%v, want nil", tc.query, got)
		}
		if !tc.bad && tc.want > 0 && (got == nil || *got != tc.want) {
			t.Fatalf("query %q got cursor=%v, want %d", tc.query, got, tc.want)
		}
	}
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("GET", "/admin/messages?structured=true", nil)
	if !adminStructured(ctx) {
		t.Fatal("structured=true should enable structured response")
	}
}

func TestBuildAdminTurnEnvelopesPreservesAuthoritativeMetadata(t *testing.T) {
	started := time.Date(2026, 8, 9, 10, 0, 0, 123_000_000, time.UTC)
	completed := started.Add(2300 * time.Millisecond)
	longModel := "provider/" + strings.Repeat("model-segment-", 8)
	page := &adminJournalPage{
		Turns: []Turn{
			{
				ID: 11, Seq: 7, Status: "complete", Kind: "interactive", Attempt: 2,
				ModelMain: longModel, RoleUserText: "帮我检索论文", CreatedAt: started, CompletedAt: &completed,
			},
			{
				ID: 12, Seq: 8, Status: "blocked", Kind: "quota", RoleUserText: "继续分析", CreatedAt: completed,
			},
		},
		Events: []Event{
			{TurnID: 11, EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"帮我检索论文"}`)},
			{TurnID: 11, EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"这是结果"}`)},
			{TurnID: 12, EvType: EvQuotaBlocked, Payload: json.RawMessage(`{"type":"error","code":"quota_exceeded"}`)},
		},
		Ledgers: []BillingLedgerRow{
			{TurnID: 11, InputTokens: 101, OutputTokens: 22, CacheRead: 7, CacheCreation: 3},
		},
	}

	turns, flat := buildAdminTurnEnvelopes(page)
	if got, want := len(turns), 2; got != want {
		t.Fatalf("turns len = %d, want %d", got, want)
	}
	first := turns[0]
	if first.ID != 11 || first.Seq != 7 || first.Status != "complete" || first.Kind != "interactive" || first.Attempt != 2 {
		t.Errorf("first envelope metadata drifted: %#v", first)
	}
	if first.Model != longModel {
		t.Errorf("model was truncated/guessed: got %q, want %q", first.Model, longModel)
	}
	if first.DurationMs == nil || *first.DurationMs != 2300 {
		t.Errorf("durationMs = %v, want 2300", first.DurationMs)
	}
	if first.Usage == nil || first.Usage.InputTokens != 101 || first.Usage.OutputTokens != 22 ||
		first.Usage.CacheReadTokens != 7 || first.Usage.CacheCreationTokens != 3 {
		t.Errorf("usage = %#v, want authoritative ledger values", first.Usage)
	}
	if got, want := len(first.Messages), 2; got != want {
		t.Fatalf("first messages len = %d, want %d", got, want)
	}
	blocked := turns[1]
	if blocked.Status != "blocked" || blocked.Kind != "quota" || blocked.UserText != "继续分析" {
		t.Errorf("blocked envelope metadata drifted: %#v", blocked)
	}
	if blocked.Model != "" || blocked.CompletedAt != nil || blocked.DurationMs != nil || blocked.Usage != nil {
		t.Errorf("missing blocked metadata must stay empty, got %#v", blocked)
	}
	if blocked.Messages == nil || len(blocked.Messages) != 0 {
		t.Errorf("blocked messages = %#v, want non-nil empty slice", blocked.Messages)
	}
	if got, want := len(flat), 2; got != want {
		t.Fatalf("legacy flat messages len = %d, want %d", got, want)
	}
}

func TestBuildAdminTurnEnvelopesEmptySlices(t *testing.T) {
	turns, messages := buildAdminTurnEnvelopes(nil)
	if turns == nil || messages == nil || len(turns) != 0 || len(messages) != 0 {
		t.Fatalf("empty result must encode as arrays: turns=%#v messages=%#v", turns, messages)
	}
}

func TestBuildAdminTurnEnvelopesOrdersByAuthoritativeEventSequence(t *testing.T) {
	page := &adminJournalPage{
		Turns: []Turn{{ID: 61, AgentSessionID: "s", Seq: 1, Status: "complete"}},
		// 真实库中同步 terminal 可先拿到更小 id，ID 不是事件时序。
		Events: []Event{
			{ID: 100, TurnID: 61, EvSeq: 3, EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"B"}`)},
			{ID: 102, TurnID: 61, EvSeq: 1, EvType: EvUserMessage, Payload: json.RawMessage(`{"type":"user_message","content":"Q"}`)},
			{ID: 99, TurnID: 61, EvSeq: 4, EvType: EvMessageComplete, Payload: json.RawMessage(`{"type":"message_complete"}`)},
			{ID: 101, TurnID: 61, EvSeq: 2, EvType: EvContentDelta, Payload: json.RawMessage(`{"type":"content_delta","text":"A"}`)},
		},
	}
	turns, _ := buildAdminTurnEnvelopes(page)
	if len(turns) != 1 || len(turns[0].Messages) != 2 {
		t.Fatalf("unexpected fold: %#v", turns)
	}
	var blocks []map[string]any
	if err := json.Unmarshal(turns[0].Messages[1].Content, &blocks); err != nil || len(blocks) != 1 || blocks[0]["text"] != "AB" {
		t.Fatalf("event order used id instead of ev_seq: %s err=%v", turns[0].Messages[1].Content, err)
	}
}

func TestAdminFailedTurnUsesLastErrorUsageOnlyAsFallback(t *testing.T) {
	page := &adminJournalPage{
		Turns: []Turn{{ID: 41, AgentSessionID: "s", Seq: 2, Status: "failed", ModelMain: "db-model"}},
		Events: []Event{
			{TurnID: 41, EvType: EvError, Payload: json.RawMessage(`{"type":"error","usage":{"input_tokens":1,"output_tokens":2,"model":"old-model"}}`)},
			{TurnID: 41, EvType: EvError, Payload: json.RawMessage(`{"type":"error","usage":{"input_tokens":7,"output_tokens":8,"cache_read_tokens":3},"calls":[{"model":"last-call-model","input_tokens":7,"output_tokens":8}]}`)},
		},
		Ledgers: []BillingLedgerRow{{TurnID: 41, InputTokens: 99, OutputTokens: 88}},
	}
	turns, _ := buildAdminTurnEnvelopes(page)
	if len(turns) != 1 {
		t.Fatalf("turn count=%d", len(turns))
	}
	if turns[0].Model != "db-model" {
		t.Fatalf("DB authoritative model overwritten by error fallback: %q", turns[0].Model)
	}
	if turns[0].Usage == nil || turns[0].Usage.InputTokens != 99 || turns[0].Usage.OutputTokens != 88 {
		t.Fatalf("ledger must win over error fallback: %#v", turns[0].Usage)
	}

	page.Turns[0].ModelMain = ""
	page.Ledgers = nil
	turns, _ = buildAdminTurnEnvelopes(page)
	if turns[0].Model != "last-call-model" {
		t.Fatalf("last EvError call model=%q, want last-call-model", turns[0].Model)
	}
	if turns[0].Usage == nil || turns[0].Usage.InputTokens != 7 || turns[0].Usage.OutputTokens != 8 || turns[0].Usage.CacheReadTokens != 3 {
		t.Fatalf("last EvError usage=%#v", turns[0].Usage)
	}
}

func TestAdminAbortedCompleteFrameCannotAppearComplete(t *testing.T) {
	page := &adminJournalPage{
		Turns:  []Turn{{ID: 49, AgentSessionID: "s", Seq: 1, Status: "complete"}},
		Events: []Event{{TurnID: 49, EvType: EvMessageComplete, Payload: json.RawMessage(`{"type":"message_complete","aborted":true}`)}},
	}
	turns, _ := buildAdminTurnEnvelopes(page)
	if len(turns) != 1 || turns[0].Status != "aborted" {
		t.Fatalf("aborted authority lost: %#v", turns)
	}
}

func TestBlockedTurnPreservesStructuredAttachmentsAndReferences(t *testing.T) {
	sid := "blocked-sid"
	abs := agentSessionWorkdirRoot() + "/" + sid + "/uploads/data.csv"
	content := "请分析\n\n【引用文献】\n- 📄 Paper A\n- 📁 Folder B [3篇]\n【/引用文献】"
	userFrame, _ := json.Marshal(map[string]any{
		"type": "user_message", "content": content,
		"attachments": []map[string]any{{"type": "file", "name": "data.csv", "mimeType": "text/csv", "path": abs}},
	})
	page := &adminJournalPage{
		Turns: []Turn{{ID: 51, AgentSessionID: sid, Seq: 1, Status: turnStatusBlocked, Kind: turnKindQuota, RoleUserText: content}},
		Events: []Event{
			{TurnID: 51, EvType: EvUserMessage, Payload: userFrame},
			{TurnID: 51, EvType: EvQuotaBlocked, Payload: json.RawMessage(`{"type":"error","code":"quota_exceeded"}`)},
		},
	}
	turns, flat := buildAdminTurnEnvelopes(page)
	if len(turns) != 1 || len(turns[0].Messages) != 1 {
		t.Fatalf("blocked envelope must retain user message: %#v", turns)
	}
	if len(flat) != 0 {
		t.Fatalf("blocked attempt must stay out of legacy conversation: %#v", flat)
	}
	if got := turns[0].Attachments; len(got) != 1 || got[0].Path != "uploads/data.csv" || got[0].Name != "data.csv" {
		t.Fatalf("blocked attachments=%#v", got)
	}
	if got := turns[0].References; len(got) != 2 || got[0].Kind != "paper" || got[1].Kind != "folder" || got[1].PaperCount == nil || *got[1].PaperCount != 3 {
		t.Fatalf("blocked references=%#v", got)
	}
	var blocks []map[string]any
	if err := json.Unmarshal(turns[0].Messages[0].Content, &blocks); err != nil || len(blocks) != 1 {
		t.Fatalf("blocked message content=%s err=%v", turns[0].Messages[0].Content, err)
	}
}

func TestAdminNormalizesAttachmentMarkersInStringAndBlockContent(t *testing.T) {
	sid := "normalize-sid"
	abs := agentSessionWorkdirRoot() + "/" + sid + "/uploads/a.pdf"
	direct, _ := json.Marshal(`@"` + abs + `" 请分析`)
	messages := []agent.SessionMessage{
		{Type: "user", Content: direct},
		adminTestMessage("user", `@"`+abs+`" 继续`),
	}
	adminNormalizeUserMessagePaths(messages, sid)
	if got := adminNormalizeUserTextPath(`@"`+abs+`" 请分析`, sid); got != `@"uploads/a.pdf" 请分析` {
		t.Fatalf("envelope userText normalized=%q", got)
	}
	var directText string
	if err := json.Unmarshal(messages[0].Content, &directText); err != nil || directText != `@"uploads/a.pdf" 请分析` {
		t.Fatalf("direct normalized=%q err=%v", directText, err)
	}
	var blocks []map[string]any
	if err := json.Unmarshal(messages[1].Content, &blocks); err != nil || blocks[0]["text"] != `@"uploads/a.pdf" 继续` {
		t.Fatalf("blocks normalized=%s err=%v", messages[1].Content, err)
	}
	if left, right := adminTurnFingerprint(messages[:1], ""), adminTurnFingerprint(messages[1:], ""); left == "" || left == right {
		// 文本不同，不应误判为同一轮。
		t.Fatalf("different normalized messages fingerprinted equally: %q", left)
	}
	sameBlock := adminTestMessage("user", `@"uploads/a.pdf" 请分析`)
	if left, right := adminTurnFingerprint(messages[:1], ""), adminTurnFingerprint([]agent.SessionMessage{sameBlock}, ""); left != right {
		t.Fatalf("string/content[] semantic fingerprint mismatch: %q != %q", left, right)
	}
}

func adminTestMessage(kind, text string) agent.SessionMessage {
	content, _ := json.Marshal([]map[string]string{{"type": "text", "text": text}})
	return agent.SessionMessage{Type: kind, Content: content}
}

func adminTestTurn(label string) []agent.SessionMessage {
	return []agent.SessionMessage{adminTestMessage("user", "u-"+label), adminTestMessage("assistant", "a-"+label)}
}

func TestAdminHybridDeduplicatesBoundaryAndCursorLoadsAllHistory(t *testing.T) {
	archive := append(append(append([]agent.SessionMessage{}, adminTestTurn("a")...), adminTestTurn("b")...), adminTestTurn("c")...)
	journal := []AdminTurnEnvelope{
		{ID: 30, Seq: 30, Status: "complete", UserText: "u-c", Messages: adminTestTurn("c")},
		{ID: 31, Seq: 31, Status: "complete", UserText: "u-d", Messages: adminTestTurn("d")},
	}
	if got := adminHybridOverlap(splitAdminMessageTurns(archive), journal); got != 1 {
		t.Fatalf("boundary overlap=%d, want 1", got)
	}
	first := buildAdminHybridTranscript(archive, journal, 2, nil, true)
	if first.Source != "hybrid" || first.TotalTurns != 4 || !first.HasMore || first.NextBeforeSeq == nil || *first.NextBeforeSeq != 3 {
		t.Fatalf("first hybrid page meta=%#v", first)
	}
	if len(first.Messages) != 0 || len(first.Turns) != 2 || first.Turns[0].CursorSeq != 3 || first.Turns[1].CursorSeq != 4 {
		t.Fatalf("first hybrid page payload=%#v", first)
	}
	second := buildAdminHybridTranscript(archive, journal, 2, first.NextBeforeSeq, true)
	if second.HasMore || second.NextBeforeSeq != nil || len(second.Turns) != 0 || len(splitAdminMessageTurns(second.Messages)) != 2 {
		t.Fatalf("second hybrid page=%#v", second)
	}
}

func TestAdminHybridCursorCoversLongMergedHistoryWithoutDuplicates(t *testing.T) {
	archive := make([]agent.SessionMessage, 0)
	for i := 1; i <= 51; i++ {
		archive = append(archive, adminTestTurn("old-"+strconv.Itoa(i))...)
	}
	journal := make([]AdminTurnEnvelope, 0, 4)
	for i := 1; i <= 4; i++ {
		journal = append(journal, AdminTurnEnvelope{ID: uint64(i), Seq: uint(i), Messages: adminTestTurn("new-" + strconv.Itoa(i))})
	}
	var cursor *uint
	seen := 0
	for {
		page := buildAdminHybridTranscript(archive, journal, 10, cursor, true)
		if page.TotalTurns != 55 {
			t.Fatalf("total=%d, want55", page.TotalTurns)
		}
		seen += len(splitAdminMessageTurns(page.Messages)) + len(page.Turns)
		if !page.HasMore {
			break
		}
		if page.NextBeforeSeq == nil {
			t.Fatal("hasMore page missing cursor")
		}
		cursor = page.NextBeforeSeq
	}
	if seen != 55 {
		t.Fatalf("cursor pages covered %d turns, want55", seen)
	}
}

func TestAdminWorkspacePathAndSessionACL(t *testing.T) {
	valid := []struct{ raw, want string }{{"out/a.pdf", "out/a.pdf"}, {"out//a.pdf", "out/a.pdf"}, {"./uploads/x", "uploads/x"}}
	for _, tc := range valid {
		got, ok := normalizeAdminWorkspacePath(tc.raw)
		if !ok || got != tc.want {
			t.Errorf("normalize %q=(%q,%v), want %q", tc.raw, got, ok, tc.want)
		}
	}
	for _, raw := range []string{"", ".", "..", "../x", "out/../secret", "out/../../etc/passwd", "/etc/passwd", `out\..\secret`, "x\x00y", "out/a\n.txt"} {
		if got, ok := normalizeAdminWorkspacePath(raw); ok {
			t.Errorf("unsafe path %q accepted as %q", raw, got)
		}
	}
	now := time.Now()
	session := &SessionRow{AgentSessionID: "s1", UserID: 7, FeatureKey: "claw"}
	attachments := []agentattachstore.Attachment{
		{SessionID: "s1", UserID: 7, FeatureKey: "claw", RelPath: "uploads/ok.csv"},
		{SessionID: "other", UserID: 7, FeatureKey: "claw", RelPath: "uploads/cross-session"},
		{SessionID: "s1", UserID: 8, FeatureKey: "claw", RelPath: "uploads/cross-user"},
		{SessionID: "s1", UserID: 7, FeatureKey: "prism", RelPath: "uploads/cross-feature"},
		{SessionID: "s1", UserID: 7, FeatureKey: "claw", RelPath: "uploads/deleted", DeletedAt: &now},
	}
	legacyName := "11111111-2222-3333-4444-555555555555-legacy.pdf"
	crossName := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-cross.pdf"
	archiveName := "99999999-8888-7777-6666-555555555555-archive.pdf"
	legacyFrame, _ := json.Marshal(map[string]string{"content": `@"` + agentSessionWorkdirRoot() + `/s1/uploads/` + legacyName + `" 请读`})
	crossFrame, _ := json.Marshal(map[string]string{"content": `@"` + agentSessionWorkdirRoot() + `/s2/uploads/` + crossName + `" 请读`})
	events := []TurnEventRow{
		{AgentSessionID: "s1", EvType: string(EvArtifact), Payload: json.RawMessage(`{"path":"out/ok.pdf"}`)},
		{AgentSessionID: "s2", EvType: string(EvArtifact), Payload: json.RawMessage(`{"path":"out/cross-session.pdf"}`)},
		{AgentSessionID: "s1", EvType: string(EvArtifact), Payload: json.RawMessage(`{"path":"../escape"}`)},
		{AgentSessionID: "s1", EvType: string(EvUserMessage), Payload: legacyFrame},
		{AgentSessionID: "s2", EvType: string(EvUserMessage), Payload: crossFrame},
	}
	archivePaths := map[string]struct{}{"uploads/" + archiveName: {}}
	allowed := adminWorkspaceAllowlist(session, attachments, events, archivePaths)
	for _, want := range []string{"uploads/ok.csv", "out/ok.pdf", "uploads/" + legacyName, "uploads/" + archiveName} {
		if _, ok := allowed[want]; !ok {
			t.Errorf("allowed missing %q: %#v", want, allowed)
		}
	}
	if len(allowed) != 4 {
		t.Fatalf("cross-session/user/feature paths leaked into allowlist: %#v", allowed)
	}
}

func TestAdminArchiveMarkersRequireCurrentSessionAbsoluteUUIDPath(t *testing.T) {
	sid := "archive-sid"
	root := agentSessionWorkdirRoot() + "/" + sid + "/uploads/"
	good := "11111111-2222-3333-4444-555555555555-paper.pdf"
	other := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-other.pdf"
	messages := []agent.SessionMessage{
		adminTestMessage("user", `@"`+root+good+`" 请分析`),
		adminTestMessage("user", `@"uploads/`+good+`" 用户手写相对 marker`),
		adminTestMessage("user", `@"`+root+`plain-name.pdf" 没有 UUID`),
		adminTestMessage("user", `@"`+agentSessionWorkdirRoot()+`/other/uploads/`+other+`" 跨会话`),
		adminTestMessage("assistant", `@"`+root+other+`" assistant 内容不授权`),
	}
	paths := adminArchiveMarkerPaths(sid, messages)
	if len(paths) != 1 {
		t.Fatalf("archive marker allowlist=%#v, want one exact current-session path", paths)
	}
	if _, ok := paths["uploads/"+good]; !ok {
		t.Fatalf("valid archived UUID marker missing: %#v", paths)
	}
}

func TestAdminArtifactOwnershipRequiresFullSessionIdentity(t *testing.T) {
	session := &SessionRow{AgentSessionID: "s1", UserID: 9, FeatureKey: "sci_draw"}
	base := agentartifact.Artifact{SessionID: "s1", OwnerKind: "user", OwnerID: 9, FeatureKey: "sci_draw"}
	if !adminArtifactBelongsToSession(&base, session) {
		t.Fatal("exact artifact ownership should pass")
	}
	mutations := []agentartifact.Artifact{base, base, base, base}
	mutations[0].SessionID = "s2"
	mutations[1].OwnerID = 10
	mutations[2].OwnerKind = "project"
	mutations[3].FeatureKey = "claw"
	for i := range mutations {
		if adminArtifactBelongsToSession(&mutations[i], session) {
			t.Errorf("cross identity artifact[%d] accepted: %#v", i, mutations[i])
		}
	}
}
