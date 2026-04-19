// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/ai"
)

// ========== 异步任务处理 ==========

// pipelineTimeout 整个三审任务（预处理 + 三审并行 + 汇总）的全局超时
// 单审稿人内部还另设 reviewerTimeout (10min)，预处理另含 SemanticScholar HTTP 超时
const pipelineTimeout = 60 * time.Minute

// 通过 context.Cause 区分"流水线整体超时"与"单审稿人超时"——日志/错误信息能准确反映触发源。
var (
	errPipelineTimeout = errors.New("peerreview: pipeline timeout")
	errReviewerTimeout = errors.New("peerreview: reviewer timeout")
)

// processTaskAsyncWithThreeReviewers 三审并行处理任务
// 内部建立 pipelineTimeout 顶层 ctx，进程关停 / 超时时所有子调用（AI/HTTP）会一同 cancel
func (s *Service) processTaskAsyncWithThreeReviewers(taskID uint) {
	ctx, cancel := context.WithTimeoutCause(context.Background(), pipelineTimeout, errPipelineTimeout)
	defer cancel()

	defer func() {
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("任务处理发生异常: %v", r)
			s.updateTaskFailed(taskID, errMsg)
		}
	}()

	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		slog.Error("failed to find task", "task_id", taskID, "err", err)
		return
	}

	slog.Info("processTaskAsync started", "task_id", taskID, "input_type", task.InputType, "model_level", task.ModelLevel)

	// 更新状态为处理中
	now := time.Now()
	s.updateTaskProgress(taskID, TaskStatusProcessing, 5, "开始处理")
	s.db.Model(&task).Update("started_at", now)

	// 获取三个审稿模型配置
	prModelConfig, _, err := s.accountService.GetPeerReviewModels()
	if err != nil {
		slog.Error("failed to get peer review models", "task_id", taskID, "err", err)
		s.updateTaskFailed(taskID, fmt.Sprintf("获取审稿模型配置失败: %v", err))
		return
	}

	// 构建每个审稿人的模型配置
	reviewerModels := []string{prModelConfig.Model1, prModelConfig.Model2, prModelConfig.Model3}
	slog.Info("using three models for review", "task_id", taskID, "model1", reviewerModels[0], "model2", reviewerModels[1], "model3", reviewerModels[2])

	// 加载关联文件
	s.loadTaskFiles(&task)

	if task.ManuscriptFile != nil {
		slog.Info("manuscript file loaded", "task_id", taskID, "file_name", task.ManuscriptFile.FileName, "process_mode", task.ManuscriptFile.ProcessMode, "file_path", task.ManuscriptFile.FilePath)
	} else {
		slog.Info("no manuscript file, using text mode", "task_id", taskID, "text_length", len(task.ManuscriptText))
	}

	// 1. 预处理阶段（共享）：提取元信息、检索文献 (5%-50%)
	slog.Info("starting preprocessing", "task_id", taskID)
	meta, literatureSummary, refs, err := s.preprocessTask(ctx, &task)
	if err != nil {
		slog.Error("preprocessing failed", "task_id", taskID, "err", err)
		s.updateTaskFailed(taskID, err.Error())
		return
	}
	slog.Info("preprocessing completed", "task_id", taskID, "meta_title", meta.Title, "refs_count", len(refs))

	// 2. 三审并行阶段 (50%-90%)
	s.updateTaskProgress(taskID, TaskStatusProcessing, 50, "三位审稿人并行审稿中...")
	slog.Info("starting parallel review", "task_id", taskID)

	// 设置每个审稿人的超时时间（10分钟）
	const reviewerTimeout = 10 * time.Minute

	var wg sync.WaitGroup
	reviewResults := make([]*strings.Builder, ReviewerCount)
	reviewErrors := make([]error, ReviewerCount) // 记录每个审稿人的错误

	for i := 0; i < ReviewerCount; i++ {
		reviewResults[i] = &strings.Builder{}
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			// 父 ctx 派生带 cause 的子 ctx；context.Cause 可分辨"流水线整体超时"还是"该审稿人单独超时"
			reviewerCtx, cancel := context.WithTimeoutCause(ctx, reviewerTimeout, errReviewerTimeout)
			defer cancel()

			modelConfig := &ReviewerModelConfig{
				BaseURL:   prModelConfig.BaseURL,
				APIKey:    prModelConfig.APIKey,
				ModelName: reviewerModels[idx],
			}

			// 直接同步调用：ctx 透传到 AI HTTP 客户端，超时/取消会立即中断 AI 调用
			// 不再通过 done channel + 子 goroutine 的方式（会导致 goroutine 泄漏）
			s.runSingleReviewWithModel(reviewerCtx, &task, idx+1, meta, literatureSummary, refs, reviewResults[idx], modelConfig)

			// 检查超时/取消（AI 调用已经中断），统一作为该审稿人的失败错误
			if reviewerCtx.Err() != nil {
				cause := context.Cause(reviewerCtx)
				var reason string
				switch {
				case errors.Is(cause, errReviewerTimeout):
					reason = fmt.Sprintf("%s 单人审稿超时（%s）", ReviewerNames[idx+1], reviewerTimeout)
				case errors.Is(cause, errPipelineTimeout):
					reason = fmt.Sprintf("%s 因流水线整体超时（%s）被中断", ReviewerNames[idx+1], pipelineTimeout)
				default:
					reason = fmt.Sprintf("%s 审稿被中断: %v", ReviewerNames[idx+1], cause)
				}
				reviewErrors[idx] = errors.New(reason)
				s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, idx+1).
					Updates(map[string]any{
						"status":        TaskStatusFailed,
						"error_message": reason,
					})
			}
		}(i)
	}

	wg.Wait()
	slog.Info("all reviewers finished", "task_id", taskID)

	// 检查是否有审稿人超时
	timeoutCount := 0
	for idx, err := range reviewErrors {
		if err != nil {
			timeoutCount++
			slog.Error("reviewer timeout/error", "reviewer", idx+1, "task_id", taskID, "err", err)
		}
	}

	// 检查每个审稿人的结果长度
	for idx, result := range reviewResults {
		slog.Info("reviewer result", "reviewer", idx+1, "task_id", taskID, "content_length", result.Len())
	}

	// 如果全部超时，标记任务失败
	if timeoutCount == ReviewerCount {
		slog.Error("all reviewers timeout", "task_id", taskID)
		s.updateTaskFailed(taskID, "所有审稿人均超时，请重试")
		return
	}

	// 3. 汇总阶段 (90%-100%)
	slog.Info("starting summarization", "task_id", taskID)
	s.updateTaskProgress(taskID, TaskStatusProcessing, 90, "汇总审稿结果...")
	s.summarizeReviews(ctx, taskID, reviewResults)

	// 完成
	completedAt := time.Now()
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
		"status":         TaskStatusCompleted,
		"progress":       100,
		"progress_stage": "审稿完成",
		"completed_at":   completedAt,
	})
	slog.Info("task completed", "task_id", taskID)
}

