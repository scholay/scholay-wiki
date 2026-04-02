// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"log/slog"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/thirdparty"
	"strconv"

	"github.com/gin-gonic/gin"
)

// useAdvancedSearchV2 检查是否使用优化版的智能检索
// 通过环境变量 USE_ADVANCED_SEARCH_V2 控制，默认为 true（使用优化版）
func useAdvancedSearchV2() bool {
	if config.AppConfig != nil {
		return config.AppConfig.App.UseAdvancedSearchV2
	}
	return true
}

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// CreateConversation creates a new conversation
func (h *Handler) CreateConversation(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req CreateConversationRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Default to search type if not provided
	conversationType := req.ConversationType
	if conversationType == "" {
		conversationType = ConversationTypeSearch
	}

	conversation, err := h.service.CreateConversation(c.Request.Context(), userID, req.Title, conversationType)
	if err != nil {
		utils.Error(c, 500, "Failed to create conversation: "+err.Error())
		return
	}

	utils.Success(c, conversation)
}

// GetUserConversations gets all conversations for the current user
func (h *Handler) GetUserConversations(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// Optional conversation_type filter
	var conversationType *ConversationType
	if typeParam := c.Query("conversation_type"); typeParam != "" {
		convType := ConversationType(typeParam)
		conversationType = &convType
	}

	result, err := h.service.GetUserConversations(c.Request.Context(), userID, page, pageSize, conversationType)
	if err != nil {
		utils.Error(c, 500, "Failed to get conversations: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetConversation gets a conversation with its messages (supports pagination)
// Query params:
// - page: page number (1-based, default: 1)
// - page_size: messages per page (default: 20, max: 100)
// If no pagination params provided, returns all messages (backward compatible)
func (h *Handler) GetConversation(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	// Check if pagination is requested
	pageStr := c.Query("page")
	pageSizeStr := c.Query("page_size")

	// If no pagination params, return all messages (backward compatible)
	if pageStr == "" && pageSizeStr == "" {
		conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), conversationID, userID)
		if err != nil {
			utils.Error(c, 500, "Failed to get conversation: "+err.Error())
			return
		}
		utils.Success(c, conversation)
		return
	}

	// Parse pagination params
	page := 1
	pageSize := 20

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
			pageSize = ps
		}
	}

	conversation, err := h.service.GetConversationWithMessagesPaginated(c.Request.Context(), conversationID, userID, page, pageSize)
	if err != nil {
		utils.Error(c, 500, "Failed to get conversation: "+err.Error())
		return
	}

	utils.Success(c, conversation)
}

// DeleteConversation deletes a conversation
func (h *Handler) DeleteConversation(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteConversation(c.Request.Context(), conversationID, userID); err != nil {
		utils.Error(c, 500, "Failed to delete conversation: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Conversation deleted successfully"})
}

// AddMessage adds a message to a conversation
func (h *Handler) AddMessage(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req CreateMessageRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	message, err := h.service.AddMessage(c.Request.Context(), conversationID, userID, req)
	if err != nil {
		utils.Error(c, 500, "Failed to add message: "+err.Error())
		return
	}

	utils.Success(c, message)
}

// UpdateConversationTitle updates the title of a conversation
func (h *Handler) UpdateConversationTitle(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Title string `json:"title" binding:"required"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := h.service.UpdateConversationTitle(c.Request.Context(), conversationID, userID, req.Title); err != nil {
		utils.Error(c, 500, "Failed to update title: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Title updated successfully"})
}

// StreamAdvancedSearch 处理基于AI的智能分析请求（使用MCP工具）
func (h *Handler) StreamAdvancedSearch(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	messageID, ok := utils.ParseUintParam(c, "messageId")
	if !ok {
		return
	}

	// Get model level from query parameter (default to "mid")
	modelLevelParam := c.DefaultQuery("model_level", "mid")
	var modelLevel string
	switch modelLevelParam {
	case "low", "mid", "high":
		modelLevel = modelLevelParam
	default:
		modelLevel = "mid"
	}

	// Verify conversation belongs to user
	conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), conversationID, userID)
	if err != nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// Find the target message
	var targetMessage *ConversationMessage
	for i := range conversation.Messages {
		if conversation.Messages[i].ID == messageID {
			targetMessage = &conversation.Messages[i]
			break
		}
	}

	if targetMessage == nil {
		utils.Error(c, 404, "Message not found")
		return
	}

	sse.SetHeaders(c)

	// 执行智能分析并流式返回结果（使用指定的模型级别）
	// 根据环境变量选择使用 V1 或 V2 版本
	if useAdvancedSearchV2() {
		slog.Info("using optimized advanced search V2")
		err = h.service.AdvancedSearchAndAnalyzeV2(
			c.Request.Context(),
			conversationID,
			targetMessage.SearchQuery,
			c.Writer,
			userID,
			thirdparty.ModelLevel(modelLevel),
		)
	} else {
		slog.Info("using original advanced search V1")
		err = h.service.AdvancedSearchAndAnalyze(
			c.Request.Context(),
			conversationID,
			targetMessage.SearchQuery,
			c.Writer,
			userID,
			thirdparty.ModelLevel(modelLevel),
		)
	}
	if err != nil {
		sse.WriteErrorText(c.Writer, err.Error())
		return
	}

	sse.WriteDone(c.Writer)
}

// StreamContinueConversation handles continuing the conversation with context
func (h *Handler) StreamContinueConversation(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Query      string `json:"query" binding:"required"`
		ModelLevel string `json:"model_level"` // Optional, defaults to "mid"
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	// Validate and default model level
	modelLevel := req.ModelLevel
	if modelLevel == "" {
		modelLevel = "mid"
	}
	switch modelLevel {
	case "low", "mid", "high":
		// Valid model level
	default:
		modelLevel = "mid"
	}

	// Verify conversation belongs to user
	conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), conversationID, userID)
	if err != nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// Verify the conversation exists
	if conversation == nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	sse.SetHeaders(c)

	// 按指定模型级别继续对话
	err = h.service.ContinueConversation(
		c.Request.Context(),
		conversationID,
		req.Query,
		c.Writer,
		userID,
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		sse.WriteErrorText(c.Writer, err.Error())
		return
	}

	sse.WriteDone(c.Writer)
}

// GetFollowUpQuestions handles getting follow-up questions for a message
// This is a separate endpoint called after the streaming response completes
func (h *Handler) GetFollowUpQuestions(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	messageID, ok := utils.ParseUintParam(c, "messageId")
	if !ok {
		return
	}

	// Call service to get or generate follow-up questions
	questions, err := h.service.GetFollowUpQuestions(c.Request.Context(), conversationID, messageID, userID)
	if err != nil {
		utils.Error(c, 404, err.Error())
		return
	}

	// Return questions as JSON
	utils.Success(c, map[string]any{
		"questions": questions,
	})
}
