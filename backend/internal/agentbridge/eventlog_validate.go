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

func countUserMsgs(msgs []agent.SessionMessage) int {
	n := 0
	for _, m := range msgs {
		if m.Type == "user" {
			n++
		}
	}
	return n
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
