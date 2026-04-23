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

	"scholar-backend/internal/common/safego"

	"gorm.io/gorm"
)

// ========== 草稿管理方法 ==========

// GetOrCreateDraft 获取或创建草稿
// 登录用户按 user_id 查；匿名用户按 anon_token 查（token 为空则返回"无草稿"错误，而非创建空草稿，
// 避免前端空刷产生大量 user_id=0 的孤儿草稿）
func (s *Service) GetOrCreateDraft(userID uint, anonToken string) (*DraftResponse, error) {
	var draft PeerReviewTask
	var err error

	// 按 updated_at DESC 取最近在编辑的草稿。
	// 原因：claim-all 后用户可能同时拥有多条 draft（老的空 draft + 刚认领的新 draft），
	// 按 First() 默认 ID 顺序会拿到较早的空草稿，导致 UI 看似丢失文件。
	switch {
	case userID > 0:
		err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).
			Order("updated_at DESC").First(&draft).Error
	case anonToken != "":
		err = s.db.Where("anon_token = ? AND user_id = 0 AND status = ?", anonToken, TaskStatusDraft).
			Order("updated_at DESC").First(&draft).Error
	default:
		// 匿名且无 token —— 不创建草稿，返回空结构让前端知道当前无草稿
		return &DraftResponse{InputType: InputTypeText, ModelLevel: "mid"}, nil
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 登录用户才自动创建草稿；匿名用户直接返回空结构（草稿由 upload 流程创建）
		if userID > 0 {
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
		} else {
			return &DraftResponse{InputType: InputTypeText, ModelLevel: "mid"}, nil
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
// 登录用户按 user_id；匿名用户按 anon_token（token 为空时生成新的，响应里返回给前端）
func (s *Service) SaveDraft(userID uint, anonToken string, req *SaveDraftRequest) (*DraftResponse, error) {
	var draft PeerReviewTask
	var err error

	switch {
	case userID > 0:
		err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	case anonToken != "":
		err = s.db.Where("anon_token = ? AND user_id = 0 AND status = ?", anonToken, TaskStatusDraft).First(&draft).Error
	default:
		// 匿名无 token —— 找不到草稿，走"新建"分支，下面会生成 token
		err = gorm.ErrRecordNotFound
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		draft = PeerReviewTask{
			UserID: userID,
			Status: TaskStatusDraft,
		}
		if userID == 0 {
			if anonToken == "" {
				anonToken = generateAnonToken()
			}
			draft.AnonToken = anonToken
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
// 支持匿名用户：userID=0 时通过 anonToken 查找草稿
// TrialContext 匿名提交时的试用识别信息。登录提交传零值。
type TrialContext struct {
	DeviceID string
	IPUAHash string
}

func (s *Service) SubmitDraft(userID uint, anonToken string, req *SubmitDraftRequest, trialCtx TrialContext) (*PeerReviewTask, error) {
	// 匿名提交需要预检试用额度，避免已消费用户跑到后面才被拦截
	if userID == 0 {
		canTrial, existing, err := s.CheckAnonTrialQuota(trialCtx.DeviceID, trialCtx.IPUAHash)
		if err != nil {
			return nil, err
		}
		if !canTrial {
			if existing != nil && existing.ClaimedByUserID > 0 {
				return nil, fmt.Errorf("免登录试用已用完并被关联到账号，请登录后查看历史任务")
			}
			return nil, fmt.Errorf("免登录试用已用完，请登录后继续使用审稿功能")
		}
	}

	var draft PeerReviewTask

	// 查找草稿任务
	var err error
	if userID > 0 {
		err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	} else if anonToken != "" {
		err = s.db.Where("anon_token = ? AND status = ? AND user_id = 0", anonToken, TaskStatusDraft).First(&draft).Error
	} else {
		return nil, fmt.Errorf("请先上传稿件文件")
	}
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

	// 设置隐私模式
	draft.IsPrivate = req.IsPrivate
	if req.IsPrivate {
		// 隐私模式：数据在 24 小时后自动过期
		exp := time.Now().Add(24 * time.Hour)
		draft.PrivateExpAt = &exp
	}

	// 更新状态为待处理
	now := time.Now()
	draft.Status = TaskStatusPending
	draft.Progress = 0
	draft.ProgressStage = "等待处理"
	draft.SubmittedAt = &now
	draft.StartedAt = &now

	// 草稿状态翻转 + 创建 3 条 PeerReviewResult + 匿名试用消费必须原子。
	// 否则 worker 启动后只查到 0/1/2 条 result，三审并行会产生空指针/越界；
	// 试用消费漏写会导致同设备再次免登录提交。
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&draft).Error; err != nil {
			return fmt.Errorf("提交草稿失败: %w", err)
		}
		results := make([]PeerReviewResult, ReviewerCount)
		for i := 0; i < ReviewerCount; i++ {
			results[i] = PeerReviewResult{
				TaskID:        draft.ID,
				ReviewerIndex: i + 1,
				Status:        TaskStatusPending,
				Progress:      0,
			}
		}
		// 批量插入：1 条 SQL 而非 N 条
		if err := tx.Create(&results).Error; err != nil {
			return err
		}

		// 匿名提交：在同一事务内记录试用消费，与任务生命周期绑定
		if userID == 0 && trialCtx.DeviceID != "" {
			if err := s.ConsumeAnonTrial(tx, trialCtx.DeviceID, trialCtx.IPUAHash, draft.AnonToken, draft.ID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	// 启动异步处理（三审并行）
	taskID := draft.ID
	safego.Go("peerreview-task-draft", func() { s.processTaskAsyncWithThreeReviewers(taskID) })

	return &draft, nil
}

// ParseFileAndSaveToDraft 解析文件并保存到草稿
// 支持匿名用户：userID=0 时使用 anonToken 关联草稿
// 文件类型处理策略：
// - PDF：直接传递文件给 AI（支持视觉内容）
// - Word/RTF/ODT/XML/HTML 等文档：上传时提取文本，检查字符限制（最大 50000），以文本模式传给 AI
func (s *Service) ParseFileAndSaveToDraft(userID uint, anonToken string, fileName string, fileExt string, content []byte) (*UploadFileResponse, error) {
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

	// 保存原始文件到磁盘：使用 Service 初始化时配置的绝对路径（/app/uploads）
	// 相对路径 "./uploads" 依赖 cwd，容器内以 appuser 运行时对 /app 无写权限
	uploadDir := filepath.Join(s.uploadPath, "peer-review")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("创建上传目录失败: %w", err)
	}

	// 生成唯一文件名
	filePrefix := fmt.Sprintf("%d", userID)
	if userID == 0 {
		filePrefix = "anon"
	}
	uniqueFileName := fmt.Sprintf("%s_%d_%s", filePrefix, time.Now().UnixNano(), fileName)
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
	var newAnonToken string

	if userID > 0 {
		// 登录用户：按 user_id 查找草稿
		err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	} else if anonToken != "" {
		// 匿名用户：按 anon_token 查找草稿
		err = s.db.Where("anon_token = ? AND status = ? AND user_id = 0", anonToken, TaskStatusDraft).First(&draft).Error
	} else {
		// 新匿名用户：生成新 token，强制创建新草稿
		err = gorm.ErrRecordNotFound
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		if userID == 0 && anonToken == "" {
			newAnonToken = generateAnonToken()
		} else {
			newAnonToken = anonToken
		}
		draft = PeerReviewTask{
			UserID:        userID,
			AnonToken:     newAnonToken,
			InputType:     InputTypeFile,
			Status:        TaskStatusDraft,
			Progress:      0,
			ProgressStage: "草稿",
			ModelLevel:    "mid",
		}
	} else if err != nil {
		return nil, err
	}

	// 旧文件替换 + draft 指向新文件必须原子，
	// 否则可能出现：旧文件已删，新 draft 保存失败 → 草稿引用空文件。
	var oldFilePath string
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if draft.ManuscriptFileID != nil {
			var oldFile PeerReviewFile
			if err := tx.First(&oldFile, *draft.ManuscriptFileID).Error; err == nil {
				oldFilePath = oldFile.FilePath // 提交后再清磁盘
				if err := tx.Delete(&oldFile).Error; err != nil {
					return fmt.Errorf("删除旧文件记录失败: %w", err)
				}
			}
		}

		draft.InputType = InputTypeFile
		draft.ManuscriptText = extractedText
		draft.ManuscriptFileID = &file.ID
		draft.Title = strings.TrimSuffix(fileName, fileExt)
		if len(draft.Title) > 100 {
			draft.Title = truncateString(draft.Title, 100)
		}

		if draft.ID == 0 {
			if err := tx.Create(&draft).Error; err != nil {
				return fmt.Errorf("创建草稿失败: %w", err)
			}
		} else {
			if err := tx.Save(&draft).Error; err != nil {
				return fmt.Errorf("保存草稿失败: %w", err)
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if oldFilePath != "" {
		os.Remove(oldFilePath) // 事务已提交，磁盘清理失败容忍
	}

	// 构建预览
	var preview string
	if processMode == ProcessModeDirect {
		preview = fmt.Sprintf("[%s] %.2f MB - 将直接传递给AI", fileName, float64(len(content))/(1024*1024))
	} else {
		preview = truncateString(extractedText, 500)
	}

	resp := &UploadFileResponse{
		FileID:         file.ID,
		FileName:       fileName,
		FileExt:        extWithoutDot,
		FileSize:       int64(len(content)),
		ProcessMode:    processMode,
		ContentPreview: preview,
	}

	// 匿名用户返回 anon_token
	if draft.AnonToken != "" && userID == 0 {
		resp.AnonToken = draft.AnonToken
	}

	return resp, nil
}

// AddAttachmentToDraft 添加附件到草稿
// 附件处理策略：
// - PDF/图片：直接传递文件给 AI
// - Word/RTF/ODT/XML/HTML/TXT：提取文字，超过 50000 字符自动截取
func (s *Service) AddAttachmentToDraft(userID uint, fileName string, fileExt string, content []byte) (*FileInfo, error) {
	// 附件要求登录，匿名不走此路径
	draft, err := s.GetOrCreateDraft(userID, "")
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

	// 删文件记录 + 清空 draft 引用必须原子，
	// 否则会出现 draft.ManuscriptFileID 指向已删记录的悬空状态，loadTaskFiles 静默失败。
	return s.db.Transaction(func(tx *gorm.DB) error {
		var file PeerReviewFile
		if err := tx.First(&file, *draft.ManuscriptFileID).Error; err == nil {
			if file.FilePath != "" {
				os.Remove(file.FilePath) // 磁盘清理失败容忍，由扫表收尾
			}
			if err := tx.Delete(&file).Error; err != nil {
				return fmt.Errorf("删除文件记录失败: %w", err)
			}
		}

		draft.ManuscriptFileID = nil
		draft.InputType = InputTypeText
		draft.ManuscriptText = ""
		draft.Title = ""
		if err := tx.Save(&draft).Error; err != nil {
			return fmt.Errorf("更新草稿失败: %w", err)
		}
		return nil
	})
}

// ClearDraft 清空草稿（删除主稿件和所有附件）
// 登录用户按 user_id；匿名用户按 anon_token
func (s *Service) ClearDraft(userID uint, anonToken string) error {
	var draft PeerReviewTask
	var err error

	switch {
	case userID > 0:
		err = s.db.Where("user_id = ? AND status = ?", userID, TaskStatusDraft).First(&draft).Error
	case anonToken != "":
		err = s.db.Where("anon_token = ? AND user_id = 0 AND status = ?", anonToken, TaskStatusDraft).First(&draft).Error
	default:
		return nil // 匿名且无 token，无草稿可清
	}

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // 没有草稿，直接返回成功
		}
		return err
	}

	// 主稿件 + 附件 + draft 重置必须原子，否则会出现 draft 看似已清空、
	// 但 PeerReviewFile 表里残留指向同 task_id 的孤儿记录的状态。
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 收集需要从磁盘删除的路径，DB 事务成功后再清磁盘
		// （磁盘删除若失败有扫表兜底，但 DB 不能回滚已删的文件）
		var paths []string

		if draft.ManuscriptFileID != nil {
			var file PeerReviewFile
			if err := tx.First(&file, *draft.ManuscriptFileID).Error; err == nil {
				if file.FilePath != "" {
					paths = append(paths, file.FilePath)
				}
				if err := tx.Delete(&file).Error; err != nil {
					return fmt.Errorf("删除主稿件失败: %w", err)
				}
			}
		}

		var attachments []PeerReviewFile
		if err := tx.Where("task_id = ? AND file_role = ?", draft.ID, FileRoleAttachment).
			Find(&attachments).Error; err != nil {
			return err
		}
		for _, att := range attachments {
			if att.FilePath != "" {
				paths = append(paths, att.FilePath)
			}
		}
		// 批量删除附件记录（1 条 SQL 替代 N 条）
		if len(attachments) > 0 {
			if err := tx.Where("task_id = ? AND file_role = ?", draft.ID, FileRoleAttachment).
				Delete(&PeerReviewFile{}).Error; err != nil {
				return fmt.Errorf("删除附件失败: %w", err)
			}
		}

		draft.ManuscriptFileID = nil
		draft.InputType = InputTypeText
		draft.ManuscriptText = ""
		draft.Title = ""
		if err := tx.Save(&draft).Error; err != nil {
			return fmt.Errorf("重置草稿失败: %w", err)
		}

		// DB 事务即将提交：磁盘清理失败不影响一致性
		for _, p := range paths {
			os.Remove(p)
		}
		return nil
	})
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
		AnonToken:      draft.AnonToken, // 匿名草稿返回 token 给前端持久化
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
