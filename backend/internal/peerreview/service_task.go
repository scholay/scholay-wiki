// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"scholar-backend/internal/ai"
)

// ========== 草稿管理方法 ==========

// GetOrCreateDraft 获取或创建用户的唯一草稿
func (s *Service) GetOrCreateDraft(userID uint) (*DraftResponse, error) {
	var draft PeerReviewTask
	
	// 查找用户的草稿任务
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	
	if err == gorm.ErrRecordNotFound {
		// 不存在草稿，创建一个新的空草稿
		draft = PeerReviewTask{
			UserID:        userID,
			InputType:     InputTypeText,
			Status:        TaskStatusDraft,
			Progress:      0,
			ProgressStage: "草稿",
			ModelLevel:    "mid",
		}
		if err := s.db.Create(&draft).Error; err != nil {
			return nil, fmt.Errorf("创建草稿失败: %w", err)
		}
	} else if err != nil {
		return nil, err
	}

	// 构建响应
	return s.buildDraftResponse(&draft), nil
}

// SaveDraft 保存草稿
func (s *Service) SaveDraft(userID uint, req *SaveDraftRequest) (*DraftResponse, error) {
	var draft PeerReviewTask
	
	// 查找用户的草稿任务
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	
	if err == gorm.ErrRecordNotFound {
		// 不存在草稿，创建一个新的
		draft = PeerReviewTask{
			UserID: userID,
			Status: TaskStatusDraft,
		}
	} else if err != nil {
		return nil, err
	}

	// 验证字符长度限制（最大5万字符）
	const maxManuscriptLength = 50000
	if len(req.ManuscriptText) > maxManuscriptLength {
		return nil, fmt.Errorf("稿件内容超出长度限制，最多支持%d个字符，当前%d个字符", maxManuscriptLength, len(req.ManuscriptText))
	}

	// 更新草稿内容
	draft.InputType = req.InputType
	draft.ManuscriptText = req.ManuscriptText
	draft.TargetVenue = req.TargetVenue
	draft.ModelLevel = req.ModelLevel
	draft.FileName = req.FileName
	
	// 如果有内容，提取标题
	if len(req.ManuscriptText) > 0 {
		draft.Title = extractTitle(req.ManuscriptText)
	} else {
		// 清空时也清空标题
		draft.Title = ""
	}

	// 保存
	if draft.ID == 0 {
		if err := s.db.Create(&draft).Error; err != nil {
			return nil, fmt.Errorf("创建草稿失败: %w", err)
		}
	} else {
		if err := s.db.Save(&draft).Error; err != nil {
			return nil, fmt.Errorf("保存草稿失败: %w", err)
		}
	}

	return s.buildDraftResponse(&draft), nil
}

// SubmitDraft 提交草稿开始审稿
func (s *Service) SubmitDraft(userID uint, req *SubmitDraftRequest) (*PeerReviewTask, error) {
	var draft PeerReviewTask
	
	// 查找用户的草稿任务
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("没有找到草稿，请先输入稿件内容")
		}
		return nil, err
	}

	// 验证草稿内容
	if len(draft.ManuscriptText) < 100 {
		return nil, fmt.Errorf("稿件内容太短，请提供更完整的内容（至少100字）")
	}
	
	// 验证字符长度限制（最大5万字符）
	const maxManuscriptLength = 50000
	if len(draft.ManuscriptText) > maxManuscriptLength {
		return nil, fmt.Errorf("稿件内容超出长度限制，最多支持%d个字符", maxManuscriptLength)
	}

	// 更新目标期刊和模型级别
	if req.TargetVenue != "" {
		draft.TargetVenue = req.TargetVenue
	}
	if req.ModelLevel != "" {
		draft.ModelLevel = req.ModelLevel
	}

	// 生成内容哈希
	draft.ManuscriptHash = generateManuscriptHash(draft.ManuscriptText, draft.TargetVenue)

	// 更新状态为待处理
	draft.Status = TaskStatusPending
	draft.Progress = 0
	draft.ProgressStage = "等待处理"
	
	// 更新创建时间为当前时间（提交审稿的时间才是真正的任务开始时间）
	now := time.Now()
	draft.CreatedAt = now
	draft.StartedAt = &now

	if err := s.db.Save(&draft).Error; err != nil {
		return nil, fmt.Errorf("提交草稿失败: %w", err)
	}

	// 启动异步处理
	go s.processTaskAsync(draft.ID)

	return &draft, nil
}

