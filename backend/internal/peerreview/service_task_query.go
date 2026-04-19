// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/database"
)

// ========== 任务管理方法 ==========

// CreateTask 创建审稿任务（保留兼容）
func (s *Service) CreateTask(userID uint, req *CreateTaskRequest) (*PeerReviewTask, error) {
	var manuscriptText string

	// 根据输入类型获取稿件内容
	if req.InputType == InputTypeFile {
		file, err := s.getFileByID(req.FileID, userID)
		if err != nil {
			return nil, fmt.Errorf("获取文件失败: %w", err)
		}
		manuscriptText = file.ExtractedText
	} else {
		manuscriptText = req.ManuscriptText
	}

	if len(manuscriptText) < 100 {
		return nil, fmt.Errorf("稿件内容太短，请提供更完整的内容")
	}

	// 生成内容哈希
	contentHash := generateManuscriptHash(manuscriptText)

	// 提取标题（简单方式：取前100字符或第一行）
	title := extractTitle(manuscriptText)

	// 创建任务（target_venue 已废弃）
	task := &PeerReviewTask{
		UserID:         userID,
		InputType:      req.InputType,
		ManuscriptText: manuscriptText,
		ContentHash:    contentHash,
		Title:          title,
		TargetVenue:    "", // 已废弃
		ModelLevel:     req.ModelLevel,
		Status:         TaskStatusPending,
		Progress:       0,
		ProgressStage:  "等待处理",
	}

	if req.InputType == InputTypeFile {
		task.ManuscriptFileID = &req.FileID
	}

	if err := s.db.Create(task).Error; err != nil {
		return nil, fmt.Errorf("创建任务失败: %w", err)
	}

	// 启动异步处理
	go s.processTaskAsyncWithThreeReviewers(task.ID)

	return task, nil
}