// preprocessTask 预处理任务（提取元信息、检索文献）
// ctx 用于传递给底层 AI 调用，pipeline 取消时会一并中断
func (s *Service) preprocessTask(ctx context.Context, task *PeerReviewTask) (*ManuscriptMeta, *LiteratureSummary, []ReferenceForReviewer, error) {
	modelLevel := task.ModelLevel

	// 1. 提取稿件元信息 (10%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 10, "正在分析稿件结构...")

	var meta *ManuscriptMeta
	var err error

	// 根据处理模式选择不同的处理方式
	// ProcessModeDirect (仅 PDF)：直接传递文件给 AI
	// ProcessModeExtract (Word/RTF/ODT/XML/HTML/TXT 等)：使用上传时提取的文本
	if task.ManuscriptFile != nil && task.ManuscriptFile.ProcessMode == ProcessModeDirect {
		// PDF 文件直传模式：读取文件并传递给AI
		slog.Info("using PDF direct mode for preprocessing", "task_id", task.ID, "file_name", task.ManuscriptFile.FileName)
		fileContent, readErr := os.ReadFile(task.ManuscriptFile.FilePath)
		if readErr != nil {
			return nil, nil, nil, fmt.Errorf("读取文件失败: %w", readErr)
		}
		fileBase64 := base64.StdEncoding.EncodeToString(fileContent)
		mimeType := task.ManuscriptFile.MimeType
		if mimeType == "" {
			mimeType = GetMimeType(task.ManuscriptFile.FileExt)
		}
		meta, err = s.extractBasicInfoFromFile(ctx, fileBase64, task.ManuscriptFile.FileName, mimeType, modelLevel)
	} else {
		// 文本模式：使用上传时提取的文本或用户直接输入的文本
		manuscriptText := task.ManuscriptText
		// 如果有主稿件文件，使用其提取的文本（Word/RTF/ODT/XML/HTML/TXT 在上传时已提取）
		if task.ManuscriptFile != nil && task.ManuscriptFile.ExtractedText != "" {
			manuscriptText = task.ManuscriptFile.ExtractedText
			slog.Info("using extracted text for preprocessing", "task_id", task.ID, "length", len(manuscriptText))
		}
		if len(manuscriptText) < 100 {
			return nil, nil, nil, fmt.Errorf("稿件内容太短，请提供更完整的内容")
		}
		meta, err = s.extractBasicInfo(ctx, manuscriptText, modelLevel)
	}

	if err != nil {
		return nil, nil, nil, fmt.Errorf("稿件分析失败: %w", err)
	}

	metaJSON, _ := json.Marshal(meta)
	s.db.Model(task).Updates(map[string]any{
		"manuscript_meta": string(metaJSON),
		"title":           meta.Title,
	})

	// 2. 构建搜索查询 (15%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 15, "正在构建文献检索策略...")
	searchQueries := s.buildSemanticSearchQueries(meta)

	// 3. 检索文献 + AI筛选 (25%)
	// 新流程：每个查询单独检索50篇 -> 过滤无摘要 -> AI分析筛选 -> 返回高质量论文
	taskID := task.ID
	progressCallback := func(msg string) {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 25, msg)
	}
	rawResults, err := s.callSemanticScholarSearchWithAIFilterNoWriter(ctx, searchQueries, meta, modelLevel, progressCallback)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("文献检索失败: %w", err)
	}

	// 4. 整理文献 (35%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 35, "正在整理文献数据...")
	literatureContext := s.normalizeAndSelectPapers(rawResults)
	ctxJSON, _ := json.Marshal(literatureContext)
	s.db.Model(task).Update("literature_context", string(ctxJSON))

	// 5. 总结文献 (45%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 45, "正在生成文献总结...")
	literatureSummary, err := s.summarizeLiterature(ctx, literatureContext, meta, modelLevel)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("文献总结失败: %w", err)
	}
	summaryJSON, _ := json.Marshal(literatureSummary)
	s.db.Model(task).Update("literature_summary", string(summaryJSON))

	refs := s.buildReferenceList(literatureContext.AllPapers)

	return meta, literatureSummary, refs, nil
}

