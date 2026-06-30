// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// fork(原 cc-haha agent)退役 —— **从 jsonl 直读归档**(无需 fork 容器在场)。
//
// 生产用:fork 已删,但老会话历史还在磁盘的 cc-haha jsonl(./data/agent/projects/<slug>/<sid>.jsonl)。
// 部署新版后,backend 开机把这些 jsonl 折叠进 agent_session_archive(MinIO+DB 之外的纯 DB 归档),
// 此后所有「journal 空 → 回退」读路径(readHistory/seedHistory/admin/记忆抽取)读它 → 老对话不丢。
//
// **形状一致性**:不手写 jsonl→message 折叠(易和 daemon/journal 形状漂移),而是把 jsonl 的 content
// block 合成与 FoldToMessages 同源的 Event 流,再调 FoldToMessages —— 产出与 journal 路径**逐块一致**,
// 前端 replay 已能处理(新会话就走这形状)。幂等:已归档 / 已有 journal turn 的会话跳过。

package agentbridge

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// jsonlLine —— cc-haha 转录 jsonl 的一行(只取折叠需要的字段)。
type jsonlLine struct {
	Type        string          `json:"type"` // user | assistant | ai-title | session-meta | ...
	UUID        string          `json:"uuid"`
	Message     json.RawMessage `json:"message"`
	IsSidechain bool            `json:"isSidechain"`
	IsMeta      bool            `json:"isMeta"` // 系统提醒 / caveat 等合成消息(fork transcript 排除,我们也排除)
}

type jsonlMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"` // 数组(block[])或字符串
}

type jsonlBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Thinking  string          `json:"thinking"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Input     json.RawMessage `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
	IsError   *bool           `json:"is_error"`
}

// ArchiveFromJsonl 遍历 agent_sessions,把磁盘上 fork jsonl 仍持有的老会话折叠归档进 agent_session_archive。
// root = jsonl 根目录(含 projects/<slug>/<sid>.jsonl)。幂等、best-effort。
func (b *Bridge) ArchiveFromJsonl(ctx context.Context, root string) {
	if b.repo == nil || b.log == nil || root == "" {
		return
	}
	if _, err := os.Stat(root); err != nil {
		slog.Info("archive(jsonl): root not present, skip", "root", root)
		return
	}
	rows, err := b.repo.AllSessionRows()
	if err != nil {
		slog.Error("archive(jsonl): list sessions failed", "err", err)
		return
	}
	var archived, skipped, missing int
	for i := range rows {
		if ctx.Err() != nil {
			break
		}
		sid := rows[i].AgentSessionID
		if sid == "" || b.repo.HasArchive(sid) {
			skipped++
			continue
		}
		// 已有 journal turn(切流后会话)→ journal 权威,不归档。
		if _, total, _, jerr := b.log.ReadRecentTurns(ctx, sid, 1); jerr == nil && total > 0 {
			skipped++
			continue
		}
		path := findJsonl(root, sid)
		if path == "" {
			missing++
			continue
		}
		evs, firstUser := parseJsonlToEvents(path)
		if len(evs) == 0 {
			missing++
			continue
		}
		msgs := b.log.FoldToMessages(evs)
		if len(msgs) == 0 {
			missing++
			continue
		}
		blob, merr := json.Marshal(msgs)
		if merr != nil {
			continue
		}
		userTurns := 0
		for _, m := range msgs {
			if m.Type == "user" {
				userTurns++
			}
		}
		title := rows[i].Title
		if title == "" {
			title = deriveTitle(firstUser)
		}
		if uerr := b.repo.UpsertArchive(&ArchiveRow{
			AgentSessionID: sid,
			FeatureKey:     rows[i].FeatureKey,
			Title:          title,
			TotalTurns:     userTurns,
			MessageCount:   len(msgs),
			MessagesJSON:   string(blob),
			Source:         "fork_jsonl",
		}); uerr != nil {
			slog.Warn("archive(jsonl): upsert failed", "session_id", sid, "err", uerr)
			continue
		}
		// 标题后端拥有(migration 0050):老会话 DB title 空 → 用首条真实用户消息派生,免显示「新对话」。
		if rows[i].Title == "" && title != "" {
			_ = b.repo.SetTitleIfEmpty(sid, title)
		}
		archived++
	}
	slog.Info("archive(jsonl): complete", "archived", archived, "skipped", skipped, "no_jsonl_or_empty", missing, "total", len(rows))
}

