// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
	"crypto/subtle"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
)

// ========== 文件上传约束 (走 MinIO, 不入库 BLOB) ==========

// MaxImageBytes 单个图片最大尺寸 (10MB) — image/* 类
const MaxImageBytes int64 = 10 << 20

// MaxFileBytes 单个文件最大尺寸 (10MB) — pdf/doc/zip 等
const MaxFileBytes int64 = 10 << 20

// MaxTotalBytes 单次上传总和上限 (50MB)
const MaxTotalBytes int64 = 50 << 20

// MaxImageCount 单次上传最多图片数
const MaxImageCount = 10

// MaxFileCount 单次上传最多文件数
const MaxFileCount = 5

// allowedImageTypes 允许的图片 MIME (通过 http.DetectContentType 嗅探)
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

// allowedFileTypes 允许的非图片附件 MIME
var allowedFileTypes = map[string]bool{
	"application/pdf":                                                        true,
	"application/msword":                                                     true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel":                                               true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":      true,
	"text/plain":                                                             true,
	"application/zip":                                                        true,
	"application/x-zip-compressed":                                           true,
}

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

// CreateFeedbackRequestWithKey 创建反馈请求（带附件key）
type CreateFeedbackRequestWithKey struct {
	Email          string `json:"email" binding:"required,email"`
	Content        string `json:"content" binding:"required,min=10,max=5000"`
	AttachmentsKey string `json:"attachmentsKey"` // 上传附件时返回的key
	// Category 可选，不传时落库走 model 默认 "other"。
	// 前端表单"反馈类型"映射到这里，保证 admin 列表的分类列有真实数据可看。
	Category string `json:"category" binding:"omitempty,oneof=bug feature complaint praise other"`
}

// CreateFeedback 创建反馈 —— **登录 / 匿名统一入口**。
// POST /api/v1/public/feedback (挂 OptionalUserAuthMiddleware) · POST /api/v1/user/feedback
//
// 归属口径:带 token → 记到具体用户(user_id + username);无 token → 匿名。
// 前端 http 拦截器对**所有**请求(含 /public/*)都注入 Authorization,故公开入口挂 OptionalUserAuth
// 即可自动归属,前端无需分流。
//
// 历史 bug(2026-07 修):本函数原先硬写「公共接口不获取用户信息,匿名反馈」,且 /public/feedback
// 没挂 OptionalUserAuth;而前端不论登没登录都只调 /public/feedback → **所有反馈全记成匿名**
// (连带飞书通知里永远显示「匿名用户」,因为它读的就是这条记录的 username)。
// 与 papers/search 等公开路由同款修法(见 usagestat 也踩过同一个坑)。
func (h *Handler) CreateFeedback(c *gin.Context) {
	var req CreateFeedbackRequestWithKey
	if !utils.BindJSON(c, &req) {
		return
	}

	// 登录则关联用户(鉴权中间件已把 claims 放进 ctx);匿名则 userID=nil / username=""。
	var userID *uint
	if uid, ok := utils.GetOptionalUserID(c); ok {
		userID = &uid
	}
	var username string
	if uname, exists := c.Get("username"); exists {
		username, _ = uname.(string) // 双值断言:类型不符时退化成空串,不 panic
	}

	// 获取IP
	ip := c.ClientIP()

	// 使用attachmentsKey从数据库获取附件
	feedback, err := h.service.CreateFeedbackWithAttachments(&req.Email, &req.Content, req.Category, userID, username, ip, req.AttachmentsKey)
	if err != nil {
		utils.InternalError(c, 5001, "创建反馈失败", err)
		return
	}

	utils.Success(c, feedback)
}

// CreateFeedbackWithUser 创建反馈(已登录路由 /api/v1/user/feedback)。
// 与 CreateFeedback 同一套逻辑(都从 ctx 取可选用户)→ 直接委托,**不再维护第二份实现**:
// 历史上正是这两份分叉(公开那份硬写匿名)导致公开入口永远匿名。保留独立入口仅为兼容既有路由。
func (h *Handler) CreateFeedbackWithUser(c *gin.Context) {
	h.CreateFeedback(c)
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
		utils.InternalError(c, 5001, "获取反馈列表失败", err)
		return
	}

	utils.Success(c, result)
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
		utils.InternalError(c, 5001, "更新状态失败", err)
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

	// 获取管理员用户名 —— AuthMiddleware 写入的 key 是 username(不是 adminUsername),
	// 旧代码读错 key 导致署名永远回退成硬编码 "admin"。改读真实 key,回信落到真实管理员账号。
	adminUsername := "admin"
	if username, exists := c.Get("username"); exists {
		if s, ok := username.(string); ok && s != "" {
			adminUsername = s
		}
	}

	if err := h.service.ReplyFeedback(id, req.ReplyContent, adminUsername); err != nil {
		utils.InternalError(c, 5001, "回复反馈失败", err)
		return
	}

	utils.Success(c, nil)
}

// GetStats 获取反馈统计（管理端）
// GET /api/v1/admin/feedbacks/stats
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		utils.InternalError(c, 5001, "获取统计失败", err)
		return
	}

	utils.Success(c, stats)
}

// ========== 附件相关 (MinIO) ==========