// runSingleReview 执行单个审稿人的审稿
func (s *Service) runSingleReview(ctx context.Context, task *PeerReviewTask, reviewerIndex int, meta *ManuscriptMeta, summary *LiteratureSummary, refs []ReferenceForReviewer, writer *strings.Builder) {
	slog.Info("runSingleReview started", "task_id", task.ID, "reviewer_index", reviewerIndex)

	// 更新审稿人状态
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]any{"status": TaskStatusProcessing, "progress": 10})

	var err error

	// 收集文本模式附件的内容（Word/RTF/ODT 等格式提取的文本）
	attachmentTexts := s.collectAttachmentTexts(task)
	if len(attachmentTexts) > 0 {
		slog.Debug("collected text attachments", "count", len(attachmentTexts), "task_id", task.ID, "reviewer_index", reviewerIndex)
	}

	// 收集 PDF 附件（无论主稿件是什么模式，PDF 附件都需要以文件形式传递）
	pdfAttachments := s.collectPDFAttachments(task)
	if len(pdfAttachments) > 0 {
		slog.Debug("collected PDF attachments", "count", len(pdfAttachments), "task_id", task.ID, "reviewer_index", reviewerIndex)
	}

	// 根据处理模式选择不同的处理方式
	// ProcessModeDirect (仅 PDF 主稿件)：直接传递文件给 AI（支持视觉内容）
	// ProcessModeExtract (Word/RTF/ODT/XML/HTML/TXT 等)：使用上传时提取的文本
	if task.ManuscriptFile != nil && task.ManuscriptFile.ProcessMode == ProcessModeDirect {
		// PDF 主稿件直传模式：收集主稿件和 PDF 附件
		slog.Info("using PDF direct mode", "task_id", task.ID, "reviewer_index", reviewerIndex, "file_name", task.ManuscriptFile.FileName)
		files := s.collectFilesForAI(task)
		if len(files) == 0 {
			err = fmt.Errorf("无法读取稿件文件")
			slog.Error("failed to collect files", "task_id", task.ID, "reviewer_index", reviewerIndex)
		} else {
			slog.Debug("collected files for AI", "count", len(files), "task_id", task.ID, "reviewer_index", reviewerIndex)
			err = s.generateReviewForTaskWithFile(ctx, files, attachmentTexts,
				meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
		}
	} else {
		// 主稿件是文本模式
		manuscriptText := task.ManuscriptText
		// 如果有主稿件文件，使用其提取的文本（Word/RTF/ODT/XML/HTML/TXT 在上传时已提取）
		if task.ManuscriptFile != nil && task.ManuscriptFile.ExtractedText != "" {
			manuscriptText = task.ManuscriptFile.ExtractedText
		}

		// 如果有 PDF 附件，需要使用混合模式（文本主稿件 + PDF 附件文件）
		if len(pdfAttachments) > 0 {
			slog.Info("using hybrid mode (text + PDF attachments)", "task_id", task.ID, "reviewer_index", reviewerIndex)
			slog.Info("hybrid mode details", "text_length", len(manuscriptText), "pdf_count", len(pdfAttachments), "task_id", task.ID, "reviewer_index", reviewerIndex)
			err = s.generateReviewForTaskHybrid(ctx, manuscriptText, pdfAttachments, attachmentTexts,
				meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
		} else {
			// 纯文本模式
			slog.Info("using text mode", "task_id", task.ID, "reviewer_index", reviewerIndex)
			slog.Debug("text mode details", "text_length", len(manuscriptText), "task_id", task.ID, "reviewer_index", reviewerIndex)
			err = s.generateReviewForTask(ctx, manuscriptText, attachmentTexts, meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
		}
	}

	now := time.Now()
	if err != nil {
		slog.Error("runSingleReview failed", "task_id", task.ID, "reviewer_index", reviewerIndex, "err", err)
		s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
			Updates(map[string]any{
				"status":        TaskStatusFailed,
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return
	}

	slog.Info("runSingleReview completed", "task_id", task.ID, "reviewer_index", reviewerIndex, "content_length", writer.Len())

	// 解析 JSON 响应
	rawContent := writer.String()
	reviewReport, parseErr := parseReviewJSON(rawContent)

	// 提取推荐意见
	var recommendation string
	var dimensionScoresJSON string

	if parseErr == nil && reviewReport != nil {
		// 从结构化数据中提取推荐意见
		recommendation = normalizeRecommendation(reviewReport.OverallAssessment.Recommendation)

		// 从扩展审稿项目中提取评分维度
		dimensionScores := DimensionScores{
			Originality:  0, // 可以根据 novelty_evaluation 进行评分
			Methodology:  0, // 可以根据 technical_soundness 进行评分
			Clarity:      0, // 可以根据 clarity_and_presentation 进行评分
			Significance: 0, // 可以根据 impact_and_significance 进行评分
			Overall:      0,
		}
		scoresBytes, _ := json.Marshal(dimensionScores)
		dimensionScoresJSON = string(scoresBytes)
	} else {
		// JSON 解析失败，使用旧的文本提取方式
		slog.Warn("failed to parse review JSON", "task_id", task.ID, "reviewer_index", reviewerIndex, "err", parseErr)
		recommendation = extractRecommendation(rawContent)
	}

	// 保存结果
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]any{
			"status":           TaskStatusCompleted,
			"progress":         100,
			"recommendation":   recommendation,
			"review_content":   rawContent,
			"dimension_scores": dimensionScoresJSON,
			"completed_at":     now,
		})
}

// runSingleReviewWithModel 单个审稿人的审稿流程（使用指定模型，记录步骤详情）
// ctx 用于在 pipeline 取消 / 单审稿人超时时立即中断 AI 调用
func (s *Service) runSingleReviewWithModel(ctx context.Context, task *PeerReviewTask, reviewerIndex int, meta *ManuscriptMeta, summary *LiteratureSummary, refs []ReferenceForReviewer, writer *strings.Builder, modelConfig *ReviewerModelConfig) {
	reviewerName := ReviewerNames[reviewerIndex]
	slog.Info("runSingleReviewWithModel started", "task_id", task.ID, "reviewer", reviewerName, "model", modelConfig.ModelName)

	// 初始化步骤记录
	stepStartTime := time.Now()

	// 记录开始步骤
	currentStep := StepInfo{
		StepName:  StepNameReview,
		StepIndex: 1,
		Status:    StepStatusProcessing,
		StartTime: &stepStartTime,
	}

	// 将当前步骤保存到数据库（让前端能够实时看到）
	steps := []StepInfo{currentStep}
	stepsJSON, _ := json.Marshal(steps)

	// 更新审稿人状态和模型名称，同时保存步骤信息
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]any{
			"status":       TaskStatusProcessing,
			"progress":     10,
			"model_name":   modelConfig.ModelName,
			"steps_detail": string(stepsJSON),
		})

	var err error

	// 收集文本模式附件的内容（Word/RTF/ODT 等格式提取的文本）
	attachmentTexts := s.collectAttachmentTexts(task)
	if len(attachmentTexts) > 0 {
		slog.Debug("collected text attachments", "count", len(attachmentTexts), "task_id", task.ID, "reviewer", reviewerName)
	}

	// 收集 PDF 附件（无论主稿件是什么模式，PDF 附件都需要以文件形式传递）
	pdfAttachments := s.collectPDFAttachments(task)
	if len(pdfAttachments) > 0 {
		slog.Debug("collected PDF attachments", "count", len(pdfAttachments), "task_id", task.ID, "reviewer", reviewerName)
	}

	// 根据处理模式选择不同的处理方式
	if task.ManuscriptFile != nil && task.ManuscriptFile.ProcessMode == ProcessModeDirect {
		// PDF 主稿件直传模式
		slog.Info("using PDF direct mode", "task_id", task.ID, "reviewer", reviewerName, "file_name", task.ManuscriptFile.FileName)
		files := s.collectFilesForAI(task)
		if len(files) == 0 {
			err = fmt.Errorf("无法读取稿件文件")
			slog.Error("failed to collect files", "task_id", task.ID, "reviewer", reviewerName)
		} else {
			slog.Debug("collected files for AI", "count", len(files), "task_id", task.ID, "reviewer", reviewerName)
			err = s.generateReviewForTaskWithFileAndModel(ctx, files, attachmentTexts,
				meta, summary, refs, writer, task.ID, reviewerIndex, modelConfig)
		}
	} else {
		// 主稿件是文本模式
		manuscriptText := task.ManuscriptText
		if task.ManuscriptFile != nil && task.ManuscriptFile.ExtractedText != "" {
			manuscriptText = task.ManuscriptFile.ExtractedText
		}

		// 如果有 PDF 附件，需要使用混合模式
		if len(pdfAttachments) > 0 {
			slog.Info("using hybrid mode (text + PDF attachments)", "task_id", task.ID, "reviewer", reviewerName)
			err = s.generateReviewForTaskHybridWithModel(ctx, manuscriptText, pdfAttachments, attachmentTexts,
				meta, summary, refs, writer, task.ID, reviewerIndex, modelConfig)
		} else {
			// 纯文本模式
			slog.Info("using text mode", "task_id", task.ID, "reviewer", reviewerName, "text_length", len(manuscriptText))
			err = s.generateReviewForTaskWithModel(ctx, manuscriptText, attachmentTexts, meta, summary, refs, writer, task.ID, reviewerIndex, modelConfig)
		}
	}

	now := time.Now()
	currentStep.EndTime = &now
	currentStep.Duration = now.Sub(stepStartTime).Milliseconds()

	if err != nil {
		currentStep.Status = StepStatusFailed
		currentStep.ErrorMsg = err.Error()
		slog.Error("runSingleReviewWithModel failed", "task_id", task.ID, "reviewer", reviewerName, "err", err)

		// 更新步骤状态
		steps[0] = currentStep
		stepsJSON, _ = json.Marshal(steps)

		s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
			Updates(map[string]any{
				"status":        TaskStatusFailed,
				"error_message": err.Error(),
				"completed_at":  now,
				"steps_detail":  string(stepsJSON),
			})
		return
	}

	currentStep.Status = StepStatusCompleted
	slog.Info("runSingleReviewWithModel completed", "task_id", task.ID, "reviewer", reviewerName, "duration_ms", currentStep.Duration, "content_length", writer.Len())

	// 解析 JSON 响应
	rawContent := writer.String()
	reviewReport, parseErr := parseReviewJSON(rawContent)

	// 提取推荐意见
	var recommendation string
	var dimensionScoresJSON string

	if parseErr == nil && reviewReport != nil {
		recommendation = normalizeRecommendation(reviewReport.OverallAssessment.Recommendation)
		dimensionScores := DimensionScores{
			Originality:  0,
			Methodology:  0,
			Clarity:      0,
			Significance: 0,
			Overall:      0,
		}
		scoresBytes, _ := json.Marshal(dimensionScores)
		dimensionScoresJSON = string(scoresBytes)
	} else {
		slog.Warn("failed to parse review JSON", "task_id", task.ID, "reviewer", reviewerName, "err", parseErr)
		recommendation = extractRecommendation(rawContent)
	}

	// 更新步骤状态
	steps[0] = currentStep
	stepsJSON, _ = json.Marshal(steps)

	// 保存结果
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]any{
			"status":           TaskStatusCompleted,
			"progress":         100,
			"recommendation":   recommendation,
			"review_content":   rawContent,
			"dimension_scores": dimensionScoresJSON,
			"completed_at":     now,
			"steps_detail":     string(stepsJSON),
		})
}

