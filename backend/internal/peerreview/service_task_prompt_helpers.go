// ============================================================================
// Scholay学术 V1.0
// 审稿报告生成 - 6 个 variant 共享的上下文构建与重试循环
// ============================================================================

package peerreview

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
)

// maxReviewManuscriptLength 文字模式下主稿件字符上限（与保存草稿一致）
const maxReviewManuscriptLength = 50000

// reviewMaxRetries 审稿 JSON 生成重试次数
const reviewMaxRetries = 3

// reviewPromptBase 是所有 variant 共用的提示词片段
type reviewPromptBase struct {
	RefsStr           string
	MetaJSON          string
	FieldState        string
	ClosestPapersInfo string
	GapsInfo          string
	TruncatedText     string // 未拼附件
}

// buildReviewPromptBase 生成 variant 共享的片段（参考文献、元信息、文献前沿、Gap、主稿件截断）
func (s *Service) buildReviewPromptBase(
	manuscriptText string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
) *reviewPromptBase {
	metaJSON, _ := json.Marshal(meta)

	closestPapersInfo := ""
	if len(summary.ClosestPapers) > 0 {
		var sb strings.Builder
		for i, p := range summary.ClosestPapers {
			sb.WriteString(fmt.Sprintf("%d. %s (%d) - 相似原因: %s\n", i+1, p.Title, p.Year, p.Reason))
		}
		closestPapersInfo = sb.String()
	}

	gapsInfo := ""
	if len(summary.TypicalGaps) > 0 {
		gapsInfo = "- " + strings.Join(summary.TypicalGaps, "\n- ")
	}

	truncatedText := manuscriptText
	if len(truncatedText) > maxReviewManuscriptLength {
		truncatedText = truncatedText[:maxReviewManuscriptLength]
	}

	return &reviewPromptBase{
		RefsStr:           s.formatRefsForPrompt(refs),
		MetaJSON:          string(metaJSON),
		FieldState:        summary.FieldState,
		ClosestPapersInfo: closestPapersInfo,
		GapsInfo:          gapsInfo,
		TruncatedText:     truncatedText,
	}
}

// formatAttachmentTexts 把文本模式附件拼成一段提示词；header 例如 "【附件内容】" 或 "【文本附件内容】"
func formatAttachmentTexts(attachmentTexts []map[string]string, header string) string {
	if len(attachmentTexts) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\n\n")
	sb.WriteString(header)
	sb.WriteString("\n")
	for i, att := range attachmentTexts {
		sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
		sb.WriteString(att["content"])
		sb.WriteString("\n")
	}
	return sb.String()
}

// aiCaller 在一次 attempt 中调用 AI 并返回文本内容
// 返回 ("", nil) 表示 AI 返回空 choices — 触发重试分支
type aiCaller func(ctx context.Context) (string, error)

// runReviewRetryLoop 执行统一的 3 次重试、JSON 合法性校验、兜底写入逻辑
// progressMsg 例 "正在生成审稿报告..."；logAttrs 是额外的 slog 上下文（如 reviewer_index / reviewer name）
// 传入的 ctx 会传递给 AI 调用，cancel/timeout 会立即终止重试循环
func (s *Service) runReviewRetryLoop(
	ctx context.Context,
	taskID uint,
	progressMsg string,
	logAttrs []any,
	writer *strings.Builder,
	caller aiCaller,
) error {
	baseAttrs := append([]any{"task_id", taskID}, logAttrs...)

	for attempt := 1; attempt <= reviewMaxRetries; attempt++ {
		// 重试之前先检查 ctx，避免在 cancel 后还做无用功
		if err := ctx.Err(); err != nil {
			return err
		}

		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, progressMsg)

		attrs := append([]any{}, baseAttrs...)
		attrs = append(attrs, "attempt", attempt, "max_retries", reviewMaxRetries)

		slog.Info("calling AI for review", attrs...)

		content, err := caller(ctx)
		if err != nil {
			// ctx 被取消/超时 时直接返回，不再重试
			if ctx.Err() != nil {
				return ctx.Err()
			}
			slog.Error("AI review call failed", append(attrs, "err", err)...)
			if attempt == reviewMaxRetries {
				return err
			}
			continue
		}

		if content == "" {
			slog.Warn("AI returned empty content", attrs...)
			if attempt == reviewMaxRetries {
				return fmt.Errorf("no response from AI after %d attempts", reviewMaxRetries)
			}
			continue
		}

		slog.Debug("AI review response received", append(attrs, "content_length", len(content))...)

		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			slog.Info("review complete", append(attrs, "total_length", writer.Len())...)
			return nil
		}

		slog.Warn("invalid JSON response, will retry", attrs...)

		if attempt == reviewMaxRetries {
			// 最后一次即便 JSON 不完整也保留，交给解析侧兜底
			writer.WriteString(content)
			slog.Warn("using incomplete JSON after max attempts", attrs...)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", reviewMaxRetries)
}