// ParseFileAndSaveToDraft 解析文件并保存到草稿
func (s *Service) ParseFileAndSaveToDraft(userID uint, fileName string, fileExt string, content []byte) (*UploadFileResponse, error) {
	// 提取文本内容
	var extractedText string
	var err error

	switch fileExt {
	case ".txt":
		extractedText, err = extractTextFromTXT(content)
	case ".doc", ".docx", ".rtf", ".odt":
		extractedText, err = extractTextFromWord(content, fileExt)
	case ".pdf":
		extractedText, err = extractTextFromPDF(content)
	default:
		return nil, fmt.Errorf("不支持的文件类型: %s", fileExt)
	}

	if err != nil {
		return nil, fmt.Errorf("提取文本失败: %w", err)
	}

	if len(extractedText) < 50 {
		return nil, fmt.Errorf("文件内容太少或无法识别")
	}

	// 验证提取内容长度（最大5万字符）
	const maxManuscriptLength = 50000
	if len(extractedText) > maxManuscriptLength {
		return nil, fmt.Errorf("文件内容超出长度限制，最多支持%d个字符，当前文件包含%d个字符", maxManuscriptLength, len(extractedText))
	}

	// 保存原始文件到磁盘
	uploadDir := "./uploads/peer-review"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("创建上传目录失败: %w", err)
	}

	// 生成唯一文件名
	uniqueFileName := fmt.Sprintf("%d_%d_%s", userID, time.Now().UnixNano(), fileName)
	filePath := filepath.Join(uploadDir, uniqueFileName)
	
	// 写入文件
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return nil, fmt.Errorf("保存文件失败: %w", err)
	}

	// 创建文件记录
	file := PeerReviewFile{
		UserID:        userID,
		FileName:      fileName,
		FileType:      strings.TrimPrefix(fileExt, "."),
		FileSize:      int64(len(content)),
		FilePath:      filePath,
		ExtractedText: extractedText,
		Status:        "processed",
		CreatedAt:     time.Now(),
	}
	if err := s.db.Create(&file).Error; err != nil {
		// 如果数据库保存失败，删除已保存的文件
		os.Remove(filePath)
		return nil, fmt.Errorf("保存文件记录失败: %w", err)
	}

	// 获取或创建草稿
	var draft PeerReviewTask
	err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	
	if err == gorm.ErrRecordNotFound {
		draft = PeerReviewTask{
			UserID:        userID,
			InputType:     InputTypeFile,
			Status:        TaskStatusDraft,
			Progress:      0,
			ProgressStage: "草稿",
			ModelLevel:    "mid",
		}
	} else if err != nil {
		return nil, err
	}

	// 如果之前有关联的文件，删除旧文件
	if draft.FileID != nil {
		var oldFile PeerReviewFile
		if err := s.db.First(&oldFile, *draft.FileID).Error; err == nil {
			os.Remove(oldFile.FilePath)
			s.db.Delete(&oldFile)
		}
	}

	// 更新草稿内容
	draft.InputType = InputTypeFile
	draft.ManuscriptText = extractedText
	draft.FileName = fileName
	draft.FileID = &file.ID
	draft.Title = strings.TrimSuffix(fileName, fileExt)
	if len(draft.Title) > 100 {
		draft.Title = truncateString(draft.Title, 100)
	}

	// 保存草稿
	if draft.ID == 0 {
		if err := s.db.Create(&draft).Error; err != nil {
			return nil, fmt.Errorf("创建草稿失败: %w", err)
		}
	} else {
		if err := s.db.Save(&draft).Error; err != nil {
			return nil, fmt.Errorf("保存草稿失败: %w", err)
		}
	}

	// 构建预览
	preview := truncateString(extractedText, 500)

	return &UploadFileResponse{
		DraftID:        draft.ID,
		FileID:         file.ID,
		FileName:       fileName,
		FileSize:       int64(len(content)),
		ExtractedText:  extractedText,
		ContentPreview: preview,
	}, nil
}

// buildDraftResponse 构建草稿响应
func (s *Service) buildDraftResponse(draft *PeerReviewTask) *DraftResponse {
	preview := ""
	if len(draft.ManuscriptText) > 500 {
		preview = draft.ManuscriptText[:500] + "..."
	} else {
		preview = draft.ManuscriptText
	}

	return &DraftResponse{
		ID:             draft.ID,
		InputType:      draft.InputType,
		ManuscriptText: draft.ManuscriptText,
		TargetVenue:    draft.TargetVenue,
		ModelLevel:     draft.ModelLevel,
		FileName:       draft.FileName,
		ContentPreview: preview,
	}
}

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
	manuscriptHash := generateManuscriptHash(manuscriptText, req.TargetVenue)

	// 提取标题（简单方式：取前100字符或第一行）
	title := extractTitle(manuscriptText)

	// 创建任务
	task := &PeerReviewTask{
		UserID:         userID,
		InputType:      req.InputType,
		ManuscriptText: manuscriptText,
		ManuscriptHash: manuscriptHash,
		Title:          title,
		TargetVenue:    req.TargetVenue,
		ModelLevel:     req.ModelLevel,
		Status:         TaskStatusPending,
		Progress:       0,
		ProgressStage:  "等待处理",
	}

	if req.InputType == InputTypeFile {
		task.FileID = &req.FileID
	}

	if err := s.db.Create(task).Error; err != nil {
		return nil, fmt.Errorf("创建任务失败: %w", err)
	}

	// 启动异步处理
	go s.processTaskAsync(task.ID)

	return task, nil
}