// collectFilesForAI 收集所有需要传递给 AI 的文件（主稿件 + 附件）
// 只收集直传模式的文件（PDF、图片等），文本模式的附件通过 collectAttachmentTexts 获取
func (s *Service) collectFilesForAI(task *PeerReviewTask) []FileForAI {
	var files []FileForAI

	// 1. 添加主稿件（仅 PDF 直传模式）
	if task.ManuscriptFile != nil && task.ManuscriptFile.ProcessMode == ProcessModeDirect {
		fileContent, err := os.ReadFile(task.ManuscriptFile.FilePath)
		if err != nil {
			return nil
		}
		mimeType := task.ManuscriptFile.MimeType
		if mimeType == "" {
			mimeType = GetMimeType(task.ManuscriptFile.FileExt)
		}
		files = append(files, FileForAI{
			FileName: task.ManuscriptFile.FileName,
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(fileContent),
			Role:     FileRoleManuscript,
		})
	}

	// 2. 添加附件（按排序顺序，只收集直传模式：PDF、图片等）
	for _, att := range task.Attachments {
		if att.ProcessMode != ProcessModeDirect {
			continue // 文本模式的附件通过 collectAttachmentTexts 处理
		}
		fileContent, err := os.ReadFile(att.FilePath)
		if err != nil {
			continue // 跳过读取失败的附件
		}
		mimeType := att.MimeType
		if mimeType == "" {
			mimeType = GetMimeType(att.FileExt)
		}
		files = append(files, FileForAI{
			FileName: att.FileName,
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(fileContent),
			Role:     FileRoleAttachment,
		})
	}

	return files
}

