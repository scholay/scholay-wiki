// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// fork(原 cc-haha agent)退役归档(P6)。
//
// 背景:切流前的老会话 transcript 只在 fork 的 jsonl 里;fork 容器删除前,必须把这些历史
// 一次性归档进 MySQL(agent_session_archive),否则老对话续聊/历史/后台查看全空。归档用 fork
// **自己的** GetSessionMessages(它本就把 jsonl 折叠成 daemon-flat SessionMessage[]),所以无需在
// Go 里重写 cc-haha jsonl 解析(脆)。归档幂等(已归档跳过);post-cutover 会话 fork 无记录→自然跳过。
//
// 归档后,所有「journal 空 → 回退」的读路径(readHistory/seedHistory/admin/记忆抽取)改读本表
// (readArchive),fork 即可彻底删除。

package agentbridge

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"scholar-backend/internal/agent"
)

// ArchiveFromFork 遍历全部 agent_sessions,把 fork 仍持有的老 transcript 归档进 agent_session_archive。
// 必须在「b.client 仍指向 fork」时调用(collapse 到 executor 前)。幂等、best-effort。
func (b *Bridge) ArchiveFromFork(ctx context.Context, forkClient agent.Executor) {
	if forkClient == nil || b.repo == nil {
		return
	}
	rows, err := b.repo.AllSessionRows()
	if err != nil {
		slog.Error("archive: list sessions failed", "err", err)
		return
	}

	// 先一次性 backfill 标题(fork ListSessions 的 jsonl title → DB,first-wins),
	// 使 fork 删除后 ListSessions 不再需要 fork backfill。
	if resp, lerr := forkClient.ListSessions(ctx, nil); lerr == nil && resp != nil {
		for i := range resp.Sessions {
			s := resp.Sessions[i]
			if s.Title != "" {
				_ = b.repo.SetTitleIfEmpty(s.ID, s.Title)
			}
		}
	}

	var archived, skipped, empty int
	for i := range rows {
		sid := rows[i].AgentSessionID
		if sid == "" || b.repo.HasArchive(sid) {
			skipped++
			continue
		}
		mctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		resp, gerr := forkClient.GetSessionMessages(mctx, sid, 0)
		cancel()
		if gerr != nil || resp == nil || len(resp.Messages) == 0 {
			empty++ // post-cutover(fork 无记录)或空会话 → 跳过
			continue
		}
		blob, merr := json.Marshal(resp.Messages)
		if merr != nil {
			continue
		}
		tt := 0
		if resp.TotalTurns != nil {
			tt = *resp.TotalTurns
		}
		ar := &ArchiveRow{
			AgentSessionID: sid,
			FeatureKey:     rows[i].FeatureKey,
			Title:          rows[i].Title,
			TotalTurns:     tt,
			MessageCount:   len(resp.Messages),
			MessagesJSON:   string(blob),
			Source:         "fork_jsonl",
		}
		if uerr := b.repo.UpsertArchive(ar); uerr != nil {
			slog.Warn("archive: upsert failed", "session_id", sid, "err", uerr)
			continue
		}
		archived++
	}
	slog.Info("archive: fork transcript archive complete",
		"archived", archived, "already_or_empty_id", skipped, "no_fork_record", empty, "total", len(rows))
}

// readArchive 从 agent_session_archive 读回老会话历史(fork 退役后的回退源,取代直接读 fork)。
// 无归档 → (nil,false)。
func (b *Bridge) readArchive(sessionID string) (*SessionMessagesResult, bool) {
	if b.repo == nil || sessionID == "" {
		return nil, false
	}
	ar, err := b.repo.GetArchive(sessionID)
	if err != nil || ar == nil || ar.MessagesJSON == "" {
		return nil, false
	}
	var msgs []agent.SessionMessage
	if json.Unmarshal([]byte(ar.MessagesJSON), &msgs) != nil || len(msgs) == 0 {
		return nil, false
	}
	return &SessionMessagesResult{
		SessionID:  sessionID,
		Messages:   msgs,
		TotalTurns: ar.TotalTurns,
		HasMore:    false,
	}, true
}