// GetTaskList 获取任务列表（排除草稿状态）
func (s *Service) GetTaskList(userID uint, page, pageSize int, status string, search string) (*TaskListResponse, error) {
	var tasks []PeerReviewTask
	var total int64

	// 排除草稿状态和隐私模式的任务
	query := s.db.Model(&PeerReviewTask{}).Where("user_id = ? AND status != ? AND is_private = ?", userID, TaskStatusDraft, false)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// 搜索逻辑：匹配标题、稿件文本
	if search != "" {
		searchPattern := "%" + search + "%"
		// 先获取匹配附件文件名的任务ID
		var matchingTaskIDs []uint
		s.db.Model(&PeerReviewFile{}).
			Select("DISTINCT task_id").
			Where("file_name LIKE ?", searchPattern).
			Pluck("task_id", &matchingTaskIDs)

		// 组合搜索条件：标题、稿件文本、或者附件匹配的任务
		if len(matchingTaskIDs) > 0 {
			query = query.Where(
				"title LIKE ? OR manuscript_text LIKE ? OR id IN ?",
				searchPattern, searchPattern, matchingTaskIDs,
			)
		} else {
			query = query.Where(
				"title LIKE ? OR manuscript_text LIKE ?",
				searchPattern, searchPattern,
			)
		}
	}

	// 统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	// 分页查询
	if err := query.Order("created_at DESC").Scopes(database.Paginate(page, pageSize)).Find(&tasks).Error; err != nil {
		return nil, err
	}

	// 批量预加载关联数据，避免 N+1 查询
	taskIDs := make([]uint, 0, len(tasks))
	manuscriptFileIDs := make([]uint, 0, len(tasks))
	for _, t := range tasks {
		taskIDs = append(taskIDs, t.ID)
		if t.ManuscriptFileID != nil {
			manuscriptFileIDs = append(manuscriptFileIDs, *t.ManuscriptFileID)
		}
	}

	// 一次性查询所有任务的附件数量（按 task_id 分组）
	attachmentCounts := make(map[uint]int64, len(tasks))
	if len(taskIDs) > 0 {
		type countRow struct {
			TaskID uint
			Cnt    int64
		}
		var rows []countRow
		s.db.Model(&PeerReviewFile{}).
			Select("task_id, COUNT(*) AS cnt").
			Where("task_id IN ? AND file_role = ?", taskIDs, FileRoleAttachment).
			Group("task_id").
			Scan(&rows)
		for _, r := range rows {
			attachmentCounts[r.TaskID] = r.Cnt
		}
	}

	// 一次性查询所有主稿件文件信息
	manuscriptFiles := make(map[uint]PeerReviewFile, len(manuscriptFileIDs))
	if len(manuscriptFileIDs) > 0 {
		var files []PeerReviewFile
		s.db.Select("id, file_name, file_ext").
			Where("id IN ?", manuscriptFileIDs).
			Find(&files)
		for _, f := range files {
			manuscriptFiles[f.ID] = f
		}
	}

	// 转换为摘要
	summaries := make([]TaskSummary, len(tasks))
	for i, t := range tasks {
		attachmentCount := attachmentCounts[t.ID]

		// 使用提交时间作为显示时间，如果没有提交时间则使用创建时间
		displayTime := t.CreatedAt
		if t.SubmittedAt != nil {
			displayTime = *t.SubmittedAt
		}

		// 获取主稿件文件信息（从预加载 map 中读取）
		var fileName, fileExt string
		if t.ManuscriptFileID != nil {
			if f, ok := manuscriptFiles[*t.ManuscriptFileID]; ok {
				fileName = f.FileName
				fileExt = f.FileExt
			}
		}

		// 获取稿件文本的前100个字符（用于标题展示）
		manuscriptTextPreview := ""
		if t.ManuscriptText != "" {
			runes := []rune(t.ManuscriptText)
			if len(runes) > 100 {
				manuscriptTextPreview = string(runes[:100])
			} else {
				manuscriptTextPreview = t.ManuscriptText
			}
		}

		summaries[i] = TaskSummary{
			ID:                  t.ID,
			Title:               t.Title,
			TargetVenue:         "", // 已废弃
			InputType:           t.InputType,
			Status:              t.Status,
			Progress:            t.Progress,
			ProgressStage:       t.ProgressStage,
			FinalRecommendation: t.FinalRecommendation,
			ModelLevel:          t.ModelLevel,
			AttachmentCount:     int(attachmentCount),
			CreatedAt:           displayTime, // 使用提交时间
			CompletedAt:         t.CompletedAt,
			FileName:            fileName,
			FileExt:             fileExt,
			ManuscriptText:      manuscriptTextPreview,
		}
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	return &TaskListResponse{
		Tasks:      summaries,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

// GetTaskDetail 获取任务详情（支持匿名访问）
func (s *Service) GetTaskDetail(userID uint, taskID uint, anonToken ...string) (*TaskDetailResponse, error) {
	at := ""
	if len(anonToken) > 0 {
		at = anonToken[0]
	}
	task, err := s.findTaskWithAccess(taskID, userID, at)
	if err != nil {
		return nil, err
	}

	// 加载关联数据
	s.loadTaskFiles(task)

	response := &TaskDetailResponse{
		ID:                  task.ID,
		Title:               task.Title,
		InputType:           task.InputType,
		TargetVenue:         "", // 已废弃
		IsPrivate:           task.IsPrivate,
		Status:              task.Status,
		Progress:            task.Progress,
		ProgressStage:       task.ProgressStage,
		ModelLevel:          task.ModelLevel,
		ErrorMessage:        task.ErrorMessage,
		ManuscriptText:      task.ManuscriptText,
		FinalRecommendation: task.FinalRecommendation,
		FinalReviewContent:  task.FinalReviewContent,
		ConsensusScore:      task.ConsensusScore,
		CreatedAt:           task.CreatedAt,
		UpdatedAt:           task.UpdatedAt,
		SubmittedAt:         task.SubmittedAt,
		CompletedAt:         task.CompletedAt,
	}

	// 添加主稿件文件信息
	if task.ManuscriptFile != nil {
		response.ManuscriptFile = &FileInfo{
			ID:       task.ManuscriptFile.ID,
			FileName: task.ManuscriptFile.FileName,
			FileExt:  task.ManuscriptFile.FileExt,
			FileSize: task.ManuscriptFile.FileSize,
		}
	}

	// 添加附件信息
	if len(task.Attachments) > 0 {
		response.Attachments = make([]FileInfo, len(task.Attachments))
		for i, att := range task.Attachments {
			response.Attachments[i] = FileInfo{
				ID:       att.ID,
				FileName: att.FileName,
				FileExt:  att.FileExt,
				FileSize: att.FileSize,
			}
		}
	}

	// 添加三审结果
	if len(task.Reviews) > 0 {
		response.Reviews = make([]ReviewResultInfo, len(task.Reviews))
		for i, r := range task.Reviews {
			response.Reviews[i] = ReviewResultInfo{
				ReviewerIndex:   r.ReviewerIndex,
				Status:          r.Status,
				Progress:        r.Progress,
				Recommendation:  r.Recommendation,
				ConfidenceScore: r.ConfidenceScore,
				ReviewContent:   r.ReviewContent,
				CompletedAt:     r.CompletedAt,
			}
		}
	}

	// 解析元信息
	if task.ManuscriptMeta != "" {
		var meta ManuscriptMeta
		if err := json.Unmarshal([]byte(task.ManuscriptMeta), &meta); err == nil {
			response.ManuscriptMeta = &meta
		}
	}

	// 解析文献总结
	if task.LiteratureSummary != "" {
		var summary LiteratureSummary
		if err := json.Unmarshal([]byte(task.LiteratureSummary), &summary); err == nil {
			response.LiteratureSummary = &summary
		}
	}

	return response, nil
}

// GetTaskProgress 获取任务进度（支持匿名访问）
func (s *Service) GetTaskProgress(userID uint, taskID uint, anonToken ...string) (map[string]any, error) {
	at := ""
	if len(anonToken) > 0 {
		at = anonToken[0]
	}

	// 先验证访问权限
	if _, err := s.findTaskWithAccess(taskID, userID, at); err != nil {
		return nil, err
	}

	// 查询进度
	var task PeerReviewTask
	if err := s.db.Select("id, status, progress, progress_stage, error_message, completed_at").
		First(&task, taskID).Error; err != nil {
		return nil, fmt.Errorf("任务不存在")
	}

	return map[string]any{
		"id":             task.ID,
		"status":         task.Status,
		"progress":       task.Progress,
		"progress_stage": task.ProgressStage,
		"error_message":  task.ErrorMessage,
		"completed_at":   task.CompletedAt,
	}, nil
}

// GetTaskSteps 获取任务步骤详情（支持匿名访问）
func (s *Service) GetTaskSteps(userID uint, taskID uint, anonToken ...string) (*TaskStepsResponse, error) {
	at := ""
	if len(anonToken) > 0 {
		at = anonToken[0]
	}
	task, err := s.findTaskWithAccess(taskID, userID, at)
	if err != nil {
		return nil, err
	}

	// 获取各审稿人结果
	var reviews []PeerReviewResult
	s.db.Where("task_id = ?", taskID).Order("reviewer_index ASC").Find(&reviews)

	// 构建响应
	response := &TaskStepsResponse{
		TaskID:        task.ID,
		Status:        task.Status,
		Progress:      task.Progress,
		ProgressStage: task.ProgressStage,
	}

	// 构建预处理步骤信息
	response.PreprocessSteps = s.buildPreprocessSteps(task)

	// 构建各审稿人步骤信息
	for _, review := range reviews {
		reviewerSteps := ReviewerStepsInfo{
			ReviewerIndex: review.ReviewerIndex,
			ReviewerName:  GetReviewerName(review.ReviewerIndex),
			ModelName:     review.ModelName,
			Status:        review.Status,
			Progress:      review.Progress,
		}

		// 解析步骤详情 JSON
		if review.StepsDetail != "" {
			var steps []StepInfo
			if err := json.Unmarshal([]byte(review.StepsDetail), &steps); err == nil {
				reviewerSteps.Steps = steps
			}
		}

		response.ReviewerSteps = append(response.ReviewerSteps, reviewerSteps)
	}

	// 构建汇总步骤信息
	response.SummarizeStep = s.buildSummarizeStep(task)

	return response, nil
}

// buildSummarizeStep 构建汇总步骤信息
func (s *Service) buildSummarizeStep(task *PeerReviewTask) *StepInfo {
	step := &StepInfo{
		StepName:  StepNameSummarize,
		StepIndex: 1,
		Status:    StepStatusPending,
	}

	// 判断汇总状态
	if task.Status == TaskStatusCompleted && task.FinalReviewContent != "" {
		step.Status = StepStatusCompleted
		// 可以添加一些汇总结果信息
		if task.FinalRecommendation != "" {
			step.Result = map[string]any{
				"recommendation": task.FinalRecommendation,
			}
		}
	} else if task.Status == TaskStatusFailed {
		step.Status = StepStatusFailed
		if task.ErrorMessage != "" {
			step.ErrorMsg = task.ErrorMessage
		}
	} else if task.Progress >= 90 {
		// 三审完成后进入汇总阶段
		step.Status = StepStatusProcessing
	}

	return step
}

// buildPreprocessSteps 构建预处理步骤信息
func (s *Service) buildPreprocessSteps(task *PeerReviewTask) []StepInfo {
	steps := []StepInfo{}

	// 步骤1: 稿件分析
	manuscriptStep := StepInfo{
		StepName:  StepNameManuscriptAnalysis,
		StepIndex: 1,
		Status:    StepStatusPending,
	}

	// 如果有稿件元信息，说明稿件分析已完成
	if task.ManuscriptMeta != "" {
		manuscriptStep.Status = StepStatusCompleted
		// 解析元信息作为结果
		var meta ManuscriptMeta
		if err := json.Unmarshal([]byte(task.ManuscriptMeta), &meta); err == nil {
			manuscriptStep.Result = map[string]any{
				"title":      meta.Title,
				"field":      meta.Field,
				"main_topic": meta.MainTopic,
				"keywords":   meta.Keywords,
			}
		}
	} else if task.Progress >= 10 && task.Progress < 15 {
		manuscriptStep.Status = StepStatusProcessing
	}
	steps = append(steps, manuscriptStep)

	// 步骤2: 构建检索策略
	searchQueryStep := StepInfo{
		StepName:  StepNameBuildSearchQuery,
		StepIndex: 2,
		Status:    StepStatusPending,
	}
	if task.Progress >= 15 {
		searchQueryStep.Status = StepStatusCompleted
	} else if task.Progress >= 10 && task.ManuscriptMeta != "" {
		searchQueryStep.Status = StepStatusProcessing
	}
	steps = append(steps, searchQueryStep)

	// 步骤3: 文献检索
	literatureSearchStep := StepInfo{
		StepName:  StepNameLiteratureSearch,
		StepIndex: 3,
		Status:    StepStatusPending,
	}

	// 如果有文献上下文，说明检索已完成
	if task.LiteratureContext != "" {
		literatureSearchStep.Status = StepStatusCompleted
		// 解析文献数量作为结果
		var litCtx LiteratureContext
		if err := json.Unmarshal([]byte(task.LiteratureContext), &litCtx); err == nil {
			// 统计所有分类的论文总数（去重后）
			totalPapers := len(litCtx.AllPapers)
			// 如果 AllPapers 为空，尝试从分类中统计
			if totalPapers == 0 {
				paperSet := make(map[string]bool)
				for _, p := range litCtx.ByTopic {
					if id, ok := p["paperId"].(string); ok && id != "" {
						paperSet[id] = true
					}
				}
				for _, p := range litCtx.ByMethod {
					if id, ok := p["paperId"].(string); ok && id != "" {
						paperSet[id] = true
					}
				}
				for _, p := range litCtx.ByNovelty {
					if id, ok := p["paperId"].(string); ok && id != "" {
						paperSet[id] = true
					}
				}
				for _, p := range litCtx.ByTheory {
					if id, ok := p["paperId"].(string); ok && id != "" {
						paperSet[id] = true
					}
				}
				totalPapers = len(paperSet)
			}
			literatureSearchStep.Result = map[string]any{
				"total_papers": totalPapers,
			}
		}
	} else if task.Progress >= 25 && task.Progress < 35 {
		literatureSearchStep.Status = StepStatusProcessing
	}
	steps = append(steps, literatureSearchStep)

	// 步骤4: 文献总结
	literatureSummaryStep := StepInfo{
		StepName:  StepNameLiteratureSummary,
		StepIndex: 4,
		Status:    StepStatusPending,
	}

	// 如果有文献总结，说明总结已完成
	if task.LiteratureSummary != "" {
		literatureSummaryStep.Status = StepStatusCompleted
		// 解析文献总结作为结果
		var summary LiteratureSummary
		if err := json.Unmarshal([]byte(task.LiteratureSummary), &summary); err == nil {
			literatureSummaryStep.Result = map[string]any{
				"closest_papers": len(summary.ClosestPapers),
			}
		}
	} else if task.Progress >= 45 && task.Progress < 50 {
		literatureSummaryStep.Status = StepStatusProcessing
	}
	steps = append(steps, literatureSummaryStep)

	return steps
}

// WatchTaskProgress SSE监听任务进度（支持匿名访问）
func (s *Service) WatchTaskProgress(userID uint, taskID uint, anonToken string, writer io.Writer) error {
	// 验证任务归属
	if _, err := s.findTaskWithAccess(taskID, userID, anonToken); err != nil {
		return err
	}

	// 重新查询最新状态
	var task PeerReviewTask
	s.db.First(&task, taskID)

	// 如果任务已完成，直接返回结果
	if task.Status == TaskStatusCompleted || task.Status == TaskStatusFailed {
		sendEventWithProgress(writer, "done", task.Status, task.Progress, task.ProgressStage)
		return nil
	}

	// 轮询任务状态
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeout := time.After(10 * time.Minute) // 最长等待10分钟

	for {
		select {
		case <-ticker.C:
			var currentTask PeerReviewTask
			if err := s.db.Where("id = ?", taskID).First(&currentTask).Error; err != nil {
				return err
			}

			sendEventWithProgress(writer, "progress", currentTask.Status, currentTask.Progress, currentTask.ProgressStage)

			if currentTask.Status == TaskStatusCompleted || currentTask.Status == TaskStatusFailed {
				sendEventWithProgress(writer, "done", currentTask.Status, currentTask.Progress, currentTask.ProgressStage)
				return nil
			}

		case <-timeout:
			sendEventWithProgress(writer, "timeout", "timeout", 0, "请求超时")
			return nil
		}
	}
}

// sendEventWithProgress 发送带进度的事件
func sendEventWithProgress(writer io.Writer, eventType string, status string, progress int, stage string) {
	event := StreamEvent{
		Type:     eventType,
		Data:     status,
		Progress: progress,
		Message:  stage,
	}
	jsonData, _ := json.Marshal(event)
	fmt.Fprintf(writer, "data: %s\n\n", string(jsonData))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
}

// ========== 文件处理方法 ==========

// CountDraftTasks 统计用户的草稿任务数量
func (s *Service) CountDraftTasks(userID uint) (int64, error) {
	var count int64
	err := s.db.Model(&PeerReviewTask{}).
		Where("user_id = ? AND status = ?", userID, TaskStatusDraft).
		Count(&count).Error
	return count, err
}

// GetFileForDownload 获取文件用于下载（支持匿名访问）
func (s *Service) GetFileForDownload(userID uint, fileID uint, anonToken ...string) (*PeerReviewFile, string, error) {
	at := ""
	if len(anonToken) > 0 {
		at = anonToken[0]
	}

	var file PeerReviewFile
	if err := s.db.First(&file, fileID).Error; err != nil {
		return nil, "", fmt.Errorf("文件不存在")
	}

	// 验证用户权限：文件必须属于用户的任务
	if file.TaskID != nil {
		if _, err := s.findTaskWithAccess(*file.TaskID, userID, at); err != nil {
			return nil, "", fmt.Errorf("无权访问此文件")
		}
	} else if userID > 0 && file.UserID == userID {
		// 登录用户直接匹配
	} else {
		return nil, "", fmt.Errorf("无权访问此文件")
	}

	// 检查文件是否存在
	if _, err := os.Stat(file.FilePath); os.IsNotExist(err) {
		return nil, "", fmt.Errorf("文件已被删除")
	}

	return &file, file.FilePath, nil
}

// DeleteTask 删除任务（包括关联的文件）
func (s *Service) DeleteTask(userID uint, taskID uint) error {
	var task PeerReviewTask
	if err := s.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		return fmt.Errorf("任务不存在")
	}

	// 只允许删除草稿和失败状态的任务
	if task.Status != TaskStatusDraft && task.Status != TaskStatusFailed {
		return fmt.Errorf("只能删除草稿或失败状态的任务")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 删除关联的文件记录和磁盘文件
		var files []PeerReviewFile
		tx.Where("task_id = ?", task.ID).Find(&files)
		for _, f := range files {
			os.Remove(f.FilePath)
		}
		tx.Where("task_id = ?", task.ID).Delete(&PeerReviewFile{})

		// 删除主稿件文件
		if task.ManuscriptFileID != nil {
			var mf PeerReviewFile
			if tx.First(&mf, *task.ManuscriptFileID).Error == nil {
				os.Remove(mf.FilePath)
				tx.Delete(&mf)
			}
		}

		// 删除审稿结果
		tx.Where("task_id = ?", task.ID).Delete(&PeerReviewResult{})

		// 删除任务
		if err := tx.Delete(&task).Error; err != nil {
			return fmt.Errorf("删除任务失败: %w", err)
		}

		return nil
	})
}

// StartDraftTask 启动草稿任务（支持匿名访问）
// target_venue 参数已废弃，保留参数签名以兼容旧接口
func (s *Service) StartDraftTask(userID uint, taskID uint, _ string, modelLevel string, anonToken ...string) error {
	at := ""
	if len(anonToken) > 0 {
		at = anonToken[0]
	}
	task, err := s.findTaskWithAccess(taskID, userID, at)
	if err != nil {
		return err
	}

	if task.Status != TaskStatusDraft {
		return fmt.Errorf("只能启动草稿状态的任务")
	}

	// 更新任务状态为待处理（target_venue 已废弃）
	updates := map[string]any{
		"status":         TaskStatusPending,
		"model_level":    modelLevel,
		"progress":       0,
		"progress_stage": "等待处理",
	}

	if err := s.db.Model(task).Updates(updates).Error; err != nil {
		return fmt.Errorf("更新任务状态失败: %w", err)
	}

	// 异步启动审稿流程
	go s.runTaskPipeline(task.ID, userID, modelLevel)

	return nil
}

// runTaskPipeline 异步执行审稿任务（带异常恢复）
// 使用三审并行流程
func (s *Service) runTaskPipeline(taskID uint, userID uint, modelLevel string) {
	// 直接调用三审流程
	s.processTaskAsyncWithThreeReviewers(taskID)
}

// ClaimTask 认领匿名任务（将匿名任务绑定到登录用户）
func (s *Service) ClaimTask(userID uint, taskID uint, anonToken string) error {
	if anonToken == "" {
		return fmt.Errorf("缺少匿名令牌")
	}

	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		return fmt.Errorf("任务不存在")
	}

	// 验证 anon_token 匹配
	if task.AnonToken == "" || task.AnonToken != anonToken {
		return fmt.Errorf("无权认领此任务")
	}

	// 已经被认领（user_id != 0）
	if task.UserID != 0 {
		if task.UserID == userID {
			return nil // 已经是自己的任务
		}
		return fmt.Errorf("此任务已被其他用户认领")
	}

	// 更新任务的 user_id，清空 anon_token
	if err := s.db.Model(&task).Updates(map[string]any{
		"user_id":    userID,
		"anon_token": "",
	}).Error; err != nil {
		return fmt.Errorf("认领任务失败: %w", err)
	}

	// 同时更新关联文件的 user_id
	s.db.Model(&PeerReviewFile{}).Where("task_id = ?", taskID).Update("user_id", userID)

	return nil
}

