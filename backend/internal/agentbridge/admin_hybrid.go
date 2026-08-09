package agentbridge

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"scholar-backend/internal/agent"
)

// adminReadArchiveRaw 是管理端的严格归档读取。通用 readArchive 历史上为了
// live 回退会把 DB/解码错误当“无归档”；审计界面不能因此静默丢历史。
// 这一层不改 content，供 /file 从存量绝对路径 marker 建精确白名单。
func (b *Bridge) adminReadArchiveRaw(sessionID string) ([]agent.SessionMessage, error) {
	if b == nil || b.repo == nil || sessionID == "" {
		return nil, nil
	}
	row, err := b.repo.GetArchive(sessionID)
	if err != nil {
		return nil, err
	}
	if row == nil || row.MessagesJSON == "" {
		return nil, nil
	}
	var messages []agent.SessionMessage
	if err := json.Unmarshal([]byte(row.MessagesJSON), &messages); err != nil {
		return nil, fmt.Errorf("decode session archive: %w", err)
	}
	return messages, nil
}

func (b *Bridge) adminReadArchive(sessionID string) ([]agent.SessionMessage, error) {
	messages, err := b.adminReadArchiveRaw(sessionID)
	if err != nil || len(messages) == 0 {
		return messages, err
	}
	stripInjectionFromMessages(messages)
	adminNormalizeUserMessagePaths(messages, sessionID)
	return messages, nil
}

// splitAdminMessageTurns 按真实 user entry 切轮。user 前若有遗留元数据，并入第一轮；
// 整段没有 user 时仍保留为一个合成组，避免迁移脏数据被静默丢弃。
func splitAdminMessageTurns(messages []agent.SessionMessage) [][]agent.SessionMessage {
	if len(messages) == 0 {
		return nil
	}
	turns := make([][]agent.SessionMessage, 0, 16)
	start := 0
	seenUser := false
	for i := range messages {
		if messages[i].Type != "user" {
			continue
		}
		if seenUser {
			turns = append(turns, messages[start:i])
			start = i
		} else {
			seenUser = true
			// 把 user 前的遗留 entry 与第一轮一起保留。
		}
	}
	if !seenUser {
		return [][]agent.SessionMessage{messages}
	}
	turns = append(turns, messages[start:])
	return turns
}

// adminTurnFingerprint 只用对话语义字段做 archive/journal 边界去重。ID、时间、
// model 在两份介质中的可用性不一致，不参与指纹；JSON content 先规范化。
func adminTurnFingerprint(messages []agent.SessionMessage, userText string) string {
	h := sha256.New()
	if len(messages) == 0 && userText != "" {
		_, _ = h.Write([]byte("user\x00" + userText + "\x00"))
	}
	for i := range messages {
		_, _ = h.Write([]byte(messages[i].Type))
		_, _ = h.Write([]byte{0})
		// daemon/archive 老数据有 content="text"，journal fold 为
		// content=[{type:"text",text:"..."}]。两者语义相同，指纹必须归一。
		var direct string
		if json.Unmarshal(messages[i].Content, &direct) == nil {
			canonical, _ := json.Marshal([]map[string]string{{"type": "text", "text": direct}})
			_, _ = h.Write(canonical)
			if messages[i].Interrupted {
				_, _ = h.Write([]byte("\x00interrupted"))
			}
			_, _ = h.Write([]byte{0})
			continue
		}
		var value any
		if json.Unmarshal(messages[i].Content, &value) == nil {
			if canonical, err := json.Marshal(value); err == nil {
				_, _ = h.Write(canonical)
			} else {
				_, _ = h.Write(messages[i].Content)
			}
		} else {
			_, _ = h.Write(messages[i].Content)
		}
		if messages[i].Interrupted {
			_, _ = h.Write([]byte("\x00interrupted"))
		}
		_, _ = h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func adminHybridOverlap(archiveTurns [][]agent.SessionMessage, journalTurns []AdminTurnEnvelope) int {
	max := len(archiveTurns)
	if len(journalTurns) < max {
		max = len(journalTurns)
	}
	for n := max; n > 0; n-- {
		matched := true
		for i := 0; i < n; i++ {
			left := adminTurnFingerprint(archiveTurns[len(archiveTurns)-n+i], "")
			right := adminTurnFingerprint(journalTurns[i].Messages, journalTurns[i].UserText)
			if left != right {
				matched = false
				break
			}
		}
		if matched {
			return n
		}
	}
	return 0
}

type adminHybridEntry struct {
	archive []agent.SessionMessage
	journal *AdminTurnEnvelope
}

// buildAdminHybridTranscript 合并“archive 旧段 + journal 新段”。重叠边界保留
// journal 版（它有权威模型/时间/用量）。CursorSeq 在 hybrid 中是合并后的
// 1-based 不透明序号；before_seq 始终表示“取该序号之前的更早轮”。
func buildAdminHybridTranscript(
	archiveMessages []agent.SessionMessage,
	journalTurns []AdminTurnEnvelope,
	limit int,
	beforeSeq *uint,
	structured bool,
) AdminSessionTranscriptResponse {
	archiveTurns := splitAdminMessageTurns(archiveMessages)
	overlap := adminHybridOverlap(archiveTurns, journalTurns)
	archiveTurns = archiveTurns[:len(archiveTurns)-overlap]

	entries := make([]adminHybridEntry, 0, len(archiveTurns)+len(journalTurns))
	for i := range archiveTurns {
		entries = append(entries, adminHybridEntry{archive: archiveTurns[i]})
	}
	for i := range journalTurns {
		turn := journalTurns[i]
		entries = append(entries, adminHybridEntry{journal: &turn})
	}

	total := len(entries)
	end := total
	if beforeSeq != nil {
		if *beforeSeq <= 1 {
			end = 0
		} else if candidate := int(*beforeSeq - 1); candidate < end {
			end = candidate
		}
	}
	start := 0
	if limit > 0 && end > limit {
		start = end - limit
	}
	selected := entries[start:end]
	hasMore := start > 0
	var next *uint
	if hasMore && len(selected) > 0 {
		value := uint(start + 1) // selected 最早一轮的 1-based cursor。
		next = &value
	}

	turns := make([]AdminTurnEnvelope, 0, len(selected))
	flat := make([]agent.SessionMessage, 0)
	for i := range selected {
		entry := selected[i]
		cursor := uint(start + i + 1)
		if entry.journal != nil {
			turn := *entry.journal
			turn.CursorSeq = cursor
			turns = append(turns, turn)
			if !structured {
				flat = append(flat, turn.Messages...)
			}
			continue
		}
		flat = append(flat, entry.archive...)
	}
	if flat == nil && !structured {
		flat = []agent.SessionMessage{}
	}
	return AdminSessionTranscriptResponse{
		Messages: flat, Turns: turns, TotalTurns: total, HasMore: hasMore,
		NextBeforeSeq: next, Source: "hybrid",
	}
}
