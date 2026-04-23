// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ========== 草稿管理 API ==========

// GetDraft 获取草稿（匿名：按 anon_token 查询；登录：按 user_id）
// GET /api/v1/user/peer-review/draft?anon_token=xxx
func (h *Handler) GetDraft(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	draft, err := h.service.GetOrCreateDraft(userID, anonToken)
	if err != nil {
		utils.Error(c, 5001, "获取草稿失败: "+err.Error())
		return
	}

	utils.Success(c, draft)
}

// SaveDraft 保存草稿（匿名：按 anon_token 查询；若无则生成并返回给前端）
// PUT /api/v1/user/peer-review/draft
func (h *Handler) SaveDraft(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)

	var req SaveDraftRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 匿名用户可通过 query 或 header 带 anon_token
	anonToken := c.Query("anon_token")
	if anonToken == "" {
		anonToken = c.GetHeader("X-Anon-Token")
	}

	draft, err := h.service.SaveDraft(userID, anonToken, &req)
	if err != nil {
		utils.Error(c, 5001, "保存草稿失败: "+err.Error())
		return
	}

	utils.Success(c, draft)
}

// SubmitDraft 提交草稿开始审稿
// POST /api/v1/user/peer-review/draft/submit
// 支持匿名用户：未登录时通过 anon_token 提交
func (h *Handler) SubmitDraft(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)

	var req SubmitDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许不传参数，使用默认值
		req.ModelLevel = "mid"
	}

	if req.ModelLevel == "" {
		req.ModelLevel = "mid"
	}

	trialCtx := TrialContext{
		DeviceID: GetDeviceIDFromContext(c),
		IPUAHash: GetIPUAHashFromContext(c),
	}
	task, err := h.service.SubmitDraft(userID, req.AnonToken, &req, trialCtx)
	if err != nil {
		utils.Error(c, 5001, "提交审稿失败: "+err.Error())
		return
	}

	// 构建完整的响应数据，便于前端立即显示
	response := gin.H{
		"task_id":         task.ID,
		"status":          task.Status,
		"message":         "审稿任务已创建，正在处理中",
		"input_type":      task.InputType,
		"manuscript_text": task.ManuscriptText,
		"target_venue":    "", // 已废弃，保持兼容
		"model_level":     task.ModelLevel,
		"is_private":      task.IsPrivate,
		"created_at":      task.SubmittedAt, // 使用提交时间作为创建时间显示
	}

	// 匿名任务返回 anon_token
	if task.AnonToken != "" {
		response["anon_token"] = task.AnonToken
	}

	// 添加主稿件文件信息
	if task.ManuscriptFile != nil {
		response["manuscript_file"] = gin.H{
			"id":        task.ManuscriptFile.ID,
			"file_name": task.ManuscriptFile.FileName,
			"file_ext":  task.ManuscriptFile.FileExt,
			"file_size": task.ManuscriptFile.FileSize,
		}
	}

	// 添加附件信息
	if len(task.Attachments) > 0 {
		attachments := make([]gin.H, len(task.Attachments))
		for i, att := range task.Attachments {
			attachments[i] = gin.H{
				"id":        att.ID,
				"file_name": att.FileName,
				"file_ext":  att.FileExt,
				"file_size": att.FileSize,
			}
		}
		response["attachments"] = attachments
	}

	utils.Success(c, response)
}

// ========== 任务管理 API ==========

// CreateTask 创建审稿任务（保留兼容）
// POST /api/v1/user/peer-review/tasks
func (h *Handler) CreateTask(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req CreateTaskRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 验证输入
	if req.InputType == InputTypeText && req.ManuscriptText == "" {
		utils.Error(c, 4003, "请输入稿件内容")
		return
	}
	if req.InputType == InputTypeFile && req.FileID == 0 {
		utils.Error(c, 4004, "请选择要上传的文件")
		return
	}

	task, err := h.service.CreateTask(userID, &req)
	if err != nil {
		utils.Error(c, 5001, "创建任务失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"task_id": task.ID,
		"status":  task.Status,
		"message": "任务创建成功，正在处理中",
	})
}