// findJsonl 在 root/projects/*/<sid>.jsonl 找该会话的转录文件,取第一个匹配。
func findJsonl(root, sid string) string {
	matches, _ := filepath.Glob(filepath.Join(root, "projects", "*", sid+".jsonl"))
	if len(matches) > 0 {
		return matches[0]
	}
	return ""
}

// parseJsonlToEvents 把一条 jsonl 转录折成与 FoldToMessages 同源的 Event 流 + 返回首条真实用户文本(派生标题用)。
// 跳过 sidechain(子 agent 旁路,非主对话)。
func parseJsonlToEvents(path string) (evs []Event, firstUserText string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, ""
	}
	for _, raw := range strings.Split(string(data), "\n") {
		raw = strings.TrimSpace(raw)
		if raw == "" || raw[0] != '{' {
			continue
		}
		var ln jsonlLine
		if json.Unmarshal([]byte(raw), &ln) != nil {
			continue
		}
		if ln.IsSidechain || ln.IsMeta || (ln.Type != "user" && ln.Type != "assistant") {
			continue
		}
		var m jsonlMessage
		if len(ln.Message) == 0 || json.Unmarshal(ln.Message, &m) != nil {
			continue
		}
		blocks := parseContentBlocks(m.Content)
		if len(blocks) == 0 {
			continue
		}
		if ln.Type == "user" {
			var userText strings.Builder
			for _, blk := range blocks {
				switch blk.Type {
				case "text", "":
					userText.WriteString(blk.Text)
				case "tool_result":
					if userText.Len() > 0 {
						evs = append(evs, mkEvent(EvUserMessage, map[string]any{"content": userText.String()}))
						userText.Reset()
					}
					evs = append(evs, mkEvent(EvToolResult, map[string]any{
						"tool_use_id": blk.ToolUseID, "content": optRaw(blk.Content), "is_error": blk.IsError,
					}))
				}
			}
			if userText.Len() > 0 {
				txt := userText.String()
				evs = append(evs, mkEvent(EvUserMessage, map[string]any{"content": txt}))
				if firstUserText == "" && !isInjectedPrompt(txt) {
					firstUserText = txt
				}
			}
		} else { // assistant
			for _, blk := range blocks {
				switch blk.Type {
				case "thinking":
					if blk.Thinking != "" {
						evs = append(evs, mkEvent(EvThinking, map[string]any{"text": blk.Thinking}))
					}
				case "text":
					if blk.Text != "" {
						evs = append(evs, mkEvent(EvContentDelta, map[string]any{"text": blk.Text}))
					}
				case "tool_use":
					evs = append(evs, mkEvent(EvToolUse, map[string]any{
						"id": blk.ID, "name": blk.Name, "input": optRaw(blk.Input),
					}))
				}
			}
		}
	}
	return evs, firstUserText
}

// parseContentBlocks 解析 message.content:数组(block[])原样;字符串退化成单 text block。
func parseContentBlocks(raw json.RawMessage) []jsonlBlock {
	if len(raw) == 0 {
		return nil
	}
	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "[") {
		var blocks []jsonlBlock
		if json.Unmarshal(raw, &blocks) == nil {
			return blocks
		}
		return nil
	}
	var s string
	if json.Unmarshal(raw, &s) == nil && s != "" {
		return []jsonlBlock{{Type: "text", Text: s}}
	}
	return nil
}

func mkEvent(t EvType, payload map[string]any) Event {
	b, _ := json.Marshal(payload)
	return Event{EvType: t, Payload: b}
}

// optRaw: nil RawMessage 不进 payload(让 FoldToMessages 的 len(content)>0 判定正确)。
func optRaw(r json.RawMessage) json.RawMessage {
	if len(r) == 0 {
		return nil
	}
	return r
}

// isInjectedPrompt 判断是否首条注入的系统前缀(派生标题时跳过)。
func isInjectedPrompt(s string) bool {
	t := strings.TrimSpace(s)
	return strings.HasPrefix(t, "[AGENT BRIDGE") || strings.HasPrefix(t, "[系统")
}

// deriveTitle 从首条真实用户消息派生一个短标题(老会话 DB 无标题时兜底,免显示「新对话」)。
func deriveTitle(s string) string {
	t := strings.TrimSpace(s)
	if t == "" {
		return ""
	}
	// 取首行、去多余空白,截断到 ~24 字。
	if i := strings.IndexByte(t, '\n'); i >= 0 {
		t = t[:i]
	}
	t = strings.TrimSpace(t)
	r := []rune(t)
	if len(r) > 24 {
		return string(r[:24])
	}
	return t
}