// GetTaskList 获取任务列表（排除草稿状态）
func (s *Service) GetTaskList(userID uint, page, pageSize int, status string) (*TaskListResponse, error) {
	var tasks []PeerReviewTask
	var total int64

	// 排除草稿状态的任务
	query := s.db.Model(&PeerReviewTask{}).Where("user_id = ? AND status != ?", userID, TaskStatusDraft)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// 统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	// 分页查询
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&tasks).Error; err != nil {
		return nil, err
	}

	// 转换为摘要
	summaries := make([]TaskSummary, len(tasks))
	for i, t := range tasks {
		summaries[i] = TaskSummary{
			ID:             t.ID,
			Title:          t.Title,
			TargetVenue:    t.TargetVenue,
			InputType:      t.InputType,
			Status:         t.Status,
			Progress:       t.Progress,
			ProgressStage:  t.ProgressStage,
			Recommendation: t.Recommendation,
			ModelLevel:     t.ModelLevel,
			CreatedAt:      t.CreatedAt,
			CompletedAt:    t.CompletedAt,
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

// GetTaskDetail 获取任务详情
func (s *Service) GetTaskDetail(userID uint, taskID uint) (*TaskDetailResponse, error) {
	var task PeerReviewTask
	if err := s.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("任务不存在")
		}
		return nil, err
	}

	response := &TaskDetailResponse{
		ID:            task.ID,
		Title:         task.Title,
		InputType:     task.InputType,
		TargetVenue:   task.TargetVenue,
		Status:        task.Status,
		Progress:      task.Progress,
		ProgressStage: task.ProgressStage,
		ModelLevel:    task.ModelLevel,
		FileID:        task.FileID,
		ReviewContent: task.ReviewContent,
		Recommendation: task.Recommendation,
		ErrorMessage:  task.ErrorMessage,
		CreatedAt:     task.CreatedAt,
		UpdatedAt:     task.UpdatedAt,
		CompletedAt:   task.CompletedAt,
	}

	// 只在详情中返回稿件内容
	if len(task.ManuscriptText) > 10000 {
		response.ManuscriptText = task.ManuscriptText[:10000] + "...(内容已截断)"
	} else {
		response.ManuscriptText = task.ManuscriptText
	}

	// 获取文件名 - 优先使用任务表中的 FileName 字段
	if task.FileName != "" {
		response.FileName = task.FileName
	} else if task.FileID != nil {
		// 兼容旧数据：从 PeerReviewFile 表获取
		var file PeerReviewFile
		if err := s.db.Where("id = ?", *task.FileID).First(&file).Error; err == nil {
			response.FileName = file.FileName
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

	// 解析研究空白文献
	if task.GapLiterature != "" {
		var gaps []GapLiterature
		if err := json.Unmarshal([]byte(task.GapLiterature), &gaps); err == nil {
			response.GapLiterature = gaps
		}
	}

	return response, nil
}

// GetTaskProgress 获取任务进度
func (s *Service) GetTaskProgress(userID uint, taskID uint) (map[string]interface{}, error) {
	var task PeerReviewTask
	if err := s.db.Select("id, status, progress, progress_stage, error_message, completed_at").
		Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("任务不存在")
		}
		return nil, err
	}

	return map[string]interface{}{
		"id":             task.ID,
		"status":         task.Status,
		"progress":       task.Progress,
		"progress_stage": task.ProgressStage,
		"error_message":  task.ErrorMessage,
		"completed_at":   task.CompletedAt,
	}, nil
}

// WatchTaskProgress SSE监听任务进度
func (s *Service) WatchTaskProgress(userID uint, taskID uint, writer io.Writer) error {
	// 验证任务归属
	var task PeerReviewTask
	if err := s.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		return fmt.Errorf("任务不存在")
	}

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

// UploadFile 旧版上传文件方法（已弃用，使用 ParseFileAndSaveToDraft 代替）
// 为了兼容性保留，内部调用新方法
func (s *Service) UploadFile(userID uint, fileName string, fileExt string, content []byte) (*UploadFileResponse, error) {
	return s.ParseFileAndSaveToDraft(userID, fileName, fileExt, content)
}

