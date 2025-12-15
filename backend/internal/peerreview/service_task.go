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
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
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

	// 加载关联的文件
	s.loadTaskFiles(&draft)

	// 构建响应
	return s.buildDraftResponse(&draft), nil
}

// loadTaskFiles 加载任务关联的文件
func (s *Service) loadTaskFiles(task *PeerReviewTask) {
	// 加载主稿件文件
	if task.ManuscriptFileID != nil {
		var file PeerReviewFile
		if err := s.db.First(&file, *task.ManuscriptFileID).Error; err == nil {
			task.ManuscriptFile = &file
		}
	}

	// 加载附件
	var attachments []PeerReviewFile
	s.db.Where("task_id = ? AND file_role = ?", task.ID, FileRoleAttachment).
		Order("sort_order ASC").
		Find(&attachments)
	task.Attachments = attachments

	// 加载审稿结果
	var reviews []PeerReviewResult
	s.db.Where("task_id = ?", task.ID).Order("reviewer_index ASC").Find(&reviews)
	task.Reviews = reviews
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

	// 加载关联文件
	s.loadTaskFiles(&draft)

	return s.buildDraftResponse(&draft), nil
}

// SubmitDraft 提交草稿开始审稿（三审制）
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

	// 加载关联文件
	s.loadTaskFiles(&draft)

	// 验证草稿内容
	hasManuscriptFile := draft.ManuscriptFileID != nil
	hasManuscriptText := len(draft.ManuscriptText) >= 100

	if !hasManuscriptFile && !hasManuscriptText {
		return nil, fmt.Errorf("请上传稿件文件或输入稿件内容（至少100字）")
	}

	// 如果有主稿件文件，验证文件存在
	if hasManuscriptFile {
		var file PeerReviewFile
		if err := s.db.First(&file, *draft.ManuscriptFileID).Error; err != nil {
			return nil, fmt.Errorf("稿件文件记录不存在，请重新上传")
		}
		if _, err := os.Stat(file.FilePath); os.IsNotExist(err) {
			return nil, fmt.Errorf("稿件文件已丢失，请重新上传")
		}
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
	hashInput := draft.ManuscriptText
	if hasManuscriptFile {
		var file PeerReviewFile
		s.db.First(&file, *draft.ManuscriptFileID)
		hashInput = fmt.Sprintf("FILE:%s:%d:%s", file.FileName, file.FileSize, draft.ManuscriptText)
	}
	draft.ContentHash = generateManuscriptHash(hashInput, draft.TargetVenue)

	// 更新状态为待处理
	now := time.Now()
	draft.Status = TaskStatusPending
	draft.Progress = 0
	draft.ProgressStage = "等待处理"
	draft.SubmittedAt = &now
	draft.StartedAt = &now

	if err := s.db.Save(&draft).Error; err != nil {
		return nil, fmt.Errorf("提交草稿失败: %w", err)
	}

	// 创建三个审稿结果记录
	for i := 1; i <= ReviewerCount; i++ {
		result := PeerReviewResult{
			TaskID:        draft.ID,
			ReviewerIndex: i,
			Status:        TaskStatusPending,
			Progress:      0,
		}
		s.db.Create(&result)
	}

	// 启动异步处理（三审并行）
	go s.processTaskAsyncWithThreeReviewers(draft.ID)

	return &draft, nil
}

// ParseFileAndSaveToDraft 解析文件并保存到草稿
// 文件类型处理策略：
// - PDF：直接传递文件给 AI（支持视觉内容）
// - Word/RTF/ODT/XML/HTML 等文档：上传时提取文本，检查字符限制（最大 50000），以文本模式传给 AI
func (s *Service) ParseFileAndSaveToDraft(userID uint, fileName string, fileExt string, content []byte) (*UploadFileResponse, error) {
	// 验证文件大小（最大10MB）
	const maxFileSize = 10 * 1024 * 1024
	if len(content) > maxFileSize {
		return nil, fmt.Errorf("文件大小超出限制，最大支持10MB")
	}

	// 只有 PDF 才直接传递文件给 AI，其他格式都需要提取文本
	useFileInput := fileExt == ".pdf"
	
	var extractedText string
	var err error

	if useFileInput {
		// PDF 文件：验证文件头，不提取文本，直接保存文件传给 AI
		if len(content) < 4 || string(content[:4]) != "%PDF" {
			return nil, fmt.Errorf("无效的PDF文件格式")
		}
		extractedText = ""
	} else {
		// 其他格式（Word/RTF/ODT/XML/HTML/TXT）：提取文本内容
		// 验证 Word 文件头（如果是 doc/docx）
		if fileExt == ".doc" || fileExt == ".docx" {
			if len(content) < 4 {
				return nil, fmt.Errorf("无效的Word文件格式")
			}
			isZip := content[0] == 0x50 && content[1] == 0x4B  // PK (docx)
			isOLE := content[0] == 0xD0 && content[1] == 0xCF  // OLE (doc)
			if !isZip && !isOLE {
				return nil, fmt.Errorf("无效的Word文件格式")
			}
		}

		// 根据文件类型提取文本
		switch fileExt {
		case ".txt":
			extractedText, err = extractTextFromTXT(content)
		case ".doc", ".docx", ".rtf", ".odt":
			extractedText, err = extractTextFromWord(content, fileExt)
		case ".xml":
			extractedText, err = extractTextFromXML(content)
		case ".html", ".htm":
			extractedText, err = extractTextFromHTML(content)
		default:
			return nil, fmt.Errorf("不支持的文件类型: %s", fileExt)
		}

		if err != nil {
			return nil, fmt.Errorf("提取文本失败: %w", err)
		}

		if len(extractedText) < 50 {
			return nil, fmt.Errorf("文件内容太少或无法识别，请确保文件包含有效内容")
		}

		// 验证提取内容长度（最大5万字符）
		const maxManuscriptLength = 50000
		if len(extractedText) > maxManuscriptLength {
			return nil, fmt.Errorf("文件内容超出长度限制，最多支持%d个字符，当前文件包含%d个字符", maxManuscriptLength, len(extractedText))
		}
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

	// 确定处理模式
	extWithoutDot := strings.TrimPrefix(fileExt, ".")
	processMode := GetProcessMode(extWithoutDot)

	// 创建文件记录
	file := PeerReviewFile{
		UserID:        userID,
		FileName:      fileName,
		FileExt:       extWithoutDot,
		FileSize:      int64(len(content)),
		FilePath:      filePath,
		MimeType:      GetMimeType(extWithoutDot),
		ProcessMode:   processMode,
		ExtractedText: extractedText,
		ProcessStatus: "processed",
		FileRole:      FileRoleManuscript,
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

	// 如果之前有关联的主稿件文件，删除旧文件
	if draft.ManuscriptFileID != nil {
		var oldFile PeerReviewFile
		if err := s.db.First(&oldFile, *draft.ManuscriptFileID).Error; err == nil {
			os.Remove(oldFile.FilePath)
			s.db.Delete(&oldFile)
		}
	}

	// 更新草稿内容
	draft.InputType = InputTypeFile
	draft.ManuscriptText = extractedText
	draft.ManuscriptFileID = &file.ID
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
	var preview string
	if processMode == ProcessModeDirect {
		preview = fmt.Sprintf("[%s] %.2f MB - 将直接传递给AI", fileName, float64(len(content))/(1024*1024))
	} else {
		preview = truncateString(extractedText, 500)
	}

	return &UploadFileResponse{
		FileID:         file.ID,
		FileName:       fileName,
		FileExt:        extWithoutDot,
		FileSize:       int64(len(content)),
		ProcessMode:    processMode,
		ContentPreview: preview,
	}, nil
}

// AddAttachmentToDraft 添加附件到草稿
// 附件处理策略：
// - PDF/图片：直接传递文件给 AI
// - Word/RTF/ODT/XML/HTML/TXT：提取文字，超过 50000 字符自动截取
func (s *Service) AddAttachmentToDraft(userID uint, fileName string, fileExt string, content []byte) (*FileInfo, error) {
	// 获取或创建草稿
	draft, err := s.GetOrCreateDraft(userID)
	if err != nil {
		return nil, fmt.Errorf("获取草稿失败: %w", err)
	}

	// 检查附件数量限制
	var attachmentCount int64
	s.db.Model(&PeerReviewFile{}).Where("task_id = ? AND file_role = ?", draft.ID, FileRoleAttachment).Count(&attachmentCount)
	if attachmentCount >= MaxAttachments {
		return nil, fmt.Errorf("附件数量已达上限（最多%d个）", MaxAttachments)
	}

	// 判断处理模式：只有 PDF 和图片直接传递，其他格式提取文本
	extWithoutDot := strings.TrimPrefix(fileExt, ".")
	processMode := GetProcessMode(extWithoutDot)
	
	var extractedText string
	
	// 对于非直传模式的附件，提取文本内容
	if processMode == ProcessModeExtract {
		switch fileExt {
		case ".txt":
			extractedText, err = extractTextFromTXT(content)
		case ".doc", ".docx", ".rtf", ".odt":
			extractedText, err = extractTextFromWord(content, fileExt)
		case ".xml":
			extractedText, err = extractTextFromXML(content)
		case ".html", ".htm":
			extractedText, err = extractTextFromHTML(content)
		case ".csv":
			extractedText = string(content) // CSV 直接作为文本
		default:
			// 代码文件等直接作为文本
			extractedText = string(content)
		}
		
		if err != nil {
			return nil, fmt.Errorf("提取附件文本失败: %w", err)
		}
		
		// 附件文本超过 50000 字符时自动截取（不报错）
		const maxAttachmentLength = 50000
		if len(extractedText) > maxAttachmentLength {
			extractedText = extractedText[:maxAttachmentLength]
			fmt.Printf("[PeerReview] Attachment text truncated to %d chars: %s\n", maxAttachmentLength, fileName)
		}
	}

	// 保存附件文件到磁盘
	uploadDir := filepath.Join(s.uploadPath, "peer-review-attachments", fmt.Sprintf("user_%d", userID))
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("创建目录失败: %w", err)
	}

	// 生成唯一文件名
	uniqueFileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), fileName)
	filePath := filepath.Join(uploadDir, uniqueFileName)

	// 写入文件
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return nil, fmt.Errorf("保存文件失败: %w", err)
	}

	// 获取当前最大排序号
	var maxSortOrder int
	s.db.Model(&PeerReviewFile{}).Where("task_id = ? AND file_role = ?", draft.ID, FileRoleAttachment).
		Select("COALESCE(MAX(sort_order), 0)").Scan(&maxSortOrder)

	// 获取 MIME 类型
	mimeType := getMimeType(fileExt)

	// 创建附件记录
	attachment := &PeerReviewFile{
		TaskID:        &draft.ID,
		UserID:        userID,
		FileRole:      FileRoleAttachment,
		SortOrder:     maxSortOrder + 1,
		FileName:      fileName,
		FileExt:       extWithoutDot,
		FileSize:      int64(len(content)),
		FilePath:      filePath,
		MimeType:      mimeType,
		ProcessMode:   processMode,
		ExtractedText: extractedText, // 存储提取的文本
		ProcessStatus: "processed",
	}

	if err := s.db.Create(attachment).Error; err != nil {
		// 删除已保存的文件
		os.Remove(filePath)
		return nil, fmt.Errorf("保存附件记录失败: %w", err)
	}

	return &FileInfo{
		ID:            attachment.ID,
		FileName:      attachment.FileName,
		FileExt:       attachment.FileExt,
		FileSize:      attachment.FileSize,
		ProcessMode:   attachment.ProcessMode,
		ProcessStatus: attachment.ProcessStatus,
	}, nil
}

