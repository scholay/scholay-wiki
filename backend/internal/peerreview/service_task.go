// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package peerreview implements the peer review task pipeline.
//
// The task-related Service methods are split across the following files:
//
//   service_task.go          – This file: shared helpers (updateTaskProgress, updateTaskFailed, etc.)
//   service_task_draft.go    – Draft management (GetOrCreateDraft, SaveDraft, SubmitDraft, …)
//   service_task_query.go    – Task querying, listing, progress, file operations
//   service_task_extract.go  – File parsing / text extraction helpers
//   service_task_review.go   – Review orchestration (three-reviewer pipeline, preprocessing, summarize)
//   service_task_prompt.go   – Review generation with prompt templates, JSON parsing/validation

package peerreview

// ========== 共享类型 ==========

// Message 简化的消息类型（内部使用）
type Message struct {
	Role    string
	Content string
}

// FileForAI 用于传递给 AI 的文件信息
type FileForAI struct {
	FileName string
	MimeType string
	Data     string // base64 编码
	Role     string // manuscript 或 attachment
}

// ========== 共享辅助方法 ==========

// updateTaskProgress 更新任务进度
func (s *Service) updateTaskProgress(taskID uint, status string, progress int, stage string) {
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
		"status":         status,
		"progress":       progress,
		"progress_stage": stage,
	})
}

// updateTaskFailed 更新任务失败状态
func (s *Service) updateTaskFailed(taskID uint, errMsg string) {
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
		"status":        TaskStatusFailed,
		"error_message": errMsg,
	})
}

// truncateString 按字符数（而非字节数）截取字符串，避免截断 UTF-8 字符
func truncateString(s string, maxChars int) string {
	runes := []rune(s)
	if len(runes) <= maxChars {
		return s
	}
	return string(runes[:maxChars]) + "..."
}

// getFileByID 根据ID获取文件
func (s *Service) getFileByID(fileID uint, userID uint) (*PeerReviewFile, error) {
	var file PeerReviewFile
	if err := s.db.Where("id = ? AND user_id = ?", fileID, userID).First(&file).Error; err != nil {
		return nil, err
	}
	return &file, nil
}