// GetFileForDownload 获取文件用于下载
func (s *Service) GetFileForDownload(userID uint, fileID uint) (*PeerReviewFile, string, error) {
	var file PeerReviewFile
	if err := s.db.Where("id = ? AND user_id = ?", fileID, userID).First(&file).Error; err != nil {
		return nil, "", fmt.Errorf("文件不存在或无权访问")
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
		// 如果有关联文件，一起删除
		if task.FileID != nil {
			if err := tx.Delete(&PeerReviewFile{}, *task.FileID).Error; err != nil {
				return fmt.Errorf("删除关联文件失败: %w", err)
			}
		}

		// 删除任务
		if err := tx.Delete(&task).Error; err != nil {
			return fmt.Errorf("删除任务失败: %w", err)
		}

		return nil
	})
}

// StartDraftTask 启动草稿任务（开始审稿流程）
func (s *Service) StartDraftTask(userID uint, taskID uint, targetVenue string, modelLevel string) error {
	var task PeerReviewTask
	if err := s.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		return fmt.Errorf("任务不存在")
	}

	if task.Status != TaskStatusDraft {
		return fmt.Errorf("只能启动草稿状态的任务")
	}

	// 更新任务状态为待处理
	updates := map[string]interface{}{
		"status":        TaskStatusPending,
		"target_venue":  targetVenue,
		"model_level":   modelLevel,
		"progress":      0,
		"progress_stage": "等待处理",
	}

	if err := s.db.Model(&task).Updates(updates).Error; err != nil {
		return fmt.Errorf("更新任务状态失败: %w", err)
	}

	// 异步启动审稿流程
	go s.runTaskPipeline(task.ID, userID, modelLevel)

	return nil
}

// runTaskPipeline 异步执行审稿任务
func (s *Service) runTaskPipeline(taskID uint, userID uint, modelLevel string) {
	// 获取任务
	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		s.updateTaskFailed(taskID, "获取任务失败: "+err.Error())
		return
	}

	// 更新状态为处理中
	s.updateTaskProgress(taskID, TaskStatusProcessing, 5, "开始处理")

	// 执行审稿流程
	req := &PeerReviewRequest{
		ManuscriptText: task.ManuscriptText,
		TargetVenue:    task.TargetVenue,
		ModelLevel:     modelLevel,
	}

	// 使用一个 buffer 来收集输出
	var buf bytes.Buffer
	err := s.RunPeerReview(userID, req, &buf)
	if err != nil {
		s.updateTaskFailed(taskID, "审稿处理失败: "+err.Error())
		return
	}

	// 解析输出结果并更新任务
	// 这里简化处理，实际应该解析 SSE 事件
	now := time.Now()
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
		"status":        TaskStatusCompleted,
		"progress":      100,
		"progress_stage": "已完成",
		"completed_at":  &now,
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

// extractTextFromTXT 从TXT文件提取文本
func extractTextFromTXT(content []byte) (string, error) {
	// 检测并转换编码
	if !utf8.Valid(content) {
		// 尝试GBK解码（简单处理，生产环境应使用更完善的编码检测）
		return string(content), nil
	}
	return string(content), nil
}

// extractTextFromWord 从Word文件提取文本
// 支持 .docx (Office Open XML), .doc (OLE), .rtf, .odt 等格式
func extractTextFromWord(content []byte, fileExt string) (string, error) {
	if len(content) < 4 {
		return "", fmt.Errorf("文件内容太短")
	}
	
	reader := bytes.NewReader(content)
	
	// 根据文件头判断实际格式
	// ZIP 文件以 PK (0x50 0x4B) 开头 - docx, odt
	if content[0] == 0x50 && content[1] == 0x4B {
		// 尝试作为 docx 解析
		text, err := extractTextFromDocx(reader, int64(len(content)))
		if err == nil && len(strings.TrimSpace(text)) > 0 {
			return text, nil
		}
		// 尝试作为 odt 解析
		text, err = extractTextFromODT(reader, int64(len(content)))
		if err == nil && len(strings.TrimSpace(text)) > 0 {
			return text, nil
		}
	}
	
	// RTF 文件以 {\rtf 开头
	if len(content) >= 5 && string(content[:5]) == "{\\rtf" {
		return extractTextFromRTF(content)
	}
	
	// OLE 文件以 D0 CF 11 E0 开头 - 旧版 .doc
	if content[0] == 0xD0 && content[1] == 0xCF && content[2] == 0x11 && content[3] == 0xE0 {
		return extractTextFromOldDoc(content)
	}
	
	// 尝试作为纯文本处理
	if utf8.Valid(content) {
		text := string(content)
		if len(strings.TrimSpace(text)) > 50 {
			return cleanupText(text), nil
		}
	}
	
	// 最后尝试提取可见文本
	return extractVisibleText(content), nil
}

