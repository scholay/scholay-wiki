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
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/agent"
)

// ── journal==jsonl 持续校验 harness(详细设计 §7.4)。──
//
// 目的:在把读路径切到事件日志(P1 的 AGENT_JOURNAL_READ)之前 / 期间,持续比对「折叠日志」与
// 「daemon 真源(jsonl)」是否一致,让运维能在用户见漂移前判断日志是否可信。**纯只读、只 slog、
// 绝不改 live**。AGENT_JOURNAL_VALIDATE=on 才由 bootstrap 启;贯穿 P1/P2 长跑作 online 安全网。
//
// 比对维度:① 用户轮数(§3.1.1 轮边界硬约束的关键 parity)② assistant 文本(归一化空白后比等)
// ③ tool_use 名序列(修 HIGH-3:原 validator 只数 user+text,对 tool drop 结构盲;同维度也是
// P3 shadow-execute 比 fork-vs-executor 的 go/no-go 用,一份工作服务 P1-read 与 P3-shadow 双闸)。
// 不比用户文本(日志存注入前原文、daemon 存注入后,差异是预期的,不算不符)。

var journalValidateMismatch int64 // 进程计数:不符次数(P1 读切前判「日志当下可信否」)

// JournalValidateMismatchCount 暴露累计不符次数(运维 / 集成测试读)。
func JournalValidateMismatchCount() int64 { return atomic.LoadInt64(&journalValidateMismatch) }

type JournalValidator struct {
	db     *gorm.DB
	log    EventLog
	client agent.Executor
	limit  int // 比较的最近轮数窗口
}

func NewJournalValidator(db *gorm.DB, log EventLog, client agent.Executor) *JournalValidator {
	return &JournalValidator{db: db, log: log, client: client, limit: 20}
}

// Run 后台持续校验。60s 扫最近完成的 turn(限批),按 session 去重比对。
func (v *JournalValidator) Run(ctx context.Context) {
	if v.log == nil || v.client == nil {
		return
	}
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	since := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			since = v.scanOnce(ctx, since)
		}
	}
}

func (v *JournalValidator) scanOnce(ctx context.Context, since time.Time) time.Time {
	var turns []Turn
	if err := v.db.WithContext(ctx).
		Where("status = ? AND completed_at IS NOT NULL AND completed_at > ?", "complete", since).
		Order("completed_at ASC").Limit(200).Find(&turns).Error; err != nil {
		slog.Warn("journal_validate: scan failed", "err", err)
		return since
	}
	next := since
	seen := make(map[string]struct{}, len(turns))
	for _, t := range turns {
		if t.CompletedAt != nil && t.CompletedAt.After(next) {
			next = *t.CompletedAt
		}
		if _, ok := seen[t.AgentSessionID]; ok {
			continue
		}
		seen[t.AgentSessionID] = struct{}{}
		v.compareSession(ctx, t.AgentSessionID)
	}
	return next
}

func (v *JournalValidator) compareSession(ctx context.Context, sid string) {
	evs, _, _, jerr := v.log.ReadRecentTurns(ctx, sid, v.limit)
	if jerr != nil {
		return
	}
	jMsgs := v.log.FoldToMessages(evs)
	dResp, derr := v.client.GetSessionMessages(ctx, sid, v.limit)
	if derr != nil || dResp == nil {
		return // daemon 读不到(会话 GC / 瞬时 404)→ 不算不符
	}
	if ju, du := countUserMsgs(jMsgs), countUserMsgs(dResp.Messages); ju != du {
		atomic.AddInt64(&journalValidateMismatch, 1)
		slog.Error("journal_validate_mismatch", "journal_validate", 1, "kind", "turn_count",
			"session_id", sid, "journal_users", ju, "daemon_users", du)
		return
	}
	jText, dText := normalizeWS(assistantText(jMsgs)), normalizeWS(assistantText(dResp.Messages))
	if jText != dText {
		atomic.AddInt64(&journalValidateMismatch, 1)
		slog.Error("journal_validate_mismatch", "journal_validate", 1, "kind", "assistant_text",
			"session_id", sid, "journal_len", len(jText), "daemon_len", len(dText))
	}
	// W3 P1-B DSML 事后雷达:对双侧 assistant 全文扫协议标记子串。纯审计告警(本层铁律只读,
	// 拦截由 agent 侧 leakGuard 源头过滤负责),用于量化源头防线的漏网率。
	scanDSMLMarkers(sid, "journal", jText)
	scanDSMLMarkers(sid, "daemon", dText)
	// W2 P1-a 诚实性事后雷达:assistant 全文抽 DOI,与 journal 内全部 tool_result/user 证据
	// 文本比对 —— 未命中 = 疑似凭训练记忆编造的引用。只告警不拦截(本层铁律只读;live 纠偏由
	// agent 侧 honesty guard 负责,此处量化其漏网率)。
	scanUnverifiedDOIs(sid, jMsgs, jText)
	if jt, dt := toolNameSeq(jMsgs), toolNameSeq(dResp.Messages); !equalStrSeq(jt, dt) {
		atomic.AddInt64(&journalValidateMismatch, 1)
		slog.Error("journal_validate_mismatch", "journal_validate", 1, "kind", "tool_sequence",
			"session_id", sid, "journal_tools", strings.Join(jt, ","), "daemon_tools", strings.Join(dt, ","))
	}
}