// DeleteManuscriptFromDraft 从草稿删除主稿件文件
func (s *Service) DeleteManuscriptFromDraft(userID uint) error {
	// 查找用户的草稿任务
	var draft PeerReviewTask
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil // 没有草稿，直接返回成功
		}
		return err
	}

	// 如果没有关联的主稿件文件，直接返回
	if draft.ManuscriptFileID == nil {
		return nil
	}

	// 查找并删除主稿件文件
	var file PeerReviewFile
	if err := s.db.First(&file, *draft.ManuscriptFileID).Error; err == nil {
		// 删除磁盘文件
		if file.FilePath != "" {
			os.Remove(file.FilePath)
		}
		// 删除数据库记录
		s.db.Delete(&file)
	}

	// 更新草稿，清除文件关联
	draft.ManuscriptFileID = nil
	draft.InputType = InputTypeText
	draft.ManuscriptText = ""
	draft.Title = ""
	if err := s.db.Save(&draft).Error; err != nil {
		return fmt.Errorf("更新草稿失败: %w", err)
	}

	return nil
}

// ClearDraft 清空草稿（删除主稿件和所有附件）
func (s *Service) ClearDraft(userID uint) error {
	// 查找用户的草稿任务
	var draft PeerReviewTask
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil // 没有草稿，直接返回成功
		}
		return err
	}

	// 删除主稿件文件
	if draft.ManuscriptFileID != nil {
		var file PeerReviewFile
		if err := s.db.First(&file, *draft.ManuscriptFileID).Error; err == nil {
			if file.FilePath != "" {
				os.Remove(file.FilePath)
			}
			s.db.Delete(&file)
		}
	}

	// 删除所有附件
	var attachments []PeerReviewFile
	s.db.Where("task_id = ? AND file_role = ?", draft.ID, FileRoleAttachment).Find(&attachments)
	for _, att := range attachments {
		if att.FilePath != "" {
			os.Remove(att.FilePath)
		}
		s.db.Delete(&att)
	}

	// 重置草稿内容
	draft.ManuscriptFileID = nil
	draft.InputType = InputTypeText
	draft.ManuscriptText = ""
	draft.Title = ""
	draft.TargetVenue = ""
	// 保留 model_level，不重置
	if err := s.db.Save(&draft).Error; err != nil {
		return fmt.Errorf("重置草稿失败: %w", err)
	}

	return nil
}

// DeleteAttachmentFromDraft 从草稿删除附件
func (s *Service) DeleteAttachmentFromDraft(userID uint, attachmentID uint) error {
	// 查找附件
	var attachment PeerReviewFile
	err := s.db.Where("id = ? AND user_id = ? AND file_role = ?", attachmentID, userID, FileRoleAttachment).First(&attachment).Error
	if err != nil {
		return fmt.Errorf("附件不存在")
	}

	// 检查附件是否属于草稿状态的任务
	if attachment.TaskID != nil {
		var task PeerReviewTask
		if err := s.db.First(&task, *attachment.TaskID).Error; err == nil {
			if task.Status != TaskStatusDraft {
				return fmt.Errorf("只能删除草稿中的附件")
			}
		}
	}

	// 删除文件
	if attachment.FilePath != "" {
		os.Remove(attachment.FilePath)
	}

	// 删除数据库记录
	if err := s.db.Delete(&attachment).Error; err != nil {
		return fmt.Errorf("删除附件失败: %w", err)
	}

	return nil
}

// getMimeType 根据文件扩展名获取 MIME 类型
func getMimeType(fileExt string) string {
	mimeTypes := map[string]string{
		".txt":  "text/plain",
		".doc":  "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".pdf":  "application/pdf",
		".rtf":  "application/rtf",
		".odt":  "application/vnd.oasis.opendocument.text",
		".xml":  "application/xml",
		".html": "text/html",
		".htm":  "text/html",
		".xls":  "application/vnd.ms-excel",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".csv":  "text/csv",
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
	}
	if mime, ok := mimeTypes[fileExt]; ok {
		return mime
	}
	return "application/octet-stream"
}