// extractTextFromDocx 从 docx 文件提取文本
func extractTextFromDocx(reader io.ReaderAt, size int64) (string, error) {
	// 使用标准库 archive/zip 读取
	zipReader, err := zip.NewReader(reader, size)
	if err != nil {
		return "", fmt.Errorf("无法打开 docx 文件: %w", err)
	}
	
	var textContent strings.Builder
	
	// 遍历 ZIP 文件中的所有文件
	for _, f := range zipReader.File {
		// docx 的主要文本内容在 word/document.xml 中
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}
			
			// 从 XML 中提取纯文本
			text := extractTextFromWordXML(string(data))
			textContent.WriteString(text)
			break
		}
	}
	
	return textContent.String(), nil
}

// extractTextFromODT 从 OpenDocument 格式文件提取文本
func extractTextFromODT(reader io.ReaderAt, size int64) (string, error) {
	zipReader, err := zip.NewReader(reader, size)
	if err != nil {
		return "", err
	}
	
	var textContent strings.Builder
	
	for _, f := range zipReader.File {
		// ODT 的文本内容在 content.xml 中
		if f.Name == "content.xml" {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}
			
			// 提取 text:p 标签中的内容
			text := extractTextFromODTXML(string(data))
			textContent.WriteString(text)
			break
		}
	}
	
	return textContent.String(), nil
}

// extractTextFromODTXML 从 ODT XML 中提取文本
func extractTextFromODTXML(xmlContent string) string {
	var result strings.Builder
	var currentParagraph strings.Builder
	
	content := xmlContent
	pos := 0
	
	for pos < len(content) {
		tagStart := strings.Index(content[pos:], "<")
		if tagStart == -1 {
			break
		}
		tagStart += pos
		
		tagEnd := strings.Index(content[tagStart:], ">")
		if tagEnd == -1 {
			break
		}
		tagEnd += tagStart
		
		tag := content[tagStart : tagEnd+1]
		
		// 段落结束
		if strings.HasPrefix(tag, "</text:p") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}
		
		// 换行
		if strings.HasPrefix(tag, "<text:line-break") {
			currentParagraph.WriteString("\n")
			pos = tagEnd + 1
			continue
		}
		
		// 文本内容（不在标签内的文本）
		nextTag := strings.Index(content[tagEnd+1:], "<")
		if nextTag > 0 {
			text := content[tagEnd+1 : tagEnd+1+nextTag]
			if strings.TrimSpace(text) != "" {
				currentParagraph.WriteString(text)
			}
		}
		
		pos = tagEnd + 1
	}
	
	return cleanupText(result.String())
}

// extractTextFromRTF 从 RTF 文件提取文本
func extractTextFromRTF(content []byte) (string, error) {
	var result strings.Builder
	text := string(content)
	
	inGroup := 0
	skipGroup := false
	i := 0
	
	for i < len(text) {
		ch := text[i]
		
		if ch == '{' {
			inGroup++
			// 检查是否是需要跳过的组（如 \fonttbl, \colortbl, \stylesheet 等）
			if i+1 < len(text) && text[i+1] == '\\' {
				rest := text[i+1:]
				if strings.HasPrefix(rest, "\\fonttbl") ||
					strings.HasPrefix(rest, "\\colortbl") ||
					strings.HasPrefix(rest, "\\stylesheet") ||
					strings.HasPrefix(rest, "\\info") ||
					strings.HasPrefix(rest, "\\*") {
					skipGroup = true
				}
			}
			i++
			continue
		}
		
		if ch == '}' {
			inGroup--
			if inGroup <= 1 {
				skipGroup = false
			}
			i++
			continue
		}
		
		if skipGroup {
			i++
			continue
		}
		
		if ch == '\\' {
			// 处理控制字
			i++
			if i >= len(text) {
				break
			}
			
			// 特殊字符
			switch text[i] {
			case '\\', '{', '}':
				result.WriteByte(text[i])
				i++
				continue
			case '\n', '\r':
				i++
				continue
			}
			
			// 读取控制字
			ctrlWord := strings.Builder{}
			for i < len(text) && ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z')) {
				ctrlWord.WriteByte(text[i])
				i++
			}
			
			// 跳过数字参数
			for i < len(text) && ((text[i] >= '0' && text[i] <= '9') || text[i] == '-') {
				i++
			}
			
			// 跳过可选空格
			if i < len(text) && text[i] == ' ' {
				i++
			}
			
			// 处理特定控制字
			word := ctrlWord.String()
			switch word {
			case "par", "line":
				result.WriteString("\n")
			case "tab":
				result.WriteString("\t")
			case "u": // Unicode 字符
				// 简化处理，跳过
			}
			continue
		}
		
		// 普通字符
		if ch >= 32 && ch < 127 {
			result.WriteByte(ch)
		}
		i++
	}
	
	return cleanupText(result.String()), nil
}