// collectAttachmentTexts 收集所有文本模式附件的内容
// 返回格式：[{文件名: 内容}, ...]
func (s *Service) collectAttachmentTexts(task *PeerReviewTask) []map[string]string {
	var attachmentTexts []map[string]string

	for _, att := range task.Attachments {
		// 只处理文本模式的附件
		if att.ProcessMode != ProcessModeExtract {
			continue
		}
		// 使用上传时提取的文本
		if att.ExtractedText != "" {
			attachmentTexts = append(attachmentTexts, map[string]string{
				"name":    att.FileName,
				"content": att.ExtractedText,
			})
		}
	}

	return attachmentTexts
}

// collectPDFAttachments 收集所有 PDF 附件（直传模式）
// 用于在文本主稿件模式下，仍然传递 PDF 附件给 AI
func (s *Service) collectPDFAttachments(task *PeerReviewTask) []FileForAI {
	var files []FileForAI

	for _, att := range task.Attachments {
		// 只收集直传模式的附件（PDF 等）
		if att.ProcessMode != ProcessModeDirect {
			continue
		}
		fileContent, err := os.ReadFile(att.FilePath)
		if err != nil {
			continue // 跳过读取失败的附件
		}
		mimeType := att.MimeType
		if mimeType == "" {
			mimeType = GetMimeType(att.FileExt)
		}
		files = append(files, FileForAI{
			FileName: att.FileName,
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(fileContent),
			Role:     FileRoleAttachment,
		})
	}

	return files
}