// buildDraftResponse 构建草稿响应
func (s *Service) buildDraftResponse(draft *PeerReviewTask) *DraftResponse {
	preview := ""
	if len(draft.ManuscriptText) > 500 {
		preview = draft.ManuscriptText[:500] + "..."
	} else {
		preview = draft.ManuscriptText
	}

	resp := &DraftResponse{
		ID:             draft.ID,
		InputType:      draft.InputType,
		ManuscriptText: draft.ManuscriptText,
		TargetVenue:    draft.TargetVenue,
		ModelLevel:     draft.ModelLevel,
		ContentPreview: preview,
	}

	// 添加主稿件文件信息
	if draft.ManuscriptFile != nil {
		resp.ManuscriptFile = &FileInfo{
			ID:            draft.ManuscriptFile.ID,
			FileName:      draft.ManuscriptFile.FileName,
			FileExt:       draft.ManuscriptFile.FileExt,
			FileSize:      draft.ManuscriptFile.FileSize,
			ProcessMode:   draft.ManuscriptFile.ProcessMode,
			ProcessStatus: draft.ManuscriptFile.ProcessStatus,
		}
	}

	// 添加附件信息
	if len(draft.Attachments) > 0 {
		resp.Attachments = make([]FileInfo, len(draft.Attachments))
		for i, att := range draft.Attachments {
			resp.Attachments[i] = FileInfo{
				ID:            att.ID,
				FileName:      att.FileName,
				FileExt:       att.FileExt,
				FileSize:      att.FileSize,
				ProcessMode:   att.ProcessMode,
				ProcessStatus: att.ProcessStatus,
			}
		}
	}

	return resp
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
	contentHash := generateManuscriptHash(manuscriptText, req.TargetVenue)

	// 提取标题（简单方式：取前100字符或第一行）
	title := extractTitle(manuscriptText)

	// 创建任务
	task := &PeerReviewTask{
		UserID:         userID,
		InputType:      req.InputType,
		ManuscriptText: manuscriptText,
		ContentHash:    contentHash,
		Title:          title,
		TargetVenue:    req.TargetVenue,
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

	// 排除草稿状态的任务
	query := s.db.Model(&PeerReviewTask{}).Where("user_id = ? AND status != ?", userID, TaskStatusDraft)
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
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&tasks).Error; err != nil {
		return nil, err
	}

	// 转换为摘要
	summaries := make([]TaskSummary, len(tasks))
	for i, t := range tasks {
		// 统计附件数量
		var attachmentCount int64
		s.db.Model(&PeerReviewFile{}).Where("task_id = ? AND file_role = ?", t.ID, FileRoleAttachment).Count(&attachmentCount)
		
		// 使用提交时间作为显示时间，如果没有提交时间则使用创建时间
		displayTime := t.CreatedAt
		if t.SubmittedAt != nil {
			displayTime = *t.SubmittedAt
		}
		
		// 获取主稿件文件信息
		var fileName, fileExt string
		if t.ManuscriptFileID != nil {
			var file PeerReviewFile
			if err := s.db.First(&file, *t.ManuscriptFileID).Error; err == nil {
				fileName = file.FileName
				fileExt = file.FileExt
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
			TargetVenue:         t.TargetVenue,
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

// GetTaskDetail 获取任务详情
func (s *Service) GetTaskDetail(userID uint, taskID uint) (*TaskDetailResponse, error) {
	var task PeerReviewTask
	if err := s.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("任务不存在")
		}
		return nil, err
	}

	// 加载关联数据
	s.loadTaskFiles(&task)

	response := &TaskDetailResponse{
		ID:                  task.ID,
		Title:               task.Title,
		InputType:           task.InputType,
		TargetVenue:         task.TargetVenue,
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
	if err := s.db.First(&file, fileID).Error; err != nil {
		return nil, "", fmt.Errorf("文件不存在")
	}
	
	// 验证用户权限：文件必须属于用户的任务
	if file.TaskID != nil {
		var task PeerReviewTask
		if err := s.db.Where("id = ? AND user_id = ?", *file.TaskID, userID).First(&task).Error; err != nil {
			return nil, "", fmt.Errorf("无权访问此文件")
		}
	} else if file.UserID != userID {
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

// runTaskPipeline 异步执行审稿任务（带异常恢复）
// 使用三审并行流程
func (s *Service) runTaskPipeline(taskID uint, userID uint, modelLevel string) {
	// 直接调用三审流程
	s.processTaskAsyncWithThreeReviewers(taskID)
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

// extractTextFromXML 从XML文件提取文本（去除标签）
func extractTextFromXML(content []byte) (string, error) {
	text := string(content)
	
	// 移除 XML 声明
	xmlDeclPattern := regexp.MustCompile(`<\?xml[^?]*\?>`)
	text = xmlDeclPattern.ReplaceAllString(text, "")
	
	// 移除 CDATA 标记但保留内容
	cdataPattern := regexp.MustCompile(`<!\[CDATA\[(.*?)\]\]>`)
	text = cdataPattern.ReplaceAllString(text, "$1")
	
	// 移除注释
	commentPattern := regexp.MustCompile(`<!--[\s\S]*?-->`)
	text = commentPattern.ReplaceAllString(text, "")
	
	// 移除所有 XML 标签
	tagPattern := regexp.MustCompile(`<[^>]+>`)
	text = tagPattern.ReplaceAllString(text, " ")
	
	// 解码常见的 XML 实体
	text = decodeXMLEntities(text)
	
	// 清理多余空白
	text = cleanupWhitespace(text)
	
	return text, nil
}

// extractTextFromHTML 从HTML文件提取文本（去除标签和脚本）
func extractTextFromHTML(content []byte) (string, error) {
	text := string(content)
	
	// 移除 DOCTYPE 声明
	doctypePattern := regexp.MustCompile(`<!DOCTYPE[^>]*>`)
	text = doctypePattern.ReplaceAllString(text, "")
	
	// 移除 script 标签及其内容
	scriptPattern := regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
	text = scriptPattern.ReplaceAllString(text, "")
	
	// 移除 style 标签及其内容
	stylePattern := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
	text = stylePattern.ReplaceAllString(text, "")
	
	// 移除 noscript 标签及其内容
	noscriptPattern := regexp.MustCompile(`(?i)<noscript[^>]*>[\s\S]*?</noscript>`)
	text = noscriptPattern.ReplaceAllString(text, "")
	
	// 移除注释
	commentPattern := regexp.MustCompile(`<!--[\s\S]*?-->`)
	text = commentPattern.ReplaceAllString(text, "")
	
	// 将块级元素替换为换行（保持段落结构）
	blockTags := []string{"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", 
		"li", "tr", "td", "th", "article", "section", "header", "footer", "aside", "nav"}
	for _, tag := range blockTags {
		// 处理开始标签
		openPattern := regexp.MustCompile(`(?i)<` + tag + `[^>]*>`)
		text = openPattern.ReplaceAllString(text, "\n")
		// 处理结束标签
		closePattern := regexp.MustCompile(`(?i)</` + tag + `>`)
		text = closePattern.ReplaceAllString(text, "\n")
	}
	
	// 移除所有剩余的 HTML 标签
	tagPattern := regexp.MustCompile(`<[^>]+>`)
	text = tagPattern.ReplaceAllString(text, " ")
	
	// 解码 HTML 实体
	text = decodeHTMLEntities(text)
	
	// 清理多余空白
	text = cleanupWhitespace(text)
	
	return text, nil
}

// decodeXMLEntities 解码 XML 实体
func decodeXMLEntities(text string) string {
	replacements := map[string]string{
		"&lt;":   "<",
		"&gt;":   ">",
		"&amp;":  "&",
		"&apos;": "'",
		"&quot;": "\"",
	}
	for entity, char := range replacements {
		text = strings.ReplaceAll(text, entity, char)
	}
	
	// 解码数字实体 &#xxx; 和 &#xXXX;
	numEntityPattern := regexp.MustCompile(`&#(\d+);`)
	text = numEntityPattern.ReplaceAllStringFunc(text, func(match string) string {
		numStr := match[2 : len(match)-1]
		if num, err := strconv.Atoi(numStr); err == nil && num < 65536 {
			return string(rune(num))
		}
		return match
	})
	
	hexEntityPattern := regexp.MustCompile(`(?i)&#x([0-9a-f]+);`)
	text = hexEntityPattern.ReplaceAllStringFunc(text, func(match string) string {
		hexStr := match[3 : len(match)-1]
		if num, err := strconv.ParseInt(hexStr, 16, 32); err == nil && num < 65536 {
			return string(rune(num))
		}
		return match
	})
	
	return text
}

// decodeHTMLEntities 解码 HTML 实体
func decodeHTMLEntities(text string) string {
	// 首先处理 XML 基本实体
	text = decodeXMLEntities(text)
	
	// 常见 HTML 实体
	htmlEntities := map[string]string{
		"&nbsp;":   " ",
		"&ensp;":   " ",
		"&emsp;":   " ",
		"&thinsp;": " ",
		"&ndash;":  "\u2013", // –
		"&mdash;":  "\u2014", // —
		"&lsquo;":  "\u2018", // '
		"&rsquo;":  "\u2019", // '
		"&ldquo;":  "\u201C", // "
		"&rdquo;":  "\u201D", // "
		"&bull;":   "\u2022", // •
		"&hellip;": "\u2026", // …
		"&copy;":   "\u00A9", // ©
		"&reg;":    "\u00AE", // ®
		"&trade;":  "\u2122", // ™
		"&deg;":    "\u00B0", // °
		"&plusmn;": "\u00B1", // ±
		"&times;":  "\u00D7", // ×
		"&divide;": "\u00F7", // ÷
		"&frac12;": "\u00BD", // ½
		"&frac14;": "\u00BC", // ¼
		"&frac34;": "\u00BE", // ¾
		"&euro;":   "\u20AC", // €
		"&pound;":  "\u00A3", // £
		"&yen;":    "\u00A5", // ¥
		"&cent;":   "\u00A2", // ¢
		"&alpha;":  "\u03B1", // α
		"&beta;":   "\u03B2", // β
		"&gamma;":  "\u03B3", // γ
		"&delta;":  "\u03B4", // δ
		"&pi;":     "\u03C0", // π
		"&sigma;":  "\u03C3", // σ
		"&omega;":  "\u03C9", // ω
	}
	for entity, char := range htmlEntities {
		text = strings.ReplaceAll(text, entity, char)
	}
	
	return text
}

// cleanupWhitespace 清理多余的空白字符
func cleanupWhitespace(text string) string {
	// 将多个空格替换为单个空格
	spacePattern := regexp.MustCompile(`[ \t]+`)
	text = spacePattern.ReplaceAllString(text, " ")
	
	// 将多个换行替换为最多两个换行
	newlinePattern := regexp.MustCompile(`\n{3,}`)
	text = newlinePattern.ReplaceAllString(text, "\n\n")
	
	// 移除行首行尾空格
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	text = strings.Join(lines, "\n")
	
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

// processTaskAsyncWithThreeReviewers 三审并行处理任务
func (s *Service) processTaskAsyncWithThreeReviewers(taskID uint) {
	defer func() {
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("任务处理发生异常: %v", r)
			s.updateTaskFailed(taskID, errMsg)
		}
	}()

	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		fmt.Printf("[PeerReview] ERROR: Failed to find task: taskID=%d, error=%v\n", taskID, err)
		return
	}

	fmt.Printf("[PeerReview] processTaskAsync started: taskID=%d, inputType=%s, modelLevel=%s\n", 
		taskID, task.InputType, task.ModelLevel)

	// 更新状态为处理中
	now := time.Now()
	s.updateTaskProgress(taskID, TaskStatusProcessing, 5, "开始处理")
	s.db.Model(&task).Update("started_at", now)

	// 加载关联文件
	s.loadTaskFiles(&task)
	
	if task.ManuscriptFile != nil {
		fmt.Printf("[PeerReview] Manuscript file loaded: taskID=%d, fileName=%s, processMode=%s, filePath=%s\n", 
			taskID, task.ManuscriptFile.FileName, task.ManuscriptFile.ProcessMode, task.ManuscriptFile.FilePath)
	} else {
		fmt.Printf("[PeerReview] No manuscript file, using text mode: taskID=%d, textLength=%d\n", 
			taskID, len(task.ManuscriptText))
	}

	// 1. 预处理阶段（共享）：提取元信息、检索文献 (5%-50%)
	fmt.Printf("[PeerReview] Starting preprocessing: taskID=%d\n", taskID)
	meta, literatureSummary, refs, err := s.preprocessTask(&task)
	if err != nil {
		fmt.Printf("[PeerReview] ERROR: Preprocessing failed: taskID=%d, error=%v\n", taskID, err)
		s.updateTaskFailed(taskID, err.Error())
		return
	}
	fmt.Printf("[PeerReview] Preprocessing completed: taskID=%d, metaTitle=%s, refsCount=%d\n", 
		taskID, meta.Title, len(refs))

	// 2. 三审并行阶段 (50%-90%)
	s.updateTaskProgress(taskID, TaskStatusProcessing, 50, "三位审稿人并行审稿中...")
	fmt.Printf("[PeerReview] Starting parallel review: taskID=%d\n", taskID)

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

			// 创建带超时的上下文
			ctx, cancel := context.WithTimeout(context.Background(), reviewerTimeout)
			defer cancel()

			// 使用 channel 来监控审稿完成
			done := make(chan struct{})
			go func() {
				s.runSingleReview(&task, idx+1, meta, literatureSummary, refs, reviewResults[idx])
				close(done)
			}()

			// 等待完成或超时
			select {
			case <-done:
				// 正常完成
			case <-ctx.Done():
				// 超时处理
				reviewErrors[idx] = fmt.Errorf("审稿人 %d 审稿超时（超过 %v）", idx+1, reviewerTimeout)
				// 更新该审稿人状态为超时
				s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, idx+1).
					Updates(map[string]interface{}{
						"status":        TaskStatusFailed,
						"error_message": reviewErrors[idx].Error(),
					})
			}
		}(i)
	}

	wg.Wait()
	fmt.Printf("[PeerReview] All reviewers finished: taskID=%d\n", taskID)

	// 检查是否有审稿人超时
	timeoutCount := 0
	for idx, err := range reviewErrors {
		if err != nil {
			timeoutCount++
			fmt.Printf("[PeerReview] Reviewer %d timeout/error: taskID=%d, error=%v\n", idx+1, taskID, err)
		}
	}
	
	// 检查每个审稿人的结果长度
	for idx, result := range reviewResults {
		fmt.Printf("[PeerReview] Reviewer %d result: taskID=%d, contentLength=%d\n", idx+1, taskID, result.Len())
	}
	
	// 如果全部超时，标记任务失败
	if timeoutCount == ReviewerCount {
		fmt.Printf("[PeerReview] ERROR: All reviewers timeout: taskID=%d\n", taskID)
		s.updateTaskFailed(taskID, "所有审稿人均超时，请重试")
		return
	}

	// 3. 汇总阶段 (90%-100%)
	fmt.Printf("[PeerReview] Starting summarization: taskID=%d\n", taskID)
	s.updateTaskProgress(taskID, TaskStatusProcessing, 90, "汇总审稿结果...")
	s.summarizeReviews(taskID, reviewResults)

	// 4. 扣费（审稿完成后扣费）
	s.deductForCompletedReview(taskID, task.UserID, task.ModelLevel)

	// 完成
	completedAt := time.Now()
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
		"status":         TaskStatusCompleted,
		"progress":       100,
		"progress_stage": "审稿完成",
		"completed_at":   completedAt,
	})
	fmt.Printf("[PeerReview] Task completed: taskID=%d\n", taskID)
}

// getBizTypeForPeerReview 根据模型级别获取业务类型
func (s *Service) getBizTypeForPeerReview(modelLevel string) string {
	if modelLevel == "high" {
		return "peer_review_high"
	}
	return "peer_review_mid" // AI审稿只有 mid 和 high 两个级别，默认 mid
}