// extractTextFromOldDoc 从旧版 .doc (OLE) 文件提取文本
func extractTextFromOldDoc(content []byte) (string, error) {
	// OLE 格式比较复杂，这里使用简化方法：
	// 查找 WordDocument 流中的文本
	
	var result strings.Builder
	inText := false
	textStart := 0
	
	// 查找可能的文本区域（连续的可打印字符）
	for i := 0; i < len(content); i++ {
		b := content[i]
		
		// 检测 UTF-16LE 编码的文本（Word 常用）
		if i+1 < len(content) && content[i+1] == 0 && b >= 32 && b < 127 {
			if !inText {
				inText = true
				textStart = i
			}
		} else if inText {
			// 提取这段文本
			if i-textStart > 20 { // 至少 10 个字符
				for j := textStart; j < i; j += 2 {
					if j+1 < len(content) && content[j+1] == 0 && content[j] >= 32 && content[j] < 127 {
						result.WriteByte(content[j])
					}
				}
				result.WriteString("\n")
			}
			inText = false
		}
	}
	
	text := result.String()
	if len(strings.TrimSpace(text)) < 50 {
		// 回退到简单方法
		return extractVisibleText(content), nil
	}
	
	return cleanupText(text), nil
}

// extractTextFromWordXML 从 Word XML 中提取纯文本
// Word XML 使用 <w:t> 标签包含文本内容，<w:p> 表示段落
func extractTextFromWordXML(xmlContent string) string {
	var result strings.Builder
	var currentParagraph strings.Builder
	
	content := xmlContent
	pos := 0
	
	for pos < len(content) {
		// 查找下一个标签
		tagStart := strings.Index(content[pos:], "<")
		if tagStart == -1 {
			break
		}
		tagStart += pos
		
		tagEnd := strings.Index(content[tagStart:], ">")
		if tagEnd == -1 {
			break
		}
		tagEnd += tagStart
		
		tag := content[tagStart : tagEnd+1]
		
		// 处理段落结束标签 </w:p> - 添加换行
		if strings.HasPrefix(tag, "</w:p") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}
		
		// 处理表格行结束 </w:tr> - 添加换行
		if strings.HasPrefix(tag, "</w:tr") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}
		
		// 处理表格单元格结束 </w:tc> - 添加制表符分隔
		if strings.HasPrefix(tag, "</w:tc") {
			currentParagraph.WriteString("\t")
			pos = tagEnd + 1
			continue
		}
		
		// 处理换行标签 <w:br/>
		if strings.HasPrefix(tag, "<w:br") {
			currentParagraph.WriteString("\n")
			pos = tagEnd + 1
			continue
		}
		
		// 处理文本标签 <w:t> 或 <w:t ...>
		if strings.HasPrefix(tag, "<w:t>") || strings.HasPrefix(tag, "<w:t ") {
			// 找到 </w:t> 结束标签
			textStart := tagEnd + 1
			textEndTag := strings.Index(content[textStart:], "</w:t>")
			if textEndTag != -1 {
				textEnd := textStart + textEndTag
				text := content[textStart:textEnd]
				currentParagraph.WriteString(text)
				pos = textEnd + 6 // 跳过 </w:t>
				continue
			}
		}
		
		pos = tagEnd + 1
	}
	
	// 处理最后一个段落
	paragraphText := strings.TrimSpace(currentParagraph.String())
	if paragraphText != "" {
		result.WriteString(paragraphText)
		result.WriteString("\n")
	}
	
	text := result.String()
	
	// 如果没有提取到文本，尝试备用方法
	if strings.TrimSpace(text) == "" {
		return extractTextFallback(xmlContent)
	}
	
	// 清理多余的空行
	text = cleanupText(text)
	
	return text
}

// extractTextFallback 备用文本提取方法 - 只提取 <w:t> 标签内容
func extractTextFallback(xmlContent string) string {
	var result strings.Builder
	
	// 使用简单的状态机提取 <w:t>...</w:t> 之间的内容
	content := xmlContent
	for {
		// 查找 <w:t 开始
		idx := strings.Index(content, "<w:t")
		if idx == -1 {
			break
		}
		content = content[idx:]
		
		// 找到 > 
		endBracket := strings.Index(content, ">")
		if endBracket == -1 {
			break
		}
		
		// 找到 </w:t>
		closeTag := strings.Index(content[endBracket:], "</w:t>")
		if closeTag == -1 {
			content = content[endBracket+1:]
			continue
		}
		
		// 提取文本
		text := content[endBracket+1 : endBracket+closeTag]
		result.WriteString(text)
		
		content = content[endBracket+closeTag+6:]
	}
	
	return result.String()
}

// cleanupText 清理文本中的多余空白
func cleanupText(text string) string {
	// 统一换行符
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	
	// 合并连续空白
	lines := strings.Split(text, "\n")
	var cleanLines []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleanLines = append(cleanLines, line)
		}
	}
	
	return strings.Join(cleanLines, "\n")
}

