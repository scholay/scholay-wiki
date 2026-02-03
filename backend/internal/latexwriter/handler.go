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
	"strings"

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
		
		// 将错误信息转换为用户友好的提示
		errorMsg := h.formatUserFriendlyError(err)
		
		// 以结构化格式发送错误消息（使用 <br> 转义换行符）
		escapedMsg := strings.ReplaceAll(errorMsg, "\n", "<br>")
		c.Writer.Write([]byte(fmt.Sprintf("data: <reply><br>⚠️ **AI 服务异常**<br><br>%s<br></reply><br>", escapedMsg)))
		c.Writer.Flush()
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

// ============================================
// 对话历史相关 API
// ============================================

// GetDocumentConversation 获取文档对话信息
// GET /api/v1/user/latex-writer/documents/:id/conversation
func (h *Handler) GetDocumentConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	// 验证文档所有权
	_, err = h.service.GetDocument(uint(documentID), userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}

	// 获取或创建对话
	conv, err := h.service.convService.GetOrCreateConversation(userID.(uint), uint(documentID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取对话失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "获取成功", conv)
}

// GetConversationHistory 获取对话历史（分页）
// GET /api/v1/user/latex-writer/documents/:id/conversation/messages
func (h *Handler) GetConversationHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	// 验证文档所有权
	_, err = h.service.GetDocument(uint(documentID), userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}

	// 分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// 获取对话
	conv, err := h.service.convService.GetConversation(userID.(uint), uint(documentID))
	if err != nil {
		// 如果对话不存在，返回空列表
		utils.SuccessResponse(c, http.StatusOK, "获取成功", &ConversationHistoryResponse{
			Conversation: nil,
			Messages:     []LatexChatMessage{},
			Total:        0,
			Page:         page,
			PageSize:     pageSize,
			HasMore:      false,
		})
		return
	}

	// 获取历史
	history, err := h.service.convService.GetHistory(conv.ID, page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取历史失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "获取成功", history)
}

// StreamChatWithContext 流式对话（带上下文）
// POST /api/v1/user/latex-writer/documents/:id/chat/stream
func (h *Handler) StreamChatWithContext(c *gin.Context) {
	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("[HANDLER] ==================== 📨 收到 AI 对话请求 ====================")
	
	userID, exists := c.Get("user_id")
	if !exists {
		fmt.Println("[HANDLER] ❌ 用户未登录")
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}
	fmt.Printf("[HANDLER] 👤 用户ID: %v\n", userID)

	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		fmt.Printf("[HANDLER] ❌ 无效的文档ID: %s\n", idStr)
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}
	fmt.Printf("[HANDLER] 📄 文档ID: %d\n", documentID)

	// 验证文档所有权
	_, err = h.service.GetDocument(uint(documentID), userID.(uint))
	if err != nil {
		fmt.Printf("[HANDLER] ❌ 文档不存在或无权访问: %v\n", err)
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}
	fmt.Println("[HANDLER] ✅ 文档权限验证通过")

	// 解析请求
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Printf("[HANDLER] ❌ 请求参数解析失败: %v\n", err)
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[HANDLER] 📝 请求参数:\n")
	fmt.Printf("[HANDLER]   - Prompt长度: %d 字符\n", len(req.Prompt))
	fmt.Printf("[HANDLER]   - Context长度: %d 字符\n", len(req.Context))
	fmt.Printf("[HANDLER]   - FullContent长度: %d 字符\n", len(req.FullContent))
	fmt.Printf("[HANDLER]   - ModelID: %d\n", req.ModelID)
	
	// 打印 Prompt 预览
	promptPreview := req.Prompt
	if len(promptPreview) > 100 {
		promptPreview = promptPreview[:100] + "..."
	}
	fmt.Printf("[HANDLER]   - Prompt预览: %s\n", promptPreview)
	fmt.Println("[HANDLER] 📡 开始 SSE 流...")
	fmt.Println(strings.Repeat("=", 80))

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 流式输出（带上下文）
	if err := h.service.StreamChatWithContext(userID.(uint), uint(documentID), &req, c.Writer); err != nil {
		fmt.Printf("[HANDLER] ❌ StreamChatWithContext 错误: %v\n", err)
		
		// 将错误信息转换为用户友好的提示
		errorMsg := h.formatUserFriendlyError(err)
		
		// 以结构化格式发送错误消息（使用 <br> 转义换行符）
		escapedMsg := strings.ReplaceAll(errorMsg, "\n", "<br>")
		c.Writer.Write([]byte(fmt.Sprintf("data: <reply><br>⚠️ **AI 服务异常**<br><br>%s<br></reply><br>", escapedMsg)))
		c.Writer.Flush()
	}

	// 发送结束标记
	fmt.Println("[HANDLER] 🏁 发送 [DONE] 标记")
	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
	fmt.Println("[HANDLER] ✅ SSE 流结束")
	fmt.Println(strings.Repeat("=", 80) + "\n")
}