// summarizeReviews 汇总三审结果（使用 AI Meta-Review）
func (s *Service) summarizeReviews(ctx context.Context, taskID uint, reviewResults []*strings.Builder) {
	slog.Info("summarizeReviews started", "task_id", taskID)

	// 获取任务信息
	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		slog.Error("failed to get task for summarize", "err", err)
		return
	}

	var results []PeerReviewResult
	s.db.Where("task_id = ?", taskID).Find(&results)
	slog.Info("found review results in DB", "count", len(results), "task_id", taskID)

	// 收集已完成的审稿结果
	var reviewContents []string
	recommendations := make(map[string]int)
	completedCount := 0

	for _, r := range results {
		slog.Debug("review result", "task_id", taskID, "reviewer_index", r.ReviewerIndex, "status", r.Status, "content_length", len(r.ReviewContent), "recommendation", r.Recommendation)
		if r.Status == TaskStatusCompleted {
			completedCount++
			recommendations[r.Recommendation]++
			reviewContents = append(reviewContents, r.ReviewContent)
		}
	}

	slog.Info("completed reviews", "task_id", taskID, "completed_count", completedCount)

	// 如果没有完成的审稿，直接返回
	if completedCount == 0 {
		slog.Warn("no completed reviews, setting final as Pending Review", "task_id", taskID)
		s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
			"final_recommendation": "Pending Review",
			"final_review_content": "",
			"consensus_score":      0,
		})
		return
	}

	// 计算一致性分数（用于参考）
	maxCount := 0
	for _, count := range recommendations {
		if count > maxCount {
			maxCount = count
		}
	}
	consensusScore := float64(maxCount) / float64(ReviewerCount)

	// 使用 AI 进行 Meta-Review 汇总
	metaReviewContent, err := s.generateMetaReview(ctx, reviewContents, task.ModelLevel)
	if err != nil {
		slog.Error("failed to generate meta-review", "err", err)
		// 回退到简单拼接方式
		var allContent strings.Builder
		for i, content := range reviewContents {
			allContent.WriteString(fmt.Sprintf("\n\n## 审稿人 %d 意见\n\n", i+1))
			allContent.WriteString(content)
		}
		// 使用简单多数决定最终推荐
		finalRec := "Pending Review"
		maxCount := 0
		for rec, count := range recommendations {
			if count > maxCount {
				maxCount = count
				finalRec = rec
			}
		}
		s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
			"final_recommendation": finalRec,
			"final_review_content": allContent.String(),
			"consensus_score":      consensusScore,
		})
		return
	}

	// 解析 Meta-Review JSON 获取最终推荐
	finalRec := "Pending Review"
	metaReport, parseErr := parseReviewJSON(metaReviewContent)
	if parseErr == nil && metaReport != nil {
		finalRec = normalizeRecommendation(metaReport.OverallAssessment.Recommendation)
	}

	// 更新任务
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]any{
		"final_recommendation": finalRec,
		"final_review_content": metaReviewContent,
		"consensus_score":      consensusScore,
	})
}