// extractVisibleText 从二进制文件中提取可见文本
func extractVisibleText(content []byte) string {
	var result strings.Builder
	
	for _, b := range content {
		// 只保留可打印字符
		if b >= 32 && b < 127 {
			result.WriteByte(b)
		} else if b == '\n' || b == '\r' || b == '\t' {
			result.WriteByte(' ')
		}
	}
	
	// 清理结果
	text := result.String()
	// 移除连续空格
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}
	
	return strings.TrimSpace(text)
}

// extractTextFromPDF 从PDF文件提取文本
func extractTextFromPDF(content []byte) (string, error) {
	// PDF 文本提取比较复杂，这里提供简化实现
	// 生产环境建议使用专门的 PDF 库如 pdfcpu 或调用外部工具
	
	text := extractVisibleText(content)
	if len(text) < 100 {
		return "", fmt.Errorf("无法从PDF中提取足够的文本内容，请尝试复制文本后直接粘贴")
	}
	
	return text, nil
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

// ========== 异步任务处理 ==========

// processTaskAsync 异步处理审稿任务
func (s *Service) processTaskAsync(taskID uint) {
	// 获取任务
	var task PeerReviewTask
	if err := s.db.Where("id = ?", taskID).First(&task).Error; err != nil {
		fmt.Printf("[PeerReview] Task %d not found: %v\n", taskID, err)
		return
	}

	// 更新状态为处理中
	now := time.Now()
	s.updateTaskProgress(taskID, TaskStatusProcessing, 5, "开始处理")
	s.db.Model(&task).Update("started_at", now)

	// 创建一个用于收集审稿内容的 buffer
	var reviewBuffer strings.Builder

	// 执行审稿流程
	err := s.runTaskReview(&task, &reviewBuffer)
	
	if err != nil {
		s.updateTaskFailed(taskID, err.Error())
		return
	}

	// 保存审稿结果
	completedAt := time.Now()
	s.db.Model(&task).Updates(map[string]interface{}{
		"status":         TaskStatusCompleted,
		"progress":       100,
		"progress_stage": "审稿完成",
		"review_content": reviewBuffer.String(),
		"completed_at":   completedAt,
	})
}

// runTaskReview 执行审稿流程（内部方法）
func (s *Service) runTaskReview(task *PeerReviewTask, reviewWriter *strings.Builder) error {
	manuscriptText := task.ManuscriptText
	targetVenue := task.TargetVenue
	modelLevel := task.ModelLevel

	// 1. 提取稿件元信息 (10%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 10, "正在分析稿件结构...")
	meta, err := s.extractBasicInfo(manuscriptText, targetVenue, modelLevel)
	if err != nil {
		return fmt.Errorf("稿件分析失败: %w", err)
	}
	
	// 保存元信息和标题
	metaJSON, _ := json.Marshal(meta)
	s.db.Model(task).Updates(map[string]interface{}{
		"manuscript_meta": string(metaJSON),
		"title":           meta.Title,
	})

	// 2. 构建搜索查询 (15%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 15, "正在构建文献检索策略...")
	searchQueries := s.buildSemanticSearchQueries(meta)

	// 3. 调用MCP搜索文献 (35%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 25, "正在检索相关文献...")
	rawResults, err := s.callSemanticScholarSearch(searchQueries)
	if err != nil {
		return fmt.Errorf("文献检索失败: %w", err)
	}

	// 4. 整理文献 (40%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 40, "正在整理文献数据...")
	literatureContext := s.normalizeAndSelectPapers(rawResults)
	
	ctxJSON, _ := json.Marshal(literatureContext)
	s.db.Model(task).Update("literature_context", string(ctxJSON))

	// 5. 总结文献 (55%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 50, "正在生成文献总结...")
	literatureSummary, err := s.summarizeLiterature(literatureContext, meta, modelLevel)
	if err != nil {
		return fmt.Errorf("文献总结失败: %w", err)
	}
	
	summaryJSON, _ := json.Marshal(literatureSummary)
	s.db.Model(task).Update("literature_summary", string(summaryJSON))

	// 5.5 检索研究空白相关文献 (60%)
	if len(literatureSummary.TypicalGaps) > 0 {
		s.updateTaskProgress(task.ID, TaskStatusProcessing, 60, "正在检索研究空白相关文献...")
		gapLiteratures := s.searchGapLiterature(literatureSummary.TypicalGaps, meta.Field)
		if len(gapLiteratures) > 0 {
			gapJSON, _ := json.Marshal(gapLiteratures)
			s.db.Model(task).Update("gap_literature", string(gapJSON))
		}
	}

	// 6. 生成审稿报告 (65%-95%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 65, "正在生成审稿报告...")
	refs := s.buildReferenceList(literatureContext.AllPapers)
	
	// 使用非流式方式生成报告
	err = s.generateReviewForTask(manuscriptText, targetVenue, meta, literatureSummary, refs, modelLevel, reviewWriter, task.ID)
	if err != nil {
		return fmt.Errorf("审稿报告生成失败: %w", err)
	}

	// 7. 提取推荐意见 (98%)
	s.updateTaskProgress(task.ID, TaskStatusProcessing, 98, "正在整理审稿结果...")
	recommendation := extractRecommendation(reviewWriter.String())
	s.db.Model(task).Update("recommendation", recommendation)

	return nil
}

// generateReviewForTask 为任务生成审稿报告（非流式，但更新进度）
func (s *Service) generateReviewForTask(
	manuscriptText, targetVenue string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
) error {
	// 构建参考文献字符串
	refsStr := s.formatRefsForPrompt(refs)
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

	systemPrompt := getReviewSystemPrompt()
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		targetVenue,
		manuscriptText[:min(6000, len(manuscriptText))],
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr,
		targetVenue)

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	level := getModelLevel(modelLevel)
	
	// 最大续写轮数
	const maxContinuations = 5

	for round := 0; round < maxContinuations; round++ {
		progress := 70 + round*5
		if progress > 90 {
			progress = 90
		}
		s.updateTaskProgress(taskID, TaskStatusProcessing, progress, fmt.Sprintf("正在生成审稿报告（第 %d 轮）...", round+1))

		response, err := s.aiService.ChatCompletionWithTools(convertMessages(messages), nil, "", level)
		if err != nil {
			return err
		}

		if len(response.Choices) == 0 {
			return fmt.Errorf("no response from AI")
		}

		content := response.Choices[0].Message.Content
		writer.WriteString(content)

		// 检查是否需要继续
		if !s.needsContinuation(writer.String()) {
			break
		}

		messages = append(messages, Message{Role: "assistant", Content: content})
		messages = append(messages, Message{Role: "user", Content: "请继续完成审稿报告，从上次中断的地方继续。"})
	}

	return nil
}

