// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
)

// Handler 反馈处理器
type Handler struct {
	service *Service
}

// NewHandler 创建反馈处理器
func NewHandler(service *Service) *Handler {
	handler := &Handler{
		service: service,
	}

	// 启动定时清理未使用附件的任务
	safego.Go("feedback-cleanup-attachments", handler.startCleanupTask)

	return handler
}

// startCleanupTask 启动清理未使用附件的定时任务
func (h *Handler) startCleanupTask() {
	// 启动时先执行一次清理
	h.cleanupUnusedAttachments()

	ticker := time.NewTicker(10 * time.Minute) // 每10分钟检查一次
	defer ticker.Stop()

	for range ticker.C {
		h.cleanupUnusedAttachments()
	}
}

// cleanupUnusedAttachments 清理游离附件（未绑定反馈的附件）
func (h *Handler) cleanupUnusedAttachments() {
	// 策略1: 删除创建超过1小时且未绑定反馈的附件（用户上传后1小时内未提交反馈）
	olderThan := time.Now().Add(-1 * time.Hour).Format("2006-01-02 15:04:05")
	count, err := h.service.CleanupOrphanAttachments(olderThan)
	if err != nil {
		slog.Error("failed to cleanup orphan attachments", "err", err)
		return
	}

	if count > 0 {
		slog.Info("cleaned up orphan attachments from database", "count", count, "older_than", "1h")
	}

	// 策略2: 如果游离附件总数超过限制，删除最旧的
	maxOrphanCount := 100 // 最多保留100个游离附件
	excessCount, err := h.service.CleanupExcessOrphanAttachments(maxOrphanCount)
	if err != nil {
		slog.Error("failed to cleanup excess orphan attachments", "err", err)
		return
	}

	if excessCount > 0 {
		slog.Info("cleaned up excess orphan attachments", "count", excessCount, "limit", maxOrphanCount)
	}
}

// 文件上传限制
const (
	MaxFileCount  = 2        // 最大文件数量
	MaxImageCount = 10       // 最大图片数量
	MaxFileSize   = 10 << 20 // 单个文件最大10MB
	MaxTotalSize  = 50 << 20 // 总文件大小最大50MB
)

// 允许的文件类型
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

var allowedFileTypes = map[string]bool{
	"application/pdf":                                                        true,
	"application/msword":                                                     true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel":                                               true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":      true,
	"text/plain":                                                             true,
	"application/zip":                                                        true,
	"application/x-rar-compressed":                                           true,
	"application/x-zip-compressed":                                           true,
}

// CreateFeedbackRequestWithKey 创建反馈请求（带附件key）
type CreateFeedbackRequestWithKey struct {
	Email          string `json:"email" binding:"required,email"`
	Content        string `json:"content" binding:"required,min=10,max=5000"`
	AttachmentsKey string `json:"attachmentsKey"` // 上传附件时返回的key
}

// CreateFeedback 创建反馈（公共接口）
// POST /api/v1/public/feedback
func (h *Handler) CreateFeedback(c *gin.Context) {
	var req CreateFeedbackRequestWithKey
	if !utils.BindJSON(c, &req) {
		return
	}

	// 公共接口不获取用户信息，匿名反馈
	var userID *uint
	var username string

	// 获取IP
	ip := c.ClientIP()

	// 使用attachmentsKey从数据库获取附件
	feedback, err := h.service.CreateFeedbackWithAttachments(&req.Email, &req.Content, userID, username, ip, req.AttachmentsKey)
	if err != nil {
		utils.Error(c, 5001, "创建反馈失败: "+err.Error())
		return
	}

	utils.Success(c, feedback)
}

// CreateFeedbackWithUser 创建反馈（已登录用户，会关联用户信息）
// POST /api/v1/user/feedback
func (h *Handler) CreateFeedbackWithUser(c *gin.Context) {
	var req CreateFeedbackRequestWithKey
	if !utils.BindJSON(c, &req) {
		return
	}

	// 从认证中间件获取用户信息
	var userID *uint
	if uid, ok := utils.GetOptionalUserID(c); ok {
		userID = &uid
	}
	var username string
	if uname, exists := c.Get("username"); exists {
		username = uname.(string)
	}

	// 获取IP
	ip := c.ClientIP()

	// 使用attachmentsKey从数据库获取附件
	feedback, err := h.service.CreateFeedbackWithAttachments(&req.Email, &req.Content, userID, username, ip, req.AttachmentsKey)
	if err != nil {
		utils.Error(c, 5001, "创建反馈失败: "+err.Error())
		return
	}

	utils.Success(c, feedback)
}