// generateMetaReview 使用 AI 生成 Meta-Review 汇总报告
func (s *Service) generateMetaReview(ctx context.Context, reviewContents []string, modelLevel string) (string, error) {
	// 构建三审意见输入
	var reviewerInputs strings.Builder
	reviewerInputs.WriteString("{\n")

	labels := []string{"reviewer_A", "reviewer_B", "reviewer_C"}
	for i, content := range reviewContents {
		if i >= 3 {
			break
		}
		// 提取 JSON 部分
		jsonContent := extractJSONFromContent(content)
		if i > 0 {
			reviewerInputs.WriteString(",\n")
		}
		reviewerInputs.WriteString(fmt.Sprintf(`  "%s": %s`, labels[i], jsonContent))
	}
	reviewerInputs.WriteString("\n}")

	systemPrompt := getMetaReviewSystemPrompt()
	userPrompt := fmt.Sprintf(getMetaReviewUserPrompt(), reviewerInputs.String())

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	level := getModelLevel(modelLevel)

	// 调用 AI 并支持续写
	content, err := s.callAIWithContinuation(ctx, messages, level, 3)
	if err != nil {
		return "", err
	}

	return content, nil
}

// extractJSONFromContent 从内容中提取 JSON 部分
func extractJSONFromContent(content string) string {
	content = strings.TrimSpace(content)

	// 移除 markdown 代码块标记
	if strings.HasPrefix(content, "```json") {
		content = strings.TrimPrefix(content, "```json")
	} else if strings.HasPrefix(content, "```") {
		content = strings.TrimPrefix(content, "```")
	}
	if strings.HasSuffix(content, "```") {
		content = strings.TrimSuffix(content, "```")
	}
	content = strings.TrimSpace(content)

	// 找到 JSON 对象边界
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		return content[startIdx : endIdx+1]
	}

	// 如果无法提取 JSON，返回空对象
	return "{}"
}
