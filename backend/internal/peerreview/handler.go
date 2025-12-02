package peerreview

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/utils"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ========== 草稿管理 API ==========

// GetDraft 获取用户的草稿（每个用户只有一个草稿）
// GET /api/v1/user/peer-review/draft
func (h *Handler) GetDraft(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	draft, err := h.service.GetOrCreateDraft(userID.(uint))
	if err != nil {
		utils.Error(c, 5001, "获取草稿失败: "+err.Error())
		return
	}

	utils.Success(c, draft)
}

// SaveDraft 保存草稿
// PUT /api/v1/user/peer-review/draft
func (h *Handler) SaveDraft(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var req SaveDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4002, "请求参数错误: "+err.Error())
		return
	}

	draft, err := h.service.SaveDraft(userID.(uint), &req)
	if err != nil {
		utils.Error(c, 5001, "保存草稿失败: "+err.Error())
		return
	}

	utils.Success(c, draft)
}

// SubmitDraft 提交草稿开始审稿
// POST /api/v1/user/peer-review/draft/submit
func (h *Handler) SubmitDraft(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var req SubmitDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许不传参数，使用默认值
		req.ModelLevel = "mid"
	}

	if req.ModelLevel == "" {
		req.ModelLevel = "mid"
	}

	task, err := h.service.SubmitDraft(userID.(uint), &req)
	if err != nil {
		utils.Error(c, 5001, "提交审稿失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"task_id": task.ID,
		"status":  task.Status,
		"message": "审稿任务已创建，正在处理中",
	})
}

// ========== 任务管理 API ==========

// CreateTask 创建审稿任务（保留兼容）
// POST /api/v1/user/peer-review/tasks
func (h *Handler) CreateTask(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4002, "请求参数错误: "+err.Error())
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

	task, err := h.service.CreateTask(userID.(uint), &req)
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
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	status := c.Query("status") // 可选筛选

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	response, err := h.service.GetTaskList(userID.(uint), page, pageSize, status)
	if err != nil {
		utils.Error(c, 5002, "获取任务列表失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// GetTaskDetail 获取任务详情
// GET /api/v1/user/peer-review/tasks/:id
func (h *Handler) GetTaskDetail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	taskID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 4005, "无效的任务ID")
		return
	}

	response, err := h.service.GetTaskDetail(userID.(uint), uint(taskID))
	if err != nil {
		utils.Error(c, 5003, "获取任务详情失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// GetTaskProgress 获取任务进度（用于轮询）
// GET /api/v1/user/peer-review/tasks/:id/progress
func (h *Handler) GetTaskProgress(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	taskID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 4005, "无效的任务ID")
		return
	}

	progress, err := h.service.GetTaskProgress(userID.(uint), uint(taskID))
	if err != nil {
		utils.Error(c, 5004, "获取任务进度失败: "+err.Error())
		return
	}

	utils.Success(c, progress)
}

// DeleteTask 删除任务
// DELETE /api/v1/user/peer-review/tasks/:id
func (h *Handler) DeleteTask(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	taskID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 4005, "无效的任务ID")
		return
	}

	if err := h.service.DeleteTask(userID.(uint), uint(taskID)); err != nil {
		utils.Error(c, 5005, "删除任务失败: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "任务已删除"})
}

// StartTask 启动草稿任务
// POST /api/v1/user/peer-review/tasks/:id/start
func (h *Handler) StartTask(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	taskID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 4005, "无效的任务ID")
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

	if err := h.service.StartDraftTask(userID.(uint), uint(taskID), req.TargetVenue, req.ModelLevel); err != nil {
		utils.Error(c, 5006, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "任务已启动"})
}

// ========== 文件上传 API ==========

// UploadFile 上传文件（解析文本，不创建任务）
// POST /api/v1/user/peer-review/upload
func (h *Handler) UploadFile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.Error(c, 4006, "请选择要上传的文件")
		return
	}
	defer file.Close()

	// 检查文件大小（限制 10MB）
	if header.Size > 10*1024*1024 {
		utils.Error(c, 4007, "文件大小不能超过 10MB")
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
	}
	if !allowedExts[ext] {
		utils.Error(c, 4008, "不支持的文件类型，请上传 txt、doc、docx、rtf、odt 或 pdf 文件")
		return
	}

	// 读取文件内容
	content, err := io.ReadAll(file)
	if err != nil {
		utils.Error(c, 5006, "读取文件失败: "+err.Error())
		return
	}

	// 解析文件并保存到草稿
	response, err := h.service.ParseFileAndSaveToDraft(userID.(uint), header.Filename, ext, content)
	if err != nil {
		utils.Error(c, 5007, "处理文件失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// ========== SSE 流式接口（实时查看进度） ==========

// WatchTaskProgress SSE 流式监听任务进度
// GET /api/v1/user/peer-review/tasks/:id/watch
func (h *Handler) WatchTaskProgress(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}

	taskID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的任务ID"})
		return
	}

	// 设置 SSE 响应头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")

	// 监听任务进度
	err = h.service.WatchTaskProgress(userID.(uint), uint(taskID), c.Writer)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: {\"type\":\"error\",\"data\":\"%s\"}\n\n", err.Error())
	}
}

// ========== 兼容旧接口 ==========

// RunPeerReview 运行审稿（同步流式接口，兼容旧版）
// POST /api/v1/user/peer-review/run
func (h *Handler) RunPeerReview(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}

	var req PeerReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// 设置 SSE 响应头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")

	// 执行审稿流程
	err := h.service.RunPeerReview(userID.(uint), &req, c.Writer)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: {\"type\":\"error\",\"data\":\"%s\"}\n\n", err.Error())
	}
}

// GetReviewHistory 获取审稿历史（兼容旧接口）
// GET /api/v1/user/peer-review/history
func (h *Handler) GetReviewHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	// 重定向到新接口
	response, err := h.service.GetTaskList(userID.(uint), 1, 20, "")
	if err != nil {
		utils.Error(c, 5002, "获取历史记录失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}

// GetReviewDetail 获取审稿详情（兼容旧接口）
// GET /api/v1/user/peer-review/:id
func (h *Handler) GetReviewDetail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	reviewID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 4005, "无效的ID")
		return
	}

	response, err := h.service.GetTaskDetail(userID.(uint), uint(reviewID))
	if err != nil {
		utils.Error(c, 5003, "获取详情失败: "+err.Error())
		return
	}

	utils.Success(c, response)
}
