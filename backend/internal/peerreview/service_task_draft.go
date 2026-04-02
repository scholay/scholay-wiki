// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ========== 草稿管理方法 ==========

// GetOrCreateDraft 获取或创建用户的唯一草稿
func (s *Service) GetOrCreateDraft(userID uint) (*DraftResponse, error) {
	var draft PeerReviewTask

	// 查找用户的草稿任务
	err := s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
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

	if errors.Is(err, gorm.ErrRecordNotFound) {
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
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

	// 更新模型级别（target_venue 已废弃）
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
	draft.ContentHash = generateManuscriptHash(hashInput)

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

	if errors.Is(err, gorm.ErrRecordNotFound) {
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
			slog.Warn("attachment text truncated", "max_chars", maxAttachmentLength, "file_name", fileName)
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
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
	// target_venue 已废弃，不再使用
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
		TargetVenue:    "", // 已废弃，保持兼容
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