// ClearConversation 清空对话
// DELETE /api/v1/user/latex-writer/documents/:id/conversation
func (h *Handler) ClearConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	// 验证文档所有权
	_, err = h.service.GetDocument(uint(documentID), userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}

	// 获取对话
	conv, err := h.service.convService.GetConversation(userID.(uint), uint(documentID))
	if err != nil {
		// 对话不存在，视为成功
		utils.SuccessResponse(c, http.StatusOK, "清空成功", gin.H{"message": "对话已清空"})
		return
	}

	// 清空对话
	if err := h.service.convService.ClearConversation(conv.ID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "清空失败: "+err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "清空成功", gin.H{"message": "对话已清空"})
}

// ============================================
// LaTeX 验证相关 API
// ============================================

// ValidateLatexRequest 验证请求
type ValidateLatexRequest struct {
	Content string `json:"content" binding:"required"`
}

// ValidateLatex 验证 LaTeX 代码语法
// POST /api/v1/user/latex-writer/validate
func (h *Handler) ValidateLatex(c *gin.Context) {
	var req ValidateLatexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	// 验证代码
	validator := NewLatexValidator()
	result := validator.Validate(req.Content)

	utils.SuccessResponse(c, http.StatusOK, "验证完成", result)
}

// AutoFixLatexRequest 自动修复请求
type AutoFixLatexRequest struct {
	Content    string `json:"content" binding:"required"`
	ModelLevel string `json:"model_level"`
}

// AutoFixLatex 自动修复 LaTeX 代码
// POST /api/v1/user/latex-writer/auto-fix
func (h *Handler) AutoFixLatex(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	var req AutoFixLatexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[LaTeXWriter] AutoFixLatex called by user %v, content length: %d\n", userID, len(req.Content))

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 调用自动修复服务
	if err := h.service.AutoFixLatex(req.Content, c.Writer, req.ModelLevel); err != nil {
		fmt.Printf("[LaTeXWriter] AutoFixLatex error: %v\n", err)
		c.SSEvent("error", err.Error())
	}

	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
}

// ValidateAndFixLatex 验证并自动修复 LaTeX 代码（带上下文的版本）
// POST /api/v1/user/latex-writer/documents/:id/validate-fix
func (h *Handler) ValidateAndFixLatex(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	// 验证文档所有权
	_, err = h.service.GetDocument(uint(documentID), userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "文档不存在")
		return
	}

	var req AutoFixLatexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	// 先验证
	validator := NewLatexValidator()
	result := validator.Validate(req.Content)

	// 如果没有错误，直接返回
	if result.Valid && len(result.Warnings) == 0 {
		utils.SuccessResponse(c, http.StatusOK, "代码验证通过，无需修复", gin.H{
			"valid":   true,
			"content": req.Content,
			"result":  result,
		})
		return
	}

	fmt.Printf("[LaTeXWriter] ValidateAndFixLatex: found %d errors, %d warnings\n", len(result.Errors), len(result.Warnings))

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 调用带验证结果的自动修复
	if err := h.service.AutoFixLatexWithValidation(req.Content, result, c.Writer, req.ModelLevel); err != nil {
		fmt.Printf("[LaTeXWriter] ValidateAndFixLatex error: %v\n", err)
		c.SSEvent("error", err.Error())
	}

	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
}

// GetAvailableModels 获取可用模型列表（用户端）
// GET /api/v1/user/latex-writer/models
func (h *Handler) GetAvailableModels(c *gin.Context) {
	models, err := h.service.GetAvailableModels()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取模型列表失败: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"models": models,
		"total":  len(models),
	})
}