// deductForCompletedReview 审稿完成后扣费（使用统一扣费方法）
func (s *Service) deductForCompletedReview(taskID uint, userID uint, modelLevel string) {
	if s.currencyService == nil {
		fmt.Printf("[PeerReview] Currency service not configured, skipping deduction: taskID=%d\n", taskID)
		return
	}

	bizType := s.getBizTypeForPeerReview(modelLevel)
	bizID := fmt.Sprintf("peer_review_%d", taskID)
	ctx := context.Background()

	// 使用统一的扣费方法
	_, err := s.currencyService.DeductByBizType(ctx, userID, bizType, bizID)
	if err != nil {
		// 扣费失败只记录日志，不影响审稿结果
		fmt.Printf("[PeerReview] Failed to deduct for task %d: %v\n", taskID, err)
	} else {
		fmt.Printf("[PeerReview] Successfully deducted for task %d, bizType=%s\n", taskID, bizType)
	}
}

// preprocessTask 预处理任务（提取元信息、检索文献）
func (s *Service) preprocessTask(task *PeerReviewTask) (*ManuscriptMeta, *LiteratureSummary, []ReferenceForReviewer, error) {
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
		fmt.Printf("[PeerReview] Using PDF direct mode for preprocessing: taskID=%d, fileName=%s\n", task.ID, task.ManuscriptFile.FileName)
		fileContent, readErr := os.ReadFile(task.ManuscriptFile.FilePath)
		if readErr != nil {
			return nil, nil, nil, fmt.Errorf("读取文件失败: %w", readErr)
		}
		fileBase64 := base64.StdEncoding.EncodeToString(fileContent)
		mimeType := task.ManuscriptFile.MimeType
		if mimeType == "" {
			mimeType = GetMimeType(task.ManuscriptFile.FileExt)
		}
		meta, err = s.extractBasicInfoFromFile(fileBase64, task.ManuscriptFile.FileName, mimeType, task.TargetVenue, modelLevel)
	} else {
		// 文本模式：使用上传时提取的文本或用户直接输入的文本
		manuscriptText := task.ManuscriptText
		// 如果有主稿件文件，使用其提取的文本（Word/RTF/ODT/XML/HTML/TXT 在上传时已提取）
		if task.ManuscriptFile != nil && task.ManuscriptFile.ExtractedText != "" {
			manuscriptText = task.ManuscriptFile.ExtractedText
			fmt.Printf("[PeerReview] Using extracted text for preprocessing: taskID=%d, length=%d\n", task.ID, len(manuscriptText))
		}
		if len(manuscriptText) < 100 {
			return nil, nil, nil, fmt.Errorf("稿件内容太短，请提供更完整的内容")
		}
		meta, err = s.extractBasicInfo(manuscriptText, task.TargetVenue, modelLevel)
	}
	
	if err != nil {
		return nil, nil, nil, fmt.Errorf("稿件分析失败: %w", err)
	}

	metaJSON, _ := json.Marshal(meta)
	s.db.Model(task).Updates(map[string]interface{}{
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
	rawResults, err := s.callSemanticScholarSearchWithAIFilterNoWriter(searchQueries, meta, modelLevel, progressCallback)
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
	literatureSummary, err := s.summarizeLiterature(literatureContext, meta, modelLevel)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("文献总结失败: %w", err)
	}
	summaryJSON, _ := json.Marshal(literatureSummary)
	s.db.Model(task).Update("literature_summary", string(summaryJSON))

	refs := s.buildReferenceList(literatureContext.AllPapers)

	return meta, literatureSummary, refs, nil
}

