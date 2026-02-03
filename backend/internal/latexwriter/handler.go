// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler 处理 LaTeX Writer 相关的 HTTP 请求
type Handler struct {
	service *Service
}

// NewHandler 创建新的 Handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// StreamChat 流式 AI 对话
// POST /api/v1/user/latex-writer/chat/stream
func (h *Handler) StreamChat(c *gin.Context) {
	// 获取用户 ID
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	// 解析请求
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[LaTeXWriter] StreamChat called by user %v, prompt length: %d\n", userID, len(req.Prompt))

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 流式输出
	if err := h.service.StreamChat(&req, c.Writer); err != nil {
		fmt.Printf("[LaTeXWriter] StreamChat error: %v\n", err)
		// 错误时发送错误事件
		c.SSEvent("error", err.Error())
	}

	// 发送结束标记
	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
}

// CreateDocument 创建文档
// POST /api/v1/user/latex-writer/files
func (h *Handler) CreateDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	var req CreateDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	doc, err := h.service.CreateDocument(userID.(uint), &req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "创建文档失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "创建成功", doc)
}

// GetDocuments 获取文档列表
// GET /api/v1/user/latex-writer/files
func (h *Handler) GetDocuments(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	// 检查是否请求树形结构
	if c.Query("tree") == "true" {
		tree, err := h.service.GetDocumentTree(userID.(uint))
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "获取文档列表失败: "+err.Error())
			return
		}
		utils.SuccessResponse(c, http.StatusOK, "获取成功", tree)
		return
	}

	docs, err := h.service.GetUserDocuments(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取文档列表失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "获取成功", docs)
}

// GetDocument 获取单个文档
// GET /api/v1/user/latex-writer/files/:id
func (h *Handler) GetDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	doc, err := h.service.GetDocument(uint(id), userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "获取成功", doc)
}

// UpdateDocument 更新文档
// PUT /api/v1/user/latex-writer/files/:id
func (h *Handler) UpdateDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	var req UpdateDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	doc, err := h.service.UpdateDocument(uint(id), userID.(uint), &req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "更新文档失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "更新成功", doc)
}

// DeleteDocument 删除文档
// DELETE /api/v1/user/latex-writer/files/:id
func (h *Handler) DeleteDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	if err := h.service.DeleteDocument(uint(id), userID.(uint)); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "删除文档失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "删除成功", gin.H{"message": "删除成功"})
}

// TaskRequest 任务请求
type TaskRequest struct {
	TaskType   string `json:"task_type" binding:"required"`
	Content    string `json:"content" binding:"required"`
	ModelLevel string `json:"model_level"`
	Variables  map[string]string `json:"variables"`
}

// ExecuteTask 执行特定任务
// POST /api/v1/user/latex-writer/task/stream
func (h *Handler) ExecuteTask(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	var req TaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[LaTeXWriter] ExecuteTask called by user %v, task: %s\n", userID, req.TaskType)

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 执行任务
	if err := h.service.ExecuteTask(req.TaskType, req.Content, c.Writer, req.ModelLevel); err != nil {
		fmt.Printf("[LaTeXWriter] ExecuteTask error: %v\n", err)
		c.SSEvent("error", err.Error())
	}

	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
}

// SectionRequest 章节请求
type SectionRequest struct {
	SectionType string `json:"section_type" binding:"required"`
	Content     string `json:"content" binding:"required"`
	ModelLevel  string `json:"model_level"`
}

// ExecuteSection 执行章节写作任务
// POST /api/v1/user/latex-writer/section/stream
func (h *Handler) ExecuteSection(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	var req SectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[LaTeXWriter] ExecuteSection called by user %v, section: %s\n", userID, req.SectionType)

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 执行章节任务
	if err := h.service.ExecuteSectionTask(req.SectionType, req.Content, c.Writer, req.ModelLevel); err != nil {
		fmt.Printf("[LaTeXWriter] ExecuteSection error: %v\n", err)
		c.SSEvent("error", err.Error())
	}

	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
}

// GetAvailableTasks 获取可用任务列表
// GET /api/v1/user/latex-writer/tasks
func (h *Handler) GetAvailableTasks(c *gin.Context) {
	tasks := make([]map[string]string, 0)
	for key, task := range TaskPrompts {
		tasks = append(tasks, map[string]string{
			"id":   key,
			"name": task.Name,
		})
	}
	utils.SuccessResponse(c, http.StatusOK, "获取成功", tasks)
}

// GetAvailableSections 获取可用章节列表
// GET /api/v1/user/latex-writer/sections
func (h *Handler) GetAvailableSections(c *gin.Context) {
	sections := make([]map[string]string, 0)
	for key, section := range SectionPrompts {
		sections = append(sections, map[string]string{
			"id":   key,
			"name": section.Name,
		})
	}
	utils.SuccessResponse(c, http.StatusOK, "获取成功", sections)
}