// extractTitle 从稿件内容中提取标题
func extractTitle(content string) string {
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) > 10 && len(line) < 200 {
			// 跳过明显不是标题的行
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "abstract") ||
				strings.HasPrefix(lower, "摘要") ||
				strings.HasPrefix(lower, "introduction") ||
				strings.HasPrefix(lower, "keywords") {
				continue
			}
			return line
		}
	}

	// 如果找不到合适的标题，取前50个字符
	if len(content) > 50 {
		return content[:50] + "..."
	}
	return content
}

// CleanupExpiredPrivateTasks 清理已过期的隐私模式任务数据
// 保留任务记录但清除稿件内容和文件
func (s *Service) CleanupExpiredPrivateTasks() (int64, error) {
	now := time.Now()

	// 查找已过期的隐私任务
	var tasks []PeerReviewTask
	s.db.Where("is_private = ? AND private_exp_at IS NOT NULL AND private_exp_at < ?", true, now).Find(&tasks)

	var cleaned int64
	for _, task := range tasks {
		// 删除关联文件
		var files []PeerReviewFile
		s.db.Where("task_id = ?", task.ID).Find(&files)
		for _, f := range files {
			os.Remove(f.FilePath)
		}
		s.db.Where("task_id = ?", task.ID).Delete(&PeerReviewFile{})

		// 清除敏感内容，保留元数据用于统计
		s.db.Model(&task).Updates(map[string]any{
			"manuscript_text":      "",
			"manuscript_file_id":   nil,
			"manuscript_meta":      "",
			"literature_context":   "",
			"literature_summary":   "",
			"final_review_content": "",
			"status":               "expired",
			"progress_stage":       "隐私数据已清除",
		})

		// 清除审稿结果内容
		s.db.Model(&PeerReviewResult{}).Where("task_id = ?", task.ID).Updates(map[string]any{
			"review_content": "",
			"steps_detail":   "",
		})

		cleaned++
	}

	return cleaned, nil
}