// UploadAttachments 上传附件 (公开接口, 走 MinIO)。
// POST /api/v1/public/feedback/upload  Content-Type: multipart/form-data
//
// 表单字段:
//   - files (repeated): 实际文件
//   - uploadKey (可选): 想复用已有批次 key, 不传后端生成
//
// 响应: { uploadKey, attachments: [{ id, name, url, size, type }] }
func (h *Handler) UploadAttachments(c *gin.Context) {
	if err := c.Request.ParseMultipartForm(MaxTotalBytes); err != nil {
		utils.Error(c, 4002, "文件过大或格式错误")
		return
	}
	form := c.Request.MultipartForm
	if form == nil || len(form.File["files"]) == 0 {
		utils.Error(c, 4003, "没有上传文件")
		return
	}

	uploadKey := c.PostForm("uploadKey")
	if uploadKey == "" {
		uploadKey = uuid.New().String()
	}

	var (
		imageCount, fileCount int
		totalSize             int64
		saved                 []Attachment
	)
	for _, fh := range form.File["files"] {
		if fh.Size > MaxImageBytes && fh.Size > MaxFileBytes {
			utils.Error(c, 4004, fmt.Sprintf("文件 %s 超过 10MB 限制", fh.Filename))
			return
		}
		totalSize += fh.Size
		if totalSize > MaxTotalBytes {
			utils.Error(c, 4005, "文件总大小超过 50MB 限制")
			return
		}

		file, err := fh.Open()
		if err != nil {
			utils.Error(c, 5002, "打开文件失败")
			return
		}

		// 读 512 字节 sniff MIME, 然后构造一个 multireader 把已读的拼回去 — 不需要把整文件读入内存。
		header := make([]byte, 512)
		n, _ := io.ReadFull(file, header)
		header = header[:n]
		contentType := http.DetectContentType(header)

		isImage := allowedImageTypes[contentType]
		isFile := allowedFileTypes[contentType]
		if !isImage && !isFile {
			file.Close()
			utils.Error(c, 4006, fmt.Sprintf("不支持的文件类型: %s", contentType))
			return
		}
		if isImage {
			imageCount++
			if imageCount > MaxImageCount {
				file.Close()
				utils.Error(c, 4007, fmt.Sprintf("图片数量超过 %d 张限制", MaxImageCount))
				return
			}
		} else {
			fileCount++
			if fileCount > MaxFileCount {
				file.Close()
				utils.Error(c, 4008, fmt.Sprintf("文件数量超过 %d 个限制", MaxFileCount))
				return
			}
		}

		fileType := "file"
		if isImage {
			fileType = "image"
		}

		// 把已读的 header + 剩余流拼成完整 reader
		body := io.MultiReader(bytesReader(header), file)
		att, err := h.service.UploadAttachment(
			c.Request.Context(), uploadKey, fh.Filename, contentType, fileType,
			body, fh.Size,
		)
		file.Close()
		if err != nil {
			slog.Error("feedback: upload attachment failed",
				"file", fh.Filename, "err", err)
			utils.InternalError(c, 5007, "保存附件失败", err)
			return
		}
		saved = append(saved, att.ToAttachment())
	}

	utils.Success(c, gin.H{
		"uploadKey":   uploadKey,
		"attachments": saved,
	})
}

// bytesReader 把已读的字节包成 io.Reader (避免引入 bytes 包符号污染 import 列表)。
func bytesReader(b []byte) io.Reader { return &sliceReader{b: b} }

type sliceReader struct{ b []byte }

func (r *sliceReader) Read(p []byte) (int, error) {
	if len(r.b) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r.b)
	r.b = r.b[n:]
	return n, nil
}

// GetAttachment 下载/预览附件 (公开接口, 流式从 MinIO 透传)。
// GET /api/v1/public/feedback/attachment/:id
//
// 图片走 inline (浏览器直接渲染), 其它走 attachment (触发下载)。
func (h *Handler) GetAttachment(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	// 公开接口 + 自增 id ⇒ 必须用上传时返回的 uploadKey (UUID, 不可枚举) 做能力校验。
	// 否则任何人 id++ 枚举就能拉走全部反馈附件 (含用户截图/PII)。先取元数据校验 key,
	// 通过后才碰 MinIO;不区分 "不存在" 与 "key 不对",避免成为 id 枚举 oracle。
	meta, err := h.service.GetAttachmentByID(id)
	if err != nil || meta == nil {
		utils.NotFound(c, "附件不存在")
		return
	}
	key := strings.TrimSpace(c.Query("key"))
	if key == "" || subtle.ConstantTimeCompare([]byte(key), []byte(meta.UploadKey)) != 1 {
		utils.NotFound(c, "附件不存在")
		return
	}

	rc, att, err := h.service.OpenAttachment(c.Request.Context(), id)
	if err != nil {
		utils.InternalError(c, 5001, "附件不存在或读取失败", err)
		return
	}
	defer rc.Close()

	c.Header("Content-Type", att.MimeType)
	c.Header("Content-Length", strconv.FormatInt(att.FileSize, 10))
	disposition := "attachment"
	if att.FileType == "image" {
		disposition = "inline"
	}
	c.Header("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, att.OriginalName))

	if _, err := io.Copy(c.Writer, rc); err != nil {
		slog.Warn("feedback: stream attachment failed", "id", id, "err", err)
	}
}

// GetFeedback 反馈详情 (管理端) — 含附件列表。
// GET /api/v1/admin/feedbacks/:id
func (h *Handler) GetFeedback(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	feedback, err := h.service.GetFeedback(id)
	if err != nil {
		utils.InternalError(c, 5001, "获取反馈详情失败", err)
		return
	}
	attachments, _ := h.service.GetAttachments(feedback)
	utils.Success(c, gin.H{
		"feedback":    feedback,
		"attachments": attachments,
	})
}

// DeleteFeedback 删反馈 + MinIO 附件 (管理端)。
// DELETE /api/v1/admin/feedbacks/:id
func (h *Handler) DeleteFeedback(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if _, err := h.service.DeleteFeedbackWithAttachments(id); err != nil {
		utils.InternalError(c, 5001, "删除反馈失败", err)
		return
	}
	utils.Success(c, nil)
}