// runSingleReview 执行单个审稿人的审稿
func (s *Service) runSingleReview(task *PeerReviewTask, reviewerIndex int, meta *ManuscriptMeta, summary *LiteratureSummary, refs []ReferenceForReviewer, writer *strings.Builder) {
	fmt.Printf("[PeerReview] runSingleReview started: taskID=%d, reviewerIndex=%d\n", task.ID, reviewerIndex)
	
	// 更新审稿人状态
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]interface{}{"status": TaskStatusProcessing, "progress": 10})

	var err error

	// 收集文本模式附件的内容（Word/RTF/ODT 等格式提取的文本）
	attachmentTexts := s.collectAttachmentTexts(task)
	if len(attachmentTexts) > 0 {
		fmt.Printf("[PeerReview] Collected %d text attachments: taskID=%d, reviewerIndex=%d\n", len(attachmentTexts), task.ID, reviewerIndex)
	}

	// 收集 PDF 附件（无论主稿件是什么模式，PDF 附件都需要以文件形式传递）
	pdfAttachments := s.collectPDFAttachments(task)
	if len(pdfAttachments) > 0 {
		fmt.Printf("[PeerReview] Collected %d PDF attachments: taskID=%d, reviewerIndex=%d\n", len(pdfAttachments), task.ID, reviewerIndex)
	}

	// 根据处理模式选择不同的处理方式
	// ProcessModeDirect (仅 PDF 主稿件)：直接传递文件给 AI（支持视觉内容）
	// ProcessModeExtract (Word/RTF/ODT/XML/HTML/TXT 等)：使用上传时提取的文本
	if task.ManuscriptFile != nil && task.ManuscriptFile.ProcessMode == ProcessModeDirect {
		// PDF 主稿件直传模式：收集主稿件和 PDF 附件
		fmt.Printf("[PeerReview] Using PDF direct mode: taskID=%d, reviewerIndex=%d, fileName=%s\n", 
			task.ID, reviewerIndex, task.ManuscriptFile.FileName)
		files := s.collectFilesForAI(task)
		if len(files) == 0 {
			err = fmt.Errorf("无法读取稿件文件")
			fmt.Printf("[PeerReview] ERROR: Failed to collect files: taskID=%d, reviewerIndex=%d\n", task.ID, reviewerIndex)
		} else {
			fmt.Printf("[PeerReview] Collected %d files for AI: taskID=%d, reviewerIndex=%d\n", len(files), task.ID, reviewerIndex)
			err = s.generateReviewForTaskWithFile(files, attachmentTexts,
				task.TargetVenue, meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
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
			fmt.Printf("[PeerReview] Using hybrid mode (text + PDF attachments): taskID=%d, reviewerIndex=%d\n", task.ID, reviewerIndex)
			fmt.Printf("[PeerReview] Text length: %d chars, PDF attachments: %d, taskID=%d, reviewerIndex=%d\n", 
				len(manuscriptText), len(pdfAttachments), task.ID, reviewerIndex)
			err = s.generateReviewForTaskHybrid(manuscriptText, pdfAttachments, attachmentTexts,
				task.TargetVenue, meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
		} else {
			// 纯文本模式
			fmt.Printf("[PeerReview] Using text mode: taskID=%d, reviewerIndex=%d\n", task.ID, reviewerIndex)
			fmt.Printf("[PeerReview] Text length: %d chars, taskID=%d, reviewerIndex=%d\n", len(manuscriptText), task.ID, reviewerIndex)
			err = s.generateReviewForTask(manuscriptText, attachmentTexts, task.TargetVenue, meta, summary, refs, task.ModelLevel, writer, task.ID, reviewerIndex)
		}
	}

	now := time.Now()
	if err != nil {
		fmt.Printf("[PeerReview] ERROR in runSingleReview: taskID=%d, reviewerIndex=%d, error=%v\n", task.ID, reviewerIndex, err)
		s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
			Updates(map[string]interface{}{
				"status":        TaskStatusFailed,
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return
	}
	
	fmt.Printf("[PeerReview] runSingleReview completed successfully: taskID=%d, reviewerIndex=%d, contentLength=%d\n", 
		task.ID, reviewerIndex, writer.Len())

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
		fmt.Printf("[PeerReview] Failed to parse review JSON for task %d reviewer %d: %v\n", task.ID, reviewerIndex, parseErr)
		recommendation = extractRecommendation(rawContent)
	}

	// 保存结果
	s.db.Model(&PeerReviewResult{}).Where("task_id = ? AND reviewer_index = ?", task.ID, reviewerIndex).
		Updates(map[string]interface{}{
			"status":           TaskStatusCompleted,
			"progress":         100,
			"recommendation":   recommendation,
			"review_content":   rawContent,
			"dimension_scores": dimensionScoresJSON,
			"completed_at":     now,
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
func (s *Service) summarizeReviews(taskID uint, reviewResults []*strings.Builder) {
	fmt.Printf("[PeerReview] summarizeReviews started: taskID=%d\n", taskID)
	
	// 获取任务信息
	var task PeerReviewTask
	if err := s.db.First(&task, taskID).Error; err != nil {
		fmt.Printf("[PeerReview] Failed to get task for summarize: %v\n", err)
		return
	}

	var results []PeerReviewResult
	s.db.Where("task_id = ?", taskID).Find(&results)
	fmt.Printf("[PeerReview] Found %d review results in DB: taskID=%d\n", len(results), taskID)

	// 收集已完成的审稿结果
	var reviewContents []string
	recommendations := make(map[string]int)
	completedCount := 0

	for _, r := range results {
		fmt.Printf("[PeerReview] Review result: taskID=%d, reviewerIndex=%d, status=%s, contentLength=%d, recommendation=%s\n", 
			taskID, r.ReviewerIndex, r.Status, len(r.ReviewContent), r.Recommendation)
		if r.Status == TaskStatusCompleted {
			completedCount++
			recommendations[r.Recommendation]++
			reviewContents = append(reviewContents, r.ReviewContent)
		}
	}
	
	fmt.Printf("[PeerReview] Completed reviews: taskID=%d, completedCount=%d\n", taskID, completedCount)

	// 如果没有完成的审稿，直接返回
	if completedCount == 0 {
		fmt.Printf("[PeerReview] WARNING: No completed reviews, setting final as Pending Review: taskID=%d\n", taskID)
		s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
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
	metaReviewContent, err := s.generateMetaReview(reviewContents, task.TargetVenue, task.ModelLevel)
	if err != nil {
		fmt.Printf("[PeerReview] Failed to generate meta-review: %v\n", err)
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
		s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
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
	s.db.Model(&PeerReviewTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
		"final_recommendation": finalRec,
		"final_review_content": metaReviewContent,
		"consensus_score":      consensusScore,
	})
}

// generateMetaReview 使用 AI 生成 Meta-Review 汇总报告
func (s *Service) generateMetaReview(reviewContents []string, targetVenue, modelLevel string) (string, error) {
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
	userPrompt := fmt.Sprintf(getMetaReviewUserPrompt(), targetVenue, reviewerInputs.String())

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	level := getModelLevel(modelLevel)

	// 调用 AI 并支持续写
	content, err := s.callAIWithContinuation(messages, level, 3)
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

// getMetaReviewSystemPrompt 获取 Meta-Review 系统提示词
func getMetaReviewSystemPrompt() string {
	return `你是一名 Meta-Reviewer（元审稿人）。你的任务是阅读 Reviewer A、Reviewer B、Reviewer C 的三份结构化 JSON 审稿意见，并将它们合并为一份结构统一、逻辑一致的最终审稿报告。

===========================================
【合并规则（Meta-Review 必须遵守）】
===========================================

（1）最终输出必须保持以下固定 JSON 结构：

{
  "overall_assessment": { ... },
  "critical_issues": [ ... ],
  "other_suggestions": [ ... ],
  "extended_review_items": { ... }
}

不得增加字段，不得减少字段。

（2）冲突处理方式：

- 若两份审稿意见一致 → 视为主流观点，应在最终稿中体现
- 若三份意见完全不同 → 使用"部分审稿人认为……另一些认为……"的中立表达总结
- 若某份意见明显离群或不合理 → 自动弱化其权重

（3）最终 recommendation 合成规则（只能选以下四个值）：
Accept / Minor Revision / Major Revision / Reject

决策逻辑：
- 多数为 Accept/MR → Minor Revision
- 多数为 MR/MJ → Major Revision
- 至少两人 Reject → Reject
- 意见严重冲突 → Major Revision

（4）critical_issues（必须解决的问题）合并方式：

- 来自不同审稿人的同类问题 → 合并为一条，并进行统一描述
- 必须包括 issue_title / description / required_actions / affected_sections
- affected_sections 应合并所有审稿人指出的位置

（5）other_suggestions（非关键修改建议）：

- 去重、合并相似建议
- 必须包含具体位置，如 Section 2、Figure 3、Page 7 等
- 必须包含 rationale（提出建议的理由）

（6）extended_review_items：

- 对三份审稿意见进行 meta-level 总结
- 对一致意见进行凝练表达
- 对分歧意见使用平衡描述
- 语言必须保持客观、学术化

===========================================
【输出要求】
===========================================

- 只输出最终 JSON  
- 不要输出解析过程、不使用 Markdown、不添加解释  
- JSON 必须符合标准格式，可以被自动解析`
}

// getMetaReviewUserPrompt 获取 Meta-Review 用户提示词
func getMetaReviewUserPrompt() string {
	return `===========================================
【输入格式】
===========================================

目标期刊/会议：%s

三位审稿人的审稿意见如下：

%s

其中：
- reviewer_A 为模型 A 的审稿 JSON 输出  
- reviewer_B 为模型 B 的审稿 JSON 输出  
- reviewer_C 为模型 C 的审稿 JSON 输出  

三份内容都遵循审稿 JSON 模板结构。

===========================================
【最终输出结构（必须完全保持一致）】
===========================================

请输出以下结构的 JSON：

{
  "overall_assessment": {
    "core_contribution": "（综合三位审稿人意见，总结论文核心贡献）",
    "fit_for_target_venue": {
      "venue_name": "（目标期刊/会议名称）",
      "fit_evaluation": "（综合评估论文与目标期刊的契合度）"
    },
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若为 Reject 必填：综合建议。若非 Reject 则留空。）"
  },

  "critical_issues": [
    {
      "issue_title": "（合并后的关键问题标题）",
      "issue_description": "（综合描述问题，注明哪些审稿人提出）",
      "required_actions": "（综合的修改建议）",
      "affected_sections": ["（合并所有审稿人指出的章节）"]
    }
  ],

  "other_suggestions": [
    {
      "suggestion_title": "（合并后的建议标题）",
      "suggestion_description": "（综合描述建议内容）",
      "suggestion_location": "（具体位置，如 Section 2、Figure 3、Page 7 等）",
      "suggestion_rationale": "（提出建议的理由）"
    }
  ],

  "extended_review_items": {
    "novelty_evaluation": "（综合三位审稿人对新颖性的评价）",
    "technical_soundness": "（综合技术严谨性评价）",
    "clarity_and_presentation": "（综合清晰度评价）",
    "reproducibility": {
      "data_availability": "（综合数据可用性评价）",
      "code_availability": "（综合代码可用性评价）"
    },
    "ethical_considerations": "（综合伦理考量，若不适用填"不适用"）",
    "impact_and_significance": "（综合影响力评价）",
    "recommend_for_improvement": "（综合改进建议）"
  }
}`
}

// generateReviewForTask 为任务生成审稿报告（非流式，但更新进度）
// reviewerIndex: 审稿人索引 (1-3)，用于选择差异化的审稿视角
// attachmentTexts: 文本模式附件的内容列表
func (s *Service) generateReviewForTask(
	manuscriptText string,
	attachmentTexts []map[string]string,
	targetVenue string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
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

	// 文字模式：主稿件最多 50000 字符（与保存草稿的限制一致）
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建附件文本内容
	attachmentTextContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		attachmentTextContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPrompt := fmt.Sprintf(getReviewUserPromptTemplate(),
		targetVenue,
		truncatedText + attachmentTextContent, // 将附件文本追加到主稿件后面
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
	
	// 最多重试3次（如果JSON不完整则重试，不再续写）
	const maxRetries = 3
	
	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		fmt.Printf("[PeerReview] Calling AI for text review: taskID=%d, reviewerIndex=%d, attempt=%d/%d, level=%s, textLength=%d\n", 
			taskID, reviewerIndex, attempt, maxRetries, level, len(truncatedText))

		response, err := s.aiService.ChatCompletionWithTools(convertMessages(messages), nil, "", level)
		if err != nil {
			fmt.Printf("[PeerReview] AI text call failed: taskID=%d, reviewerIndex=%d, attempt=%d, error=%v\n", 
				taskID, reviewerIndex, attempt, err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			fmt.Printf("[PeerReview] AI returned empty choices (text mode): taskID=%d, reviewerIndex=%d, attempt=%d\n", 
				taskID, reviewerIndex, attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		fmt.Printf("[PeerReview] AI text response received: taskID=%d, reviewerIndex=%d, attempt=%d, contentLength=%d\n", 
			taskID, reviewerIndex, attempt, len(content))
		
		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Text review complete: taskID=%d, reviewerIndex=%d, totalLength=%d\n", 
				taskID, reviewerIndex, writer.Len())
			return nil
		}
		
		// JSON不完整，记录日志并重试
		fmt.Printf("[PeerReview] Invalid JSON response, will retry: taskID=%d, reviewerIndex=%d, attempt=%d\n", 
			taskID, reviewerIndex, attempt)
		
		if attempt == maxRetries {
			// 最后一次尝试，即使JSON不完整也接受
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Using incomplete JSON after %d attempts: taskID=%d, reviewerIndex=%d\n", 
				maxRetries, taskID, reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// generateReviewForTaskHybrid 为任务生成审稿报告（混合模式：文本主稿件 + PDF 附件）
// 用于主稿件是 Word 等文本格式，但有 PDF 附件需要传递的情况
func (s *Service) generateReviewForTaskHybrid(
	manuscriptText string,
	pdfAttachments []FileForAI, // PDF 附件文件
	attachmentTexts []map[string]string, // 文本模式附件的内容
	targetVenue string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
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

	// 文字模式：主稿件最多 50000 字符
	const maxManuscriptLength = 50000
	truncatedText := manuscriptText
	if len(truncatedText) > maxManuscriptLength {
		truncatedText = truncatedText[:maxManuscriptLength]
	}

	// 构建 PDF 附件名列表
	var pdfAttachmentNames []string
	for _, f := range pdfAttachments {
		pdfAttachmentNames = append(pdfAttachmentNames, f.FileName)
	}

	// 构建附件提示信息
	attachmentInfo := ""
	if len(pdfAttachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(pdfAttachmentNames)
	}

	// 添加文本模式附件的内容
	textAttachmentContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【文本附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		textAttachmentContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	
	// 使用混合模式的提示词模板（类似文件模式，但主稿件是文本）
	userPromptText := fmt.Sprintf(`你正在对一份投稿到 **%s** 的学术论文进行同行评审。

**【主稿件内容】**
以下是论文的文本内容：

%s

%s
%s

**【预处理信息】**
稿件元信息：
%s

**【文献前沿】**
%s

最相似的已发表论文：
%s

该领域常见 Gap：
%s

**【参考文献列表】**（来自 Semantic Scholar）
%s

请根据以上内容，结合论文全文和所有附件内容，作为一名 **%s** 领域的审稿专家，给出详细的审稿意见。`,
		targetVenue,
		truncatedText,
		attachmentInfo,
		textAttachmentContent,
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr,
		targetVenue)

	// 构建多模态消息
	contentParts := make([]interface{}, 0, len(pdfAttachments)+1)
	
	// 先添加 PDF 附件文件
	for _, f := range pdfAttachments {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName,
		})
	}
	
	// 最后添加文本提示
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	level := getModelLevel(modelLevel)
	
	// 最多重试3次
	const maxRetries = 3
	
	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		fmt.Printf("[PeerReview] Calling AI for hybrid review: taskID=%d, reviewerIndex=%d, attempt=%d/%d, level=%s, textLength=%d, pdfCount=%d\n", 
			taskID, reviewerIndex, attempt, maxRetries, level, len(truncatedText), len(pdfAttachments))

		response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
		if err != nil {
			fmt.Printf("[PeerReview] AI hybrid call failed: taskID=%d, reviewerIndex=%d, attempt=%d, error=%v\n", 
				taskID, reviewerIndex, attempt, err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			fmt.Printf("[PeerReview] AI returned empty choices (hybrid mode): taskID=%d, reviewerIndex=%d, attempt=%d\n", 
				taskID, reviewerIndex, attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		fmt.Printf("[PeerReview] AI hybrid response received: taskID=%d, reviewerIndex=%d, attempt=%d, contentLength=%d\n", 
			taskID, reviewerIndex, attempt, len(content))
		
		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Hybrid review complete: taskID=%d, reviewerIndex=%d, totalLength=%d\n", 
				taskID, reviewerIndex, writer.Len())
			return nil
		}
		
		// JSON不完整，记录日志并重试
		fmt.Printf("[PeerReview] Invalid JSON response (hybrid), will retry: taskID=%d, reviewerIndex=%d, attempt=%d\n", 
			taskID, reviewerIndex, attempt)
		
		if attempt == maxRetries {
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Using incomplete JSON after %d attempts (hybrid): taskID=%d, reviewerIndex=%d\n", 
				maxRetries, taskID, reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// buildAttachmentPrompt 构建增强的附件处理提示词
// 根据附件文件名智能推断附件类型，并生成针对性的审稿指导
func buildAttachmentPrompt(attachmentNames []string) string {
	if len(attachmentNames) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("\n\n**附件文件（共 %d 个）**：\n", len(attachmentNames)))

	// 分类附件
	var figures, tables, data, code, supplementary, other []string

	for _, name := range attachmentNames {
		nameLower := strings.ToLower(name)

		// 根据文件名模式分类
		switch {
		case strings.Contains(nameLower, "fig") || strings.Contains(nameLower, "figure") ||
			strings.Contains(nameLower, "图") || strings.HasSuffix(nameLower, ".png") ||
			strings.HasSuffix(nameLower, ".jpg") || strings.HasSuffix(nameLower, ".jpeg") ||
			strings.HasSuffix(nameLower, ".svg") || strings.HasSuffix(nameLower, ".tif") ||
			strings.HasSuffix(nameLower, ".tiff"):
			figures = append(figures, name)

		case strings.Contains(nameLower, "table") || strings.Contains(nameLower, "表") ||
			strings.HasSuffix(nameLower, ".xlsx") || strings.HasSuffix(nameLower, ".xls") ||
			strings.HasSuffix(nameLower, ".csv"):
			tables = append(tables, name)

		case strings.Contains(nameLower, "data") || strings.Contains(nameLower, "数据") ||
			strings.HasSuffix(nameLower, ".json") || strings.HasSuffix(nameLower, ".xml"):
			data = append(data, name)

		case strings.Contains(nameLower, "code") || strings.Contains(nameLower, "代码") ||
			strings.HasSuffix(nameLower, ".py") || strings.HasSuffix(nameLower, ".ipynb") ||
			strings.HasSuffix(nameLower, ".r") || strings.HasSuffix(nameLower, ".m") ||
			strings.HasSuffix(nameLower, ".zip") || strings.HasSuffix(nameLower, ".tar"):
			code = append(code, name)

		case strings.Contains(nameLower, "suppl") || strings.Contains(nameLower, "appendix") ||
			strings.Contains(nameLower, "附录") || strings.Contains(nameLower, "补充"):
			supplementary = append(supplementary, name)

		default:
			other = append(other, name)
		}
	}

	// 生成分类列表
	if len(figures) > 0 {
		sb.WriteString(fmt.Sprintf("- 图片/图表文件：%s\n", strings.Join(figures, "、")))
	}
	if len(tables) > 0 {
		sb.WriteString(fmt.Sprintf("- 表格数据文件：%s\n", strings.Join(tables, "、")))
	}
	if len(data) > 0 {
		sb.WriteString(fmt.Sprintf("- 数据文件：%s\n", strings.Join(data, "、")))
	}
	if len(code) > 0 {
		sb.WriteString(fmt.Sprintf("- 代码/程序文件：%s\n", strings.Join(code, "、")))
	}
	if len(supplementary) > 0 {
		sb.WriteString(fmt.Sprintf("- 补充材料：%s\n", strings.Join(supplementary, "、")))
	}
	if len(other) > 0 {
		sb.WriteString(fmt.Sprintf("- 其他附件：%s\n", strings.Join(other, "、")))
	}

	// 添加针对性的审稿指导
	sb.WriteString("\n**附件审稿要求**：\n")

	if len(figures) > 0 {
		sb.WriteString(`- **图片/图表审查**：
  - 检查图片分辨率、清晰度是否满足出版要求
  - 评估图表设计是否清晰、美观、信息传达有效
  - 核实图表标注、图例是否完整准确
  - 检查图表数据是否与正文描述一致
`)
	}

	if len(tables) > 0 {
		sb.WriteString(`- **表格数据审查**：
  - 核实表格数据完整性和格式规范性
  - 检查数值精度、单位是否合理
  - 评估表格呈现方式是否便于理解
`)
	}

	if len(data) > 0 || len(code) > 0 {
		sb.WriteString(`- **数据/代码审查**：
  - 评估数据集描述是否充分（来源、采集方式、预处理步骤）
  - 检查代码结构是否清晰、是否有必要的注释
  - 评估可复现性：是否提供了运行环境说明、依赖列表
  - 关注潜在的数据泄露或过拟合风险
`)
	}

	if len(supplementary) > 0 {
		sb.WriteString(`- **补充材料审查**：
  - 评估补充材料与主稿件的关联性和必要性
  - 检查补充实验/分析是否支持主稿件的核心论点
  - 判断哪些内容应该放入主稿件正文
`)
	}

	sb.WriteString(`
**综合评审要点**：
1. 所有附件材料应与正文内容相互印证，不应存在矛盾
2. 附件应增强而非替代正文的说明，核心方法和结果应在正文中充分阐述
3. 请在审稿报告中明确引用附件内容（如"附件图1显示..."、"代码中的X模块..."）
4. 如发现附件质量问题，请在 critical_issues 或 other_suggestions 中具体指出
`)

	return sb.String()
}

// generateReviewForTaskWithFile 为任务生成审稿报告（文件输入，非流式，但更新进度）
// FileForAI 用于传递给 AI 的文件信息
type FileForAI struct {
	FileName string
	MimeType string
	Data     string // base64 编码
	Role     string // manuscript 或 attachment
}

// reviewerIndex: 审稿人索引 (1-3)，用于选择差异化的审稿视角
// attachmentTexts: 文本模式附件的内容列表（Word/RTF/ODT 等格式提取的文本）
func (s *Service) generateReviewForTaskWithFile(
	files []FileForAI, // 支持多文件：主稿件 + PDF 附件
	attachmentTexts []map[string]string, // 文本模式附件的内容
	targetVenue string,
	meta *ManuscriptMeta,
	summary *LiteratureSummary,
	refs []ReferenceForReviewer,
	modelLevel string,
	writer *strings.Builder,
	taskID uint,
	reviewerIndex int,
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

	// 构建文件列表描述（PDF 文件）
	var mainFileName string
	var attachmentNames []string
	for _, f := range files {
		if f.Role == FileRoleManuscript {
			mainFileName = f.FileName
		} else {
			attachmentNames = append(attachmentNames, f.FileName)
		}
	}

	// 构建附件提示信息（包括 PDF 附件名和文本附件内容）
	attachmentInfo := ""
	if len(attachmentNames) > 0 {
		attachmentInfo = buildAttachmentPrompt(attachmentNames)
	}

	// 添加文本模式附件的内容到提示词中
	textAttachmentContent := ""
	if len(attachmentTexts) > 0 {
		var sb strings.Builder
		sb.WriteString("\n\n【文本附件内容】\n")
		for i, att := range attachmentTexts {
			sb.WriteString(fmt.Sprintf("\n--- 附件 %d: %s ---\n", i+1, att["name"]))
			sb.WriteString(att["content"])
			sb.WriteString("\n")
		}
		textAttachmentContent = sb.String()
	}

	systemPrompt := getReviewSystemPrompt(reviewerIndex)
	userPromptText := fmt.Sprintf(getReviewUserPromptTemplateForFile(),
		targetVenue,
		mainFileName,
		attachmentInfo + textAttachmentContent, // 包含 PDF 附件名和文本附件内容
		string(metaJSON),
		summary.FieldState,
		closestPapersInfo,
		gapsInfo,
		refsStr,
		targetVenue)

	// 构建多模态消息，使用 FileInputMeta 作为中间格式
	// AI service 会根据实际使用的模型自动转换为对应格式
	contentParts := make([]interface{}, 0, len(files)+1)
	
	// 先添加所有文件（主稿件在前，附件在后）
	for _, f := range files {
		contentParts = append(contentParts, ai.FileInputMeta{
			Type:     "file_input_meta",
			MimeType: f.MimeType,
			Data:     f.Data,
			FileName: f.FileName, // 传递文件名，用于 GPT 模型
		})
	}
	
	// 最后添加文本提示
	contentParts = append(contentParts, ai.TextContent{
		Type: "text",
		Text: userPromptText,
	})

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: contentParts},
	}

	level := getModelLevel(modelLevel)
	
	// 最多重试3次（如果JSON不完整则重试，不再续写）
	const maxRetries = 3
	
	for attempt := 1; attempt <= maxRetries; attempt++ {
		s.updateTaskProgress(taskID, TaskStatusProcessing, 70, "正在生成审稿报告...")

		fmt.Printf("[PeerReview] Calling AI for review: taskID=%d, reviewerIndex=%d, attempt=%d/%d, level=%s, fileCount=%d\n", 
			taskID, reviewerIndex, attempt, maxRetries, level, len(files))

		response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
		if err != nil {
			fmt.Printf("[PeerReview] AI call failed: taskID=%d, reviewerIndex=%d, attempt=%d, error=%v\n", 
				taskID, reviewerIndex, attempt, err)
			if attempt == maxRetries {
				return err
			}
			continue
		}

		if len(response.Choices) == 0 {
			fmt.Printf("[PeerReview] AI returned empty choices: taskID=%d, reviewerIndex=%d, attempt=%d\n", 
				taskID, reviewerIndex, attempt)
			if attempt == maxRetries {
				return fmt.Errorf("no response from AI after %d attempts", maxRetries)
			}
			continue
		}

		content := response.Choices[0].Message.Content
		fmt.Printf("[PeerReview] AI response received: taskID=%d, reviewerIndex=%d, attempt=%d, contentLength=%d\n", 
			taskID, reviewerIndex, attempt, len(content))
		
		// 检查JSON是否完整
		if s.isValidReviewJSON(content) {
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Review content complete: taskID=%d, reviewerIndex=%d, totalLength=%d\n", 
				taskID, reviewerIndex, writer.Len())
			return nil
		}
		
		// JSON不完整，记录日志并重试
		fmt.Printf("[PeerReview] Invalid JSON response, will retry: taskID=%d, reviewerIndex=%d, attempt=%d\n", 
			taskID, reviewerIndex, attempt)
		
		if attempt == maxRetries {
			// 最后一次尝试，即使JSON不完整也接受
			writer.WriteString(content)
			fmt.Printf("[PeerReview] Using incomplete JSON after %d attempts: taskID=%d, reviewerIndex=%d\n", 
				maxRetries, taskID, reviewerIndex)
			return nil
		}
	}

	return fmt.Errorf("failed to generate valid review after %d attempts", maxRetries)
}

// getReviewUserPromptTemplateForFile 获取文件版本的用户提示词模板（PDF、Word等）
func getReviewUserPromptTemplateForFile() string {
	return `## 投稿目标
**目标期刊/会议**：%s

## 待审稿件
**主稿件**：%s%s

请仔细阅读附件中的论文文件进行审稿。

## 系统预分析信息

### 稿件结构化理解
%s

### 领域前沿状态
%s

### 与稿件最相似的已发表论文（新颖性核查）
%s

### 当前领域研究空白
%s

### 可引用的参考文献列表（请严格只引用这些，使用 [R1], [R2] 等编号）
%s

---

请基于以上所有信息和附件中的论文文件，生成一份专业的审稿报告。报告**必须**优先并聚焦于指出问题。

**重要：你必须严格按照以下 JSON 格式输出审稿报告，不要输出任何其他内容（包括 markdown 代码块标记）：**

{
  "overall_assessment": {
    "core_contribution": "（简要总结你理解的论文核心贡献。要求：高度凝练、客观、避免套话。）",
    "fit_for_target_venue": {
      "venue_name": "%s",
      "fit_evaluation": "（评估论文投稿到该 venue 的契合度：研究方向是否匹配？新颖性是否达到门槛？潜在影响力是否足够？必须对照上述相似论文进行新颖性判断。）"
    },
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若为 Reject 必填：请给出清晰、建设性的转投建议或重做方向。若非 Reject 则留空。）"
  },

  "critical_issues": [
    {
      "issue_title": "（关键问题标题：如原创性不足、贡献不清、方法重大缺陷等）",
      "issue_description": "（明确指出问题是什么、为什么严重、为何阻碍论文达标。引用相关文献 [Rx] 作为依据。）",
      "required_actions": "（作者必须具体采取哪些补救措施？给出可执行的修改方案。）",
      "affected_sections": ["（该问题对应的章节，如：Introduction, Methodology, Section 3.2 等）"]
    }
  ],

  "other_suggestions": [
    {
      "suggestion_title": "（次要建议标题，如：图表规范性、文献补充等）",
      "suggestion_description": "（描述建议内容本身。）",
      "suggestion_location": "（具体位置：图3、图5、Introduction 第三段、Table 2 附近等）",
      "suggestion_rationale": "（为何建议？提升可读性？规范性？复现性？）"
    }
  ],

  "extended_review_items": {
    "novelty_evaluation": "（论文相对现有文献的创新点评价，指出是否足够新。必须对照提供的相似论文进行判断。）",
    "technical_soundness": "（方法是否严谨？实验是否可靠？是否存在设计偏差？）",
    "clarity_and_presentation": "（写作质量评估：结构、逻辑、语言、可读性。）",
    "reproducibility": {
      "data_availability": "（数据集是否公开？是否描述充分？）",
      "code_availability": "（代码是否提供？能否支持复现？）"
    },
    "ethical_considerations": "（如适用：是否存在伦理风险、数据偏差、人群隐私问题？若不适用请填写"不适用"。）",
    "impact_and_significance": "（对学术界/产业界的潜在影响力评价。）",
    "recommend_for_improvement": "（若作者未来想提升质量，应加强哪些方面？）"
  }
}

**注意事项：**
1. critical_issues 数组中至少包含 1 个关键问题（如果论文质量很高可以只有 1 个）
2. other_suggestions 数组中至少包含 1 个改进建议
3. 所有字段都必须填写，不能留空（如不适用请明确说明"不适用"或"无"）
4. 直接输出 JSON，不要包含任何 markdown 代码块标记（如 ` + "`" + `` + "`" + `` + "`" + `json）`
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

// needsContinuation 检查审稿报告是否需要续写
// 专门用于 JSON 格式的输出检查
func (s *Service) needsContinuation(content string) bool {
	content = strings.TrimSpace(content)
	contentLen := len(content)

	// 如果内容太短，需要续写
	if contentLen < 500 {
		fmt.Printf("[PeerReview] needsContinuation: content too short (%d < 500)\n", contentLen)
		return true
	}

	// JSON 格式检查：检查是否是完整的 JSON 对象
	trimmed := strings.TrimSpace(content)

	// 移除可能的 markdown 代码块标记
	if strings.HasPrefix(trimmed, "```json") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
	} else if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```")
	}
	if strings.HasSuffix(trimmed, "```") {
		trimmed = strings.TrimSuffix(trimmed, "```")
	}
	trimmed = strings.TrimSpace(trimmed)

	// 检查是否以 } 结尾
	if !strings.HasSuffix(trimmed, "}") {
		// 显示最后50个字符用于调试
		suffix := trimmed
		if len(suffix) > 50 {
			suffix = suffix[len(suffix)-50:]
		}
		fmt.Printf("[PeerReview] needsContinuation: not ending with }, last 50 chars: ...%s\n", suffix)
		return true // JSON 不完整，需要续写
	}

	// 检查括号是否匹配
	openBraces := strings.Count(trimmed, "{")
	closeBraces := strings.Count(trimmed, "}")
	if openBraces != closeBraces {
		fmt.Printf("[PeerReview] needsContinuation: brace mismatch, open=%d, close=%d\n", openBraces, closeBraces)
		return true // 括号不匹配，需要续写
	}

	// 尝试解析 JSON 验证完整性
	var test interface{}
	if err := json.Unmarshal([]byte(trimmed), &test); err != nil {
		fmt.Printf("[PeerReview] needsContinuation: JSON parse failed: %v\n", err)
		return true // JSON 解析失败，可能不完整
	}

	// JSON 完整
	fmt.Printf("[PeerReview] needsContinuation: JSON complete, length=%d\n", contentLen)
	return false
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

// parseReviewJSON 解析 AI 返回的审稿报告 JSON
// 包含多层容错处理，尽最大努力解析 AI 返回的内容
func parseReviewJSON(content string) (*ReviewReportJSON, error) {
	// 清理内容：移除可能的 markdown 代码块标记
	content = strings.TrimSpace(content)

	// 移除 ```json 和 ``` 标记（支持多种变体）
	content = removeMarkdownCodeBlock(content)

	// 尝试找到 JSON 对象的边界
	jsonContent := extractJSONObject(content)
	if jsonContent == "" {
		return nil, fmt.Errorf("no valid JSON object found in content")
	}

	// 第一次尝试：直接解析
	var report ReviewReportJSON
	if err := json.Unmarshal([]byte(jsonContent), &report); err == nil {
		return &report, nil
	}

	// 第二次尝试：修复常见的 JSON 格式问题
	fixedJSON := fixCommonJSONIssues(jsonContent)
	if err := json.Unmarshal([]byte(fixedJSON), &report); err == nil {
		return &report, nil
	}

	// 第三次尝试：使用正则表达式提取关键字段，构建部分报告
	partialReport := extractPartialReviewFromText(content)
	if partialReport != nil {
		return partialReport, nil
	}

	return nil, fmt.Errorf("failed to parse review JSON after multiple attempts")
}

// removeMarkdownCodeBlock 移除 markdown 代码块标记
func removeMarkdownCodeBlock(content string) string {
	content = strings.TrimSpace(content)

	// 移除开头的代码块标记
	prefixes := []string{"```json", "```JSON", "```", "'''json", "'''"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(content, prefix) {
			content = strings.TrimPrefix(content, prefix)
			break
		}
	}

	// 移除结尾的代码块标记
	suffixes := []string{"```", "'''"}
	for _, suffix := range suffixes {
		if strings.HasSuffix(content, suffix) {
			content = strings.TrimSuffix(content, suffix)
			break
		}
	}

	return strings.TrimSpace(content)
}

// extractJSONObject 从内容中提取 JSON 对象
func extractJSONObject(content string) string {
	// 找到第一个 { 和最后一个 }
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")

	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return ""
	}

	return content[startIdx : endIdx+1]
}

// fixCommonJSONIssues 修复常见的 JSON 格式问题
func fixCommonJSONIssues(jsonContent string) string {
	// 1. 移除尾部逗号（JSON 对象和数组最后一个元素后的逗号）
	// 例如: {"a": 1,} -> {"a": 1}
	re := regexp.MustCompile(`,\s*([}\]])`)
	jsonContent = re.ReplaceAllString(jsonContent, "$1")

	// 2. 修复单引号为双引号
	// 注意：这是一个简化处理，可能在某些边缘情况下不正确
	// 但对于 AI 生成的 JSON 通常有效
	if !strings.Contains(jsonContent, `"`) && strings.Contains(jsonContent, `'`) {
		jsonContent = strings.ReplaceAll(jsonContent, `'`, `"`)
	}

	// 3. 移除控制字符（除了 \n, \r, \t）
	var cleanedBuilder strings.Builder
	for _, r := range jsonContent {
		if r >= 32 || r == '\n' || r == '\r' || r == '\t' {
			cleanedBuilder.WriteRune(r)
		}
	}
	jsonContent = cleanedBuilder.String()

	// 4. 修复未转义的换行符在字符串值中的问题
	// 这是一个启发式修复，将值中的换行替换为 \n
	jsonContent = fixUnescapedNewlines(jsonContent)

	return jsonContent
}

// fixUnescapedNewlines 修复字符串值中未转义的换行符
func fixUnescapedNewlines(jsonContent string) string {
	// 使用状态机来处理字符串内的换行
	var result strings.Builder
	inString := false
	escaped := false

	for i, r := range jsonContent {
		if escaped {
			result.WriteRune(r)
			escaped = false
			continue
		}

		if r == '\\' && inString {
			escaped = true
			result.WriteRune(r)
			continue
		}

		if r == '"' {
			inString = !inString
			result.WriteRune(r)
			continue
		}

		if inString && (r == '\n' || r == '\r') {
			// 在字符串内遇到换行，替换为 \n
			if r == '\n' {
				result.WriteString("\\n")
			}
			// 跳过 \r
			continue
		}

		// 检查是否是字符串值中的实际换行（可能是 AI 输出的格式问题）
		if inString && i > 0 {
			result.WriteRune(r)
		} else {
			result.WriteRune(r)
		}
	}

	return result.String()
}

// extractPartialReviewFromText 从文本中提取部分审稿信息（最后的容错方案）
func extractPartialReviewFromText(content string) *ReviewReportJSON {
	report := &ReviewReportJSON{}
	hasValidContent := false

	// 使用正则表达式提取关键字段

	// 1. 提取 recommendation
	recPatterns := []string{
		`"recommendation"\s*:\s*"([^"]+)"`,
		`recommendation[：:]\s*(\w+)`,
	}
	for _, pattern := range recPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.Recommendation = normalizeRecommendation(matches[1])
			hasValidContent = true
			break
		}
	}

	// 2. 提取 core_contribution
	contribPatterns := []string{
		`"core_contribution"\s*:\s*"([^"]+)"`,
		`核心贡献[：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range contribPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.CoreContribution = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 3. 提取 venue_name
	venuePatterns := []string{
		`"venue_name"\s*:\s*"([^"]+)"`,
	}
	for _, pattern := range venuePatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.FitForTargetVenue.VenueName = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 4. 提取 novelty_evaluation
	noveltyPatterns := []string{
		`"novelty_evaluation"\s*:\s*"([^"]+)"`,
		`新颖性[评價评价][：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range noveltyPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.ExtendedReviewItems.NoveltyEvaluation = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 5. 尝试提取 critical_issues（简化版）
	issuePattern := regexp.MustCompile(`"issue_title"\s*:\s*"([^"]+)"`)
	issueMatches := issuePattern.FindAllStringSubmatch(content, -1)
	for _, match := range issueMatches {
		if len(match) > 1 {
			report.CriticalIssues = append(report.CriticalIssues, CriticalIssue{
				IssueTitle: strings.TrimSpace(match[1]),
			})
			hasValidContent = true
		}
	}

	// 6. 如果没有从 JSON 字段提取到推荐意见，尝试从全文提取
	if report.OverallAssessment.Recommendation == "" || report.OverallAssessment.Recommendation == "Pending Review" {
		report.OverallAssessment.Recommendation = extractRecommendation(content)
		if report.OverallAssessment.Recommendation != "Pending Review" {
			hasValidContent = true
		}
	}

	if hasValidContent {
		return report
	}
	return nil
}

// normalizeRecommendation 标准化推荐意见
func normalizeRecommendation(rec string) string {
	rec = strings.TrimSpace(rec)
	recLower := strings.ToLower(rec)

	// 处理带有选项分隔符的情况，如 "Accept | Minor Revision | Major Revision | Reject"
	// 这种情况下应该返回 Pending Review，因为 AI 没有做出选择
	if strings.Contains(rec, "|") {
		return "Pending Review"
	}

	if strings.Contains(recLower, "reject") {
		return "Reject"
	}
	if strings.Contains(recLower, "major revision") || strings.Contains(recLower, "major_revision") {
		return "Major Revision"
	}
	if strings.Contains(recLower, "minor revision") || strings.Contains(recLower, "minor_revision") {
		return "Minor Revision"
	}
	if strings.Contains(recLower, "accept") {
		return "Accept"
	}

	return "Pending Review"
}

// extractRecommendation 从审稿报告中提取推荐意见（文本模式，向后兼容）
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

// getReviewSystemPrompt 获取审稿系统提示词（根据审稿人角色差异化）
// reviewerIndex: 1=原创性与理论贡献视角, 2=方法论与技术严谨性视角, 3=清晰度、影响力与实用性视角
func getReviewSystemPrompt(reviewerIndex int) string {
	basePrompt := `## ⚠️ 最高优先级约束（必须严格遵守）

**【字符限制】你的整个 JSON 输出必须严格控制在 8000 字符以内（约 4000 汉字）。这是硬性限制，超出部分将被系统截断导致 JSON 解析失败。**

为达到此限制，你必须：
- critical_issues：最多 3 个，每个 description 控制在 80-120 字
- major_issues：最多 3 个，每个 description 控制在 80-120 字  
- minor_issues：最多 3 个，每个 description 控制在 60-80 字
- other_suggestions：最多 2 个，每个 description 控制在 60-80 字
- 所有评价性文字必须精炼、直击要害，禁止冗长铺垫和重复表述

---

## 角色：严苛、精准且富有洞察的学术审稿人

你是一位以"严苛、精准、富有洞察力"而闻名的资深学术审稿专家。你坚守最高的学术标准，你的首要任务是**严格审查（Strict Scrutiny）**，以确保只有最高质量的研究得以推进。你擅长一针见血地指出研究中的**核心缺陷**和**逻辑漏洞**，同时你的反馈必须是**具体、清晰且可执行的**。

`
	// 根据审稿人索引添加差异化的审稿视角
	var roleSpecificPrompt string
	switch reviewerIndex {
	case 1:
		// Reviewer A：侧重原创性和理论贡献
		roleSpecificPrompt = `## 你的专业审稿视角：原创性与理论贡献

作为专注于**原创性与理论贡献**的审稿人，你需要特别关注：

1. **创新性深度评估**：该研究是否提出了真正新颖的观点、理论或框架？是渐进式改进还是突破性创新？
2. **理论基础审查**：研究的理论根基是否扎实？是否正确理解和引用了相关经典理论？理论推导是否严谨？
3. **学术贡献定位**：该研究在本领域知识体系中的位置和价值如何？是否填补了明确的理论空白？
4. **与已有工作的区分**：与最相似的已发表论文相比，本文的独特贡献是什么？是否存在重复发表的嫌疑？
5. **概念清晰度**：核心概念的定义是否清晰、准确？是否与现有文献中的定义一致或有合理的创新解释？

在审稿报告中，你应该重点从**原创性和理论贡献**的角度进行深入分析和批评。

`
	case 2:
		// Reviewer B：侧重方法论和技术严谨性
		roleSpecificPrompt = `## 你的专业审稿视角：方法论与技术严谨性

作为专注于**方法论与技术严谨性**的审稿人，你需要特别关注：

1. **研究设计合理性**：研究方法是否是回答研究问题的最优选择？实验设计是否科学、完整？
2. **技术实现正确性**：算法、模型或分析方法是否正确实现？是否有数学推导错误或编程逻辑问题？
3. **数据处理规范性**：数据收集、清洗、处理过程是否透明？是否存在数据偏差或选择性报告？
4. **统计分析恰当性**：统计方法选择是否正确？假设检验是否合理？显著性水平设置是否恰当？
5. **实验对照与消融**：基线选择是否合适？消融实验是否充分证明了各组件的有效性？
6. **可复现性评估**：实验细节描述是否足够详细？是否提供了复现所需的代码、数据和参数设置？

在审稿报告中，你应该重点从**方法论严谨性和技术正确性**的角度进行深入分析和批评。

`
	case 3:
		// Reviewer C：侧重清晰度、影响力和实用性
		roleSpecificPrompt = `## 你的专业审稿视角：清晰度、影响力与实用性

作为专注于**清晰度、影响力与实用性**的审稿人，你需要特别关注：

1. **写作质量与可读性**：论文结构是否清晰合理？语言表达是否准确流畅？图表是否直观易懂？
2. **论证逻辑连贯性**：从问题提出到方法设计到结果讨论，整体逻辑链条是否连贯完整？
3. **实际应用价值**：研究成果是否具有实际应用前景？对工业界或实际问题解决有何潜在贡献？
4. **学术影响力潜力**：该研究能否引发后续研究？是否可能成为该领域的重要参考文献？
5. **受众适配性**：论文的写作风格和技术深度是否适合目标期刊/会议的读者群体？
6. **局限性与未来方向**：作者是否诚实地指出了研究局限？提出的未来研究方向是否有价值？

在审稿报告中，你应该重点从**清晰度、影响力和实用性**的角度进行深入分析和批评。

`
	default:
		roleSpecificPrompt = ""
	}

	commonPrompt := `## 核心知识与能力：

1. **前沿洞察**：你深刻理解并实时追踪本学科的前沿理论、最新方法和行业动态。
2. **理论基石**：你对领域的经典理论与核心范式有系统性、批判性的认知，能迅速判断其应用的恰当性。
3. **逻辑审查**：你能精准识别研究设计、论证推导和数据解释中的逻辑断点、不一致或潜在偏见。
4. **标准感知**：你熟悉不同层次的学术期刊和会议的审稿标准、偏好和"门槛"。

## 审稿核心检查点：

* **原创性与贡献**：研究是否提出了清晰且有价值的新见解？贡献是增量性的还是突破性的？
* **研究问题**：问题是否清晰界定？其学术价值和现实意义是否重大？
* **文献综述**：文献回顾是否全面、深入、具有批判性？是否准确识别了研究缺口？
* **方法论严谨性**：研究设计是否科学？方法是否为回答研究问题的最优选？样本选择、数据处理是否透明、可复现？
* **数据分析与结果**：分析方法是否恰当？结果呈现是否清晰准确？有无过度解读？
* **讨论与结论**：讨论是否深入阐释了结果意义？结论是否完全基于研究证据？是否诚实指出了研究局限？
* **逻辑与表达**：全文论证逻辑是否一致严密？学术语言是否精准专业？

## 格式与内容约束：

1. **必须严格按照 JSON 格式输出，不要输出任何其他内容（禁止 markdown 代码块）**
2. **引用文献时必须使用 [R1], [R2] 等编号**，只能引用提供的参考文献列表中的文献
3. **不得虚构任何文献或作者**
4. **所有关于新颖性和是否重复已有工作的判断，必须对照提供的相似论文和参考文献**
5. **批评必须具体可操作，明确指出如何修改**
6. **再次强调：总输出必须小于 8000 字符，宁可精炼深刻，不要冗长啰嗦**`

	return basePrompt + roleSpecificPrompt + commonPrompt
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

### 与稿件最相似的已发表论文（新颖性核查）
%s

### 当前领域研究空白
%s

### 可引用的参考文献列表（请严格只引用这些，使用 [R1], [R2] 等编号）
%s

---

请基于以上信息，生成一份专业审稿报告。**必须聚焦关键问题，精炼表达。**

**硬性要求：整个 JSON 输出必须小于 8000 字符，超出将导致解析失败！**

直接输出以下 JSON 格式（不要包含 ` + "`" + `` + "`" + `` + "`" + ` 代码块标记）：

{
  "overall_assessment": {
    "core_contribution": "（50-100字，高度凝练的核心贡献总结）",
    "fit_for_target_venue": {
      "venue_name": "%s",
      "fit_evaluation": "（50-80字，评估与目标期刊的契合度）"
    },
    "recommendation": "Accept | Minor Revision | Major Revision | Reject",
    "reject_advice": "（若 Reject 必填转投建议，否则留空）"
  },
  "critical_issues": [
    {
      "issue_title": "（10-20字，问题标题）",
      "issue_description": "（80-120字，问题描述，引用 [Rx]）",
      "required_actions": "（50-80字，具体修改方案）",
      "affected_sections": ["章节名"]
    }
  ],
  "other_suggestions": [
    {
      "suggestion_title": "（10-20字）",
      "suggestion_description": "（60-80字）",
      "suggestion_location": "（具体位置）",
      "suggestion_rationale": "（30-50字）"
    }
  ],
  "extended_review_items": {
    "novelty_evaluation": "（80-120字，对照相似论文判断新颖性）",
    "technical_soundness": "（60-100字）",
    "clarity_and_presentation": "（60-100字）",
    "reproducibility": {
      "data_availability": "（30-50字）",
      "code_availability": "（30-50字）"
    },
    "ethical_considerations": "（不适用则填"不适用"）",
    "impact_and_significance": "（50-80字）",
    "recommend_for_improvement": "（50-80字）"
  }
}

**约束：**
1. critical_issues: 1-3 个（聚焦最关键问题）
2. other_suggestions: 1-2 个
3. 所有字段必须填写，遵守上述字数限制
4. 直接输出纯 JSON，禁止 markdown 标记`
}

// isValidReviewJSON 检查AI返回的内容是否是有效的完整JSON
// 用于验证审稿评论的JSON格式是否正确且完整
func (s *Service) isValidReviewJSON(content string) bool {
	if content == "" {
		return false
	}
	
	// 清理可能的markdown代码块标记
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	
	// 检查是否以 { 开头，以 } 结尾
	if !strings.HasPrefix(content, "{") || !strings.HasSuffix(content, "}") {
		return false
	}
	
	// 尝试解析JSON以验证其有效性
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return false
	}
	
	return true
}

// 确保导入被使用
var (
	_ = os.PathSeparator
	_ = filepath.Separator
)