// GetTaskList 获取任务列表
// GET /api/v1/user/peer-review/tasks
func (h *Handler) GetTaskList(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	status := c.Query("status")   // 可选筛选
	search := c.Query("search")   // 搜索关键词

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	response, err := h.service.GetTaskList(userID, page, pageSize, status, search)
	if err != nil {
		utils.Error(c, 5002, "获取任务列表失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// GetTaskDetail 获取任务详情（支持匿名访问）
// GET /api/v1/user/peer-review/tasks/:id
func (h *Handler) GetTaskDetail(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	response, err := h.service.GetTaskDetail(userID, taskID, anonToken)
	if err != nil {
		utils.Error(c, 5003, "获取任务详情失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// GetTaskProgress 获取任务进度（支持匿名访问）
// GET /api/v1/user/peer-review/tasks/:id/progress
func (h *Handler) GetTaskProgress(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	progress, err := h.service.GetTaskProgress(userID, taskID, anonToken)
	if err != nil {
		utils.Error(c, 5004, "获取任务进度失败: "+err.Error())
		return
	}

	utils.Success(c, progress)
}

// GetTaskSteps 获取任务步骤详情（支持匿名访问）
// GET /api/v1/user/peer-review/tasks/:id/steps
func (h *Handler) GetTaskSteps(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	steps, err := h.service.GetTaskSteps(userID, taskID, anonToken)
	if err != nil {
		utils.Error(c, 5004, "获取任务步骤失败: "+err.Error())
		return
	}

	utils.Success(c, steps)
}

// DeleteTask 删除任务（匿名通过 anon_token 校验归属；登录通过 user_id）
// DELETE /api/v1/user/peer-review/tasks/:id?anon_token=xxx
func (h *Handler) DeleteTask(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if userID == 0 && anonToken == "" {
		utils.Error(c, 401, "请登录或提供匿名令牌")
		return
	}

	if err := h.service.DeleteTask(userID, taskID, anonToken); err != nil {
		utils.Error(c, 5005, "删除任务失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "任务已删除"})
}

// StartTask 启动草稿任务（支持匿名访问）
// POST /api/v1/user/peer-review/tasks/:id/start
func (h *Handler) StartTask(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req StartTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许不传参数，使用默认值
		req.ModelLevel = "mid"
	}

	if req.ModelLevel == "" {
		req.ModelLevel = "mid"
	}

	anonToken := req.AnonToken
	if err := h.service.StartDraftTask(userID, taskID, "", req.ModelLevel, anonToken); err != nil {
		utils.Error(c, 5006, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "任务已启动"})
}

// ========== 文件上传 API ==========

// UploadFile 上传文件（解析文本，不创建任务）
// POST /api/v1/user/peer-review/upload
// 支持匿名用户：未登录时使用 anon_token 关联草稿
func (h *Handler) UploadFile(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.Error(c, 4006, "请选择要上传的文件")
		return
	}
	defer file.Close()

	// 检查文件大小（主稿件限制 5MB）
	maxSize := int64(5 * 1024 * 1024)
	if header.Size > maxSize {
		sizeMB := float64(header.Size) / 1024 / 1024
		utils.Error(c, 4007, fmt.Sprintf("文件大小不能超过 5MB，当前文件 %.1fMB", sizeMB))
		return
	}

	// 检查文件类型
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".txt":  true,
		".doc":  true,
		".docx": true,
		".rtf":  true,
		".odt":  true,
		".pdf":  true,
		".xml":  true,
		".html": true,
		".htm":  true,
	}
	if !allowedExts[ext] {
		utils.Error(c, 4008, "不支持的文件类型，请上传 txt、doc、docx、rtf、odt、pdf、xml 或 html 文件")
		return
	}

	// 读取文件内容
	content, err := io.ReadAll(file)
	if err != nil {
		utils.Error(c, 5006, "读取文件失败: "+err.Error())
		return
	}

	// 解析文件并保存到草稿
	response, err := h.service.ParseFileAndSaveToDraft(userID, anonToken, header.Filename, ext, content)
	if err != nil {
		utils.Error(c, 5007, "处理文件失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// UploadAttachment 上传附件到草稿（需要登录）
// POST /api/v1/user/peer-review/attachments
func (h *Handler) UploadAttachment(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.Error(c, 4006, "请选择要上传的文件")
		return
	}
	defer file.Close()

	// 检查文件大小（附件限制 5MB）
	maxSize := int64(5 * 1024 * 1024)
	if header.Size > maxSize {
		sizeMB := float64(header.Size) / 1024 / 1024
		utils.Error(c, 4007, fmt.Sprintf("附件大小不能超过 5MB，当前文件 %.1fMB", sizeMB))
		return
	}

	// 附件支持更多文件类型
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !IsAllowedFileType(strings.TrimPrefix(ext, ".")) {
		utils.Error(c, 4008, "不支持的文件类型")
		return
	}

	// 读取文件内容
	content, err := io.ReadAll(file)
	if err != nil {
		utils.Error(c, 5006, "读取文件失败: "+err.Error())
		return
	}

	// 添加附件到草稿
	response, err := h.service.AddAttachmentToDraft(userID, header.Filename, ext, content)
	if err != nil {
		utils.Error(c, 5007, err.Error())
		return
	}

	utils.Success(c, response)
}

// DeleteAttachment 从草稿删除附件
// DELETE /api/v1/user/peer-review/attachments/:id
func (h *Handler) DeleteAttachment(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	attachmentID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteAttachmentFromDraft(userID, attachmentID); err != nil {
		utils.Error(c, 5005, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "附件已删除"})
}

// DeleteManuscript 从草稿删除主稿件文件
// DELETE /api/v1/user/peer-review/manuscript
func (h *Handler) DeleteManuscript(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	if err := h.service.DeleteManuscriptFromDraft(userID); err != nil {
		utils.Error(c, 5005, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "主稿件已删除"})
}

// ClearDraft 清空草稿（删除主稿件和所有附件）
// DELETE /api/v1/user/peer-review/draft?anon_token=xxx
func (h *Handler) ClearDraft(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	if err := h.service.ClearDraft(userID, anonToken); err != nil {
		utils.Error(c, 5005, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "草稿已清空"})
}

// ========== SSE 流式接口（实时查看进度） ==========

// WatchTaskProgress SSE 流式监听任务进度（支持匿名访问）
// GET /api/v1/user/peer-review/tasks/:id/watch
func (h *Handler) WatchTaskProgress(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	taskID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	w, stop := sse.BeginStream(c)
	defer stop()

	err := h.service.WatchTaskProgress(userID, taskID, anonToken, w)
	if err != nil {
		sse.WriteError(w, err.Error())
	}
}

// DownloadFile 下载文件（支持匿名访问）
// GET /api/v1/user/peer-review/files/:id/download
func (h *Handler) DownloadFile(c *gin.Context) {
	userID, _ := utils.GetOptionalUserID(c)
	anonToken := c.Query("anon_token")

	fileID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	file, filePath, err := h.service.GetFileForDownload(userID, fileID, anonToken)
	if err != nil {
		utils.Error(c, 5008, err.Error())
		return
	}

	// 设置下载响应头
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", file.FileName))
	c.Header("Content-Type", "application/octet-stream")
	c.File(filePath)
}

// ClaimTask 认领匿名任务（将匿名任务绑定到登录用户）
// POST /api/v1/user/peer-review/claim-task
func (h *Handler) ClaimTask(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req ClaimTaskRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := h.service.ClaimTask(userID, req.TaskID, req.AnonToken); err != nil {
		utils.Error(c, 5001, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "任务认领成功"})
}

// TrialStatus 查询匿名试用状态
// GET /api/v1/user/peer-review/trial-status
// 前端在进入审稿页时调用，根据返回决定入口 UI
func (h *Handler) TrialStatus(c *gin.Context) {
	// 登录用户不受试用限制，直接允许
	if userID, _ := utils.GetOptionalUserID(c); userID > 0 {
		utils.Success(c, TrialStatusResponse{CanTrial: true, Reason: "logged_in"})
		return
	}

	deviceID := GetDeviceIDFromContext(c)
	ipUAHash := GetIPUAHashFromContext(c)

	canTrial, existing, err := h.service.CheckAnonTrialQuota(deviceID, ipUAHash)
	if err != nil {
		utils.Error(c, 5001, err.Error())
		return
	}

	resp := TrialStatusResponse{CanTrial: canTrial}
	if canTrial {
		resp.Reason = "new_device"
	} else if existing != nil {
		resp.Reason = "already_used"
		resp.ConsumedAt = &existing.ConsumedAt
		resp.AlreadyClaimed = existing.ClaimedByUserID > 0
	}
	utils.Success(c, resp)
}

// ClaimAll 登录成功后批量认领该匿名令牌下的所有任务
// POST /api/v1/user/peer-review/claim-all
// body: { "anon_token": "xxx" }
func (h *Handler) ClaimAll(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req ClaimAllRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	claimedIDs, err := h.service.ClaimAllByAnonToken(userID, req.AnonToken)
	if err != nil {
		utils.Error(c, 5001, err.Error())
		return
	}

	utils.Success(c, ClaimAllResponse{
		ClaimedTaskIDs: claimedIDs,
		ClaimedCount:   len(claimedIDs),
	})
}