// Message 简化的消息类型（内部使用）
type Message struct {
	Role    string
	Content string
}

// convertMessages 转换消息类型为 ai.ChatMessage
func convertMessages(msgs []Message) []ai.ChatMessage {
	result := make([]ai.ChatMessage, len(msgs))
	for i, m := range msgs {
		result[i] = ai.ChatMessage{Role: m.Role, Content: m.Content}
	}
	return result
}

// updateTaskProgress 更新任务进度
func (s *Service) updateTaskProgress(taskID uint, status string, progress int, stage string) {
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
		"status":         status,
		"progress":       progress,
		"progress_stage": stage,
	})
}

// updateTaskFailed 更新任务失败状态
func (s *Service) updateTaskFailed(taskID uint, errMsg string) {
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
		"status":        TaskStatusFailed,
		"error_message": errMsg,
	})
}

// extractRecommendation 从审稿报告中提取推荐意见
func extractRecommendation(content string) string {
	content = strings.ToLower(content)
	
	if strings.Contains(content, "reject") || strings.Contains(content, "拒稿") {
		return "Reject"
	}
	if strings.Contains(content, "major revision") || strings.Contains(content, "大修") {
		return "Major Revision"
	}
	if strings.Contains(content, "minor revision") || strings.Contains(content, "小修") {
		return "Minor Revision"
	}
	if strings.Contains(content, "accept") || strings.Contains(content, "接受") {
		return "Accept"
	}
	
	return "Pending Review"
}

// getReviewSystemPrompt 获取审稿系统提示词
func getReviewSystemPrompt() string {
	return `## 角色：严苛、精准且富有洞察的学术审稿人

你是一位以"严苛、精准、富有洞察力"而闻名的资深学术审稿专家。你坚守最高的学术标准，你的首要任务是**严格审查（Strict Scrutiny）**，以确保只有最高质量的研究得以推进。

## 重要约束：
1. **引用文献时必须使用 [R1], [R2] 等编号**
2. **不得虚构任何文献或作者**
3. **批评必须具体、可操作**
4. **使用Markdown格式输出**`
}

// getReviewUserPromptTemplate 获取用户提示词模板
func getReviewUserPromptTemplate() string {
	return `## 投稿目标
**目标期刊/会议**：%s

## 待审稿件内容
%s

## 系统预分析信息

### 稿件结构化理解
%s

### 领域前沿状态
%s

### 与稿件最相似的已发表论文
%s

### 当前领域研究空白
%s

### 可引用的参考文献列表
%s

---

请生成一份专业的审稿报告，包含：
1. 综合评估与推荐（契合度评估、推荐意见）
2. 必须解决的核心问题（Critical/Major级别问题）
3. 其他改进建议

**本稿推荐**需明确给出：Accept / Minor Revision / Major Revision / Reject

目标期刊：%s`
}

// 确保导入被使用
var (
	_ = os.PathSeparator
	_ = filepath.Separator
)