// ExportToWord 将 LaTeX 导出为 Word 文档
// POST /api/v1/user/latex-writer/export/word
func (h *Handler) ExportToWord(c *gin.Context) {
	// 获取用户 ID（验证登录状态）
	_, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	// 解析请求
	var req struct {
		Content  string `json:"content" binding:"required"`
		Filename string `json:"filename"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	// 使用 Pandoc 转换
	docxBytes, err := h.service.ConvertLatexToWord(req.Content, req.Filename)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "转换失败: "+err.Error())
		return
	}

	// 设置下载响应头
	filename := req.Filename
	if filename == "" {
		filename = "document"
	}
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.docx\"", filename))
	c.Header("Content-Length", strconv.Itoa(len(docxBytes)))
	
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes)
}

// formatUserFriendlyError 将技术性错误转换为用户友好的提示
func (h *Handler) formatUserFriendlyError(err error) string {
	errStr := err.Error()
	
	// API 错误（404, 401, 403 等）
	if strings.Contains(errStr, "404") || strings.Contains(errStr, "not found") {
		return "当前 AI 模型服务不可用，请稍后重试或联系管理员切换模型配置。"
	}
	
	if strings.Contains(errStr, "401") || strings.Contains(errStr, "Unauthorized") || strings.Contains(errStr, "unauthorized") {
		return "AI 模型认证失败，请联系管理员检查 API 密钥配置。"
	}
	
	if strings.Contains(errStr, "403") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "forbidden") {
		return "AI 模型访问被拒绝，请联系管理员检查账户权限。"
	}
	
	if strings.Contains(errStr, "429") || strings.Contains(errStr, "rate limit") || strings.Contains(errStr, "Too Many Requests") {
		return "AI 服务请求过于频繁，请稍后再试。"
	}
	
	if strings.Contains(errStr, "500") || strings.Contains(errStr, "502") || strings.Contains(errStr, "503") || strings.Contains(errStr, "504") {
		return "AI 服务暂时不可用，请稍后重试。"
	}
	
	// 网络错误
	if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "Timeout") {
		return "AI 服务响应超时，请稍后重试。"
	}
	
	if strings.Contains(errStr, "connection") || strings.Contains(errStr, "network") || strings.Contains(errStr, "dial") {
		return "无法连接到 AI 服务，请检查网络后重试。"
	}
	
	// 熔断器错误
	if strings.Contains(errStr, "circuit breaker") || strings.Contains(errStr, "Circuit Breaker") {
		return "AI 服务暂时熔断保护中，请稍后重试。"
	}
	
	// 配额/余额错误
	if strings.Contains(errStr, "quota") || strings.Contains(errStr, "balance") || strings.Contains(errStr, "insufficient") {
		return "AI 服务配额不足，请联系管理员。"
	}
	
	// 默认错误消息
	return "AI 服务出现异常，请稍后重试。如果问题持续，请联系管理员。"
}

// FixCompileError 根据编译错误修复 LaTeX 代码
// POST /api/v1/user/latex-writer/documents/:id/fix-compile-error/stream
func (h *Handler) FixCompileError(c *gin.Context) {
	// 获取用户 ID
	userID, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}

	// 获取文档 ID
	idStr := c.Param("id")
	documentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的文档 ID")
		return
	}

	// 解析请求
	var req FixCompileErrorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数错误: "+err.Error())
		return
	}

	fmt.Printf("[LaTeXWriter] FixCompileError called by user %v, doc %d, log length: %d\n", 
		userID, documentID, len(req.CompileLog))

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	fmt.Println("[Handler] 📡 SSE Stream started (FixCompileError)")

	// 调用 service 修复编译错误
	if err := h.service.AutoFixCompileError(req.Content, req.CompileLog, req.Engine, c.Writer); err != nil {
		fmt.Printf("[LaTeXWriter] FixCompileError error: %v\n", err)
		
		errorMsg := h.formatUserFriendlyError(err)
		// 使用 <br> 转义换行符
		escapedMsg := strings.ReplaceAll(errorMsg, "\n", "<br>")
		c.Writer.Write([]byte(fmt.Sprintf("data: <reply><br>⚠️ **AI 服务异常**<br><br>%s<br></reply><br>", escapedMsg)))
		c.Writer.Flush()
	}

	// 发送结束标记
	fmt.Println("[Handler] 🏁 Sending [DONE] marker (FixCompileError)")
	c.Writer.Write([]byte("data: [DONE]\n\n"))
	c.Writer.Flush()
	fmt.Println("[Handler] ✅ SSE Stream ended (FixCompileError)")
}