// UploadAttachments 上传附件（公共接口）
// POST /api/v1/public/feedback/upload
func (h *Handler) UploadAttachments(c *gin.Context) {
	// 解析multipart表单
	if err := c.Request.ParseMultipartForm(MaxTotalSize); err != nil {
		utils.Error(c, 4002, "文件过大或格式错误")
		return
	}

	form := c.Request.MultipartForm
	if form == nil || form.File == nil {
		utils.Error(c, 4003, "没有上传文件")
		return
	}

	// 获取或生成上传批次key
	uploadKey := c.PostForm("uploadKey")
	if uploadKey == "" {
		uploadKey = uuid.New().String()
	}

	var savedAttachments []FeedbackAttachment
	var imageCount, fileCount int
	var totalSize int64

	// 处理文件
	files := form.File["files"]
	for _, fileHeader := range files {
		// 检查文件大小
		if fileHeader.Size > MaxFileSize {
			utils.Error(c, 4004, fmt.Sprintf("文件 %s 超过10MB限制", fileHeader.Filename))
			return
		}
		totalSize += fileHeader.Size

		// 检查总大小
		if totalSize > MaxTotalSize {
			utils.Error(c, 4005, "文件总大小超过50MB限制")
			return
		}

		// 打开文件
		file, err := fileHeader.Open()
		if err != nil {
			utils.Error(c, 5002, "打开文件失败")
			return
		}
		defer file.Close()

		// 读取整个文件到内存
		fileData, err := io.ReadAll(file)
		if err != nil {
			utils.Error(c, 5003, "读取文件失败")
			return
		}

		// 检测文件类型
		contentType := http.DetectContentType(fileData)

		// 判断是图片还是文件
		isImage := allowedImageTypes[contentType]
		isFile := allowedFileTypes[contentType]

		if !isImage && !isFile {
			utils.Error(c, 4006, fmt.Sprintf("不支持的文件类型: %s", contentType))
			return
		}

		// 检查数量限制
		if isImage {
			imageCount++
			if imageCount > MaxImageCount {
				utils.Error(c, 4007, fmt.Sprintf("图片数量超过%d张限制", MaxImageCount))
				return
			}
		} else {
			fileCount++
			if fileCount > MaxFileCount {
				utils.Error(c, 4008, fmt.Sprintf("文件数量超过%d个限制", MaxFileCount))
				return
			}
		}

		fileType := "file"
		if isImage {
			fileType = "image"
		}

		// 保存到数据库
		attachment := &FeedbackAttachment{
			UploadKey:    uploadKey,
			OriginalName: fileHeader.Filename,
			FileData:     fileData,
			FileSize:     fileHeader.Size,
			FileType:     fileType,
			MimeType:     contentType,
			IsUsed:       false,
		}

		if err := h.service.SaveAttachment(attachment); err != nil {
			utils.Error(c, 5007, "保存附件失败: "+err.Error())
			return
		}

		savedAttachments = append(savedAttachments, *attachment)
	}

	// 转换为前端期望的格式
	var attachments []Attachment
	for _, att := range savedAttachments {
		attachments = append(attachments, att.ToAttachment())
	}

	utils.Success(c, gin.H{
		"attachmentsKey": uploadKey,
		"uploadKey":      uploadKey,
		"attachments":    attachments,
		"files":          attachments, // 兼容前端期望的字段名
	})
}

// GetAttachment 获取附件（公共接口，用于下载/预览）
// GET /api/v1/public/feedback/attachment/:id
func (h *Handler) GetAttachment(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	attachment, err := h.service.GetAttachmentByID(id)
	if err != nil {
		utils.Error(c, 5001, "附件不存在")
		return
	}

	// 设置响应头
	c.Header("Content-Type", attachment.MimeType)
	c.Header("Content-Length", strconv.FormatInt(attachment.FileSize, 10))

	// 如果是文件类型，设置下载头
	if attachment.FileType == "file" {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", attachment.OriginalName))
	} else {
		// 图片类型，设置为内联显示
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", attachment.OriginalName))
	}

	// 写入文件数据
	c.Data(http.StatusOK, attachment.MimeType, attachment.FileData)
}

// ========== 管理端接口 ==========

// ListFeedbacks 获取反馈列表（管理端）
// GET /api/v1/admin/feedbacks
func (h *Handler) ListFeedbacks(c *gin.Context) {
	var req FeedbackListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, 4001, "参数错误: "+err.Error())
		return
	}

	result, err := h.service.ListFeedbacks(&req)
	if err != nil {
		utils.Error(c, 5001, "获取反馈列表失败: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetFeedback 获取反馈详情（管理端）
// GET /api/v1/admin/feedbacks/:id
func (h *Handler) GetFeedback(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	feedback, err := h.service.GetFeedback(id)
	if err != nil {
		utils.Error(c, 5001, "获取反馈详情失败: "+err.Error())
		return
	}

	// 解析附件
	attachments, _ := h.service.GetAttachments(feedback)

	utils.Success(c, gin.H{
		"feedback":    feedback,
		"attachments": attachments,
	})
}

// UpdateStatus 更新反馈状态（管理端）
// PUT /api/v1/admin/feedbacks/:id/status
func (h *Handler) UpdateStatus(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateStatusRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := h.service.UpdateStatus(id, req.Status); err != nil {
		utils.Error(c, 5001, "更新状态失败: "+err.Error())
		return
	}

	utils.Success(c, nil)
}

// ReplyFeedback 回复反馈（管理端）
// POST /api/v1/admin/feedbacks/:id/reply
func (h *Handler) ReplyFeedback(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req ReplyFeedbackRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 获取管理员用户名
	adminUsername := "admin"
	if username, exists := c.Get("adminUsername"); exists {
		adminUsername = username.(string)
	}

	if err := h.service.ReplyFeedback(id, req.ReplyContent, adminUsername); err != nil {
		utils.Error(c, 5001, "回复反馈失败: "+err.Error())
		return
	}

	utils.Success(c, nil)
}

// DeleteFeedback 删除反馈（管理端）
// DELETE /api/v1/admin/feedbacks/:id
func (h *Handler) DeleteFeedback(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	// 删除反馈及其附件记录（附件数据在数据库中，会级联删除）
	_, err := h.service.DeleteFeedbackWithAttachments(id)
	if err != nil {
		utils.Error(c, 5001, "删除反馈失败: "+err.Error())
		return
	}

	utils.Success(c, nil)
}

// GetStats 获取反馈统计（管理端）
// GET /api/v1/admin/feedbacks/stats
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		utils.Error(c, 5001, "获取统计失败: "+err.Error())
		return
	}

	utils.Success(c, stats)
}