// toolNameSeq 抽出按序的 tool_use 工具名序列(修 HIGH-3)。daemon 与 fold 都把 tool_use 摊成
// Type=="tool_use" 的独立 message,content=[{type:"tool_use",id,name,input}]。
func toolNameSeq(msgs []agent.SessionMessage) []string {
	var seq []string
	for _, m := range msgs {
		if m.Type != "tool_use" {
			continue
		}
		var blocks []struct {
			Type string `json:"type"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(m.Content, &blocks); err != nil {
			continue
		}
		for _, b := range blocks {
			if b.Type == "tool_use" {
				seq = append(seq, b.Name)
			}
		}
	}
	return seq
}

func equalStrSeq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// correctiveUserPrefix 执行器自注入的「系统纠偏」user 消息统一前缀(冻结契约 #4,与 agent 侧
// 常量逐字一致,两侧注释互相锚定)。诚实性核验 / 语言纠偏 / ASCII 纠偏共用此前缀。
// 这些消息只进 executor 侧 transcript、不经 hub(不产生 EvUserMessage)→ parity 校验必须豁免,
// 同时保证用户侧历史干净(前端历史读 journal,纠偏指令永不显示给用户)。
const correctiveUserPrefix = "【系统纠偏】"

func countUserMsgs(msgs []agent.SessionMessage) int {
	n := 0
	for _, m := range msgs {
		if m.Type == "user" && !isSyntheticUserMsg(m) {
			n++
		}
	}
	return n
}

// isSyntheticUserMsg 判定执行器自注入的合成 user 消息(冻结契约 #4 的两类,journal 无对应事件):
//  1. 纠偏指令 —— 首个 text 块以 correctiveUserPrefix 开头;
//  2. max_tokens 撞顶恢复 —— 仅含 tool_result 块、无任何 text 块的 user 消息。
//
// journal 折叠侧永远不会出现这两类(它们不经 hub),豁免逻辑对双侧调用是安全的 no-op / 收敛。
func isSyntheticUserMsg(m agent.SessionMessage) bool {
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(m.Content, &blocks); err != nil || len(blocks) == 0 {
		return false
	}
	hasText := false
	for _, b := range blocks {
		if b.Type == "text" {
			hasText = true
			if strings.HasPrefix(strings.TrimSpace(b.Text), correctiveUserPrefix) {
				return true // 纠偏指令
			}
		}
	}
	return !hasText // 全部是 tool_result 等非 text 块(max_tokens 恢复注入)→ 豁免
}

// dsmlMarkers DSML 协议泄漏标记(W3 P1-B 事后雷达;与 agent 侧 leakGuard MARKERS 对齐)。
// 只做子串扫描告警,不拦截 —— live 拦截由 agent 侧流式 leakGuard 负责,此处量化漏网。
// 与 agent/src/turn/leakGuard.ts MARKERS 逐条对齐(共 10 条);缺项会让雷达低估漏网率(审计 [20])。
var dsmlMarkers = []string{
	"<｜DSML｜", "<｜｜DSML｜｜", "<|DSML|", "<|｜DSML｜|",
	"<｜tool▁calls▁begin｜", "<｜tool▁call▁begin｜", "<｜tool_calls_begin｜",
	"<|tool▁calls▁begin|", "<|tool▁call▁begin|", "<|tool_calls_begin|",
}

func scanDSMLMarkers(sid, side, text string) {
	for _, mk := range dsmlMarkers {
		if strings.Contains(text, mk) {
			atomic.AddInt64(&journalValidateMismatch, 1)
			slog.Error("journal_validate: dsml marker found in transcript",
				"journal_validate", 1, "kind", "dsml_marker", "session_id", sid, "side", side, "marker", mk)
			return
		}
	}
}

// ── W2 P1-a 诚实性事后雷达(DOI)──

// doiRe 与 agent 侧 verifyClaims DOI_RE 同款(两侧注释互相锚定,改一处须同步另一处)。
// 字符类须排反引号 ` 与星号 *(markdown 代码跨/加粗包裹的 DOI):二者都是 ASCII,不会被下方
// IndexFunc(r>0x7E) 截断,漏排会把 `10.x/y`` / **10.x/y** 抓成"未验证"污染雷达漏报率(审计 [21])。
var doiRe = regexp.MustCompile("\\b10\\.\\d{4,9}/[^\\s\"'`*<>()\\[\\]{},;]+")

// extractDOIs 抽取文本中的 DOI:尾部标点剥离、lowercase、去重保序。
// DOI 实务为 ASCII;regex 字符类挡不住紧贴的全角标点/CJK(中文回复常见「…03819-2。另见」),
// 故在首个非 ASCII 字符处截断,再剥 ASCII 尾部标点()]}>,; 等已被字符类排除)。
func extractDOIs(text string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, m := range doiRe.FindAllString(text, -1) {
		if i := strings.IndexFunc(m, func(r rune) bool { return r > 0x7E }); i >= 0 {
			m = m[:i]
		}
		d := strings.ToLower(strings.TrimRight(m, ".,;:!?*`"))
		if d == "" || !strings.Contains(d, "/") || strings.HasSuffix(d, "/") {
			continue // 截断后退化(如「10.1038/」)的碎片不算 DOI
		}
		if _, dup := seen[d]; dup {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	return out
}

// journalEvidenceCorpus 证据语料 = journal 内全部 user 消息与 tool_result 的原始 content 字节
// (lowercase)。刻意排除 assistant:旧轮编造的 DOI 不能给后续轮自洗白。
func journalEvidenceCorpus(msgs []agent.SessionMessage) string {
	var b strings.Builder
	for _, m := range msgs {
		if m.Type != "user" && m.Type != "tool_result" {
			continue
		}
		b.Write(m.Content)
		b.WriteByte('\n')
	}
	return strings.ToLower(b.String())
}

// unverifiedDOIs 返回 assistant 文本里未出现在证据语料中的 DOI(纯函数,单测锚点)。
func unverifiedDOIs(asstText, corpus string) []string {
	var out []string
	for _, d := range extractDOIs(asstText) {
		if !strings.Contains(corpus, d) {
			out = append(out, d)
		}
	}
	return out
}

func scanUnverifiedDOIs(sid string, jMsgs []agent.SessionMessage, asstText string) {
	unverified := unverifiedDOIs(asstText, journalEvidenceCorpus(jMsgs))
	if len(unverified) == 0 {
		return
	}
	atomic.AddInt64(&journalValidateMismatch, 1)
	sample := unverified
	if len(sample) > 3 {
		sample = sample[:3]
	}
	slog.Warn("honesty_radar", "journal_validate", 1, "kind", "unverified_doi",
		"session_id", sid, "unverified_count", len(unverified), "sample", strings.Join(sample, " , "))
}

// assistantText 把所有 assistant message 的 text block 拼起来(content[] 里 type==text 的 text)。
func assistantText(msgs []agent.SessionMessage) string {
	var b strings.Builder
	for _, m := range msgs {
		if m.Type != "assistant" {
			continue
		}
		var blocks []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(m.Content, &blocks); err != nil {
			continue
		}
		for _, blk := range blocks {
			if blk.Type == "text" {
				b.WriteString(blk.Text)
			}
		}
	}
	return b.String()
}

func normalizeWS(s string) string { return strings.Join(strings.Fields(s), " ") }
