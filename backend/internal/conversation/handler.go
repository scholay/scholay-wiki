// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"
	"fmt"
	"net/http"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/currency"
	"scholar-backend/internal/thirdparty"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service         *Service
	currencyService *currency.Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// SetCurrencyService sets the currency service for deduction
func (h *Handler) SetCurrencyService(currencyService *currency.Service) {
	h.currencyService = currencyService
}

// getBizTypeForSmartAnalysis 根据模型级别获取业务类型
func (h *Handler) getBizTypeForSmartAnalysis(modelLevel string) string {
	switch modelLevel {
	case "mid":
		return "smart_analysis_mid"
	case "high":
		return "smart_analysis_high"
	default:
		return "smart_analysis_low"
	}
}

// checkBalanceForSmartAnalysis 检查余额是否充足（不扣费）
func (h *Handler) checkBalanceForSmartAnalysis(userID uint, modelLevel string) error {
	if h.currencyService == nil {
		return nil
	}

	bizType := h.getBizTypeForSmartAnalysis(modelLevel)
	checkResult, err := h.currencyService.CheckBalanceByBizType(userID, bizType)
	if err != nil {
		return err
	}
	if !checkResult.Sufficient {
		return currency.ErrInsufficientBalance
	}
	return nil
}

// deductForSmartAnalysisAfterSuccess 成功后扣费，返回扣费金额
func (h *Handler) deductForSmartAnalysisAfterSuccess(userID uint, modelLevel string) int64 {
	if h.currencyService == nil {
		fmt.Printf("[Smart Analysis] Currency service not set, skip deduct\n")
		return 0
	}

	bizType := h.getBizTypeForSmartAnalysis(modelLevel)
	ctx := context.Background()
	transaction, err := h.currencyService.DeductByBizType(ctx, userID, bizType, "")
	if err != nil {
		fmt.Printf("[Smart Analysis] Deduct failed after success: userID=%d, bizType=%s, err=%v\n", userID, bizType, err)
		return 0
	}
	if transaction == nil {
		fmt.Printf("[Smart Analysis] No deduct config or disabled: userID=%d, bizType=%s\n", userID, bizType)
		return 0
	}
	// transaction.Amount 是负数（扣费），取绝对值返回
	amount := transaction.Amount
	if amount < 0 {
		amount = -amount
	}
	fmt.Printf("[Smart Analysis] Deduct success: userID=%d, bizType=%s, amount=%d\n", userID, bizType, amount)
	return amount
}

// CreateConversation creates a new conversation
func (h *Handler) CreateConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	var req CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	// Default to search type if not provided
	conversationType := req.ConversationType
	if conversationType == "" {
		conversationType = ConversationTypeSearch
	}

	conversation, err := h.service.CreateConversation(userID.(uint), req.Title, conversationType)
	if err != nil {
		utils.Error(c, 500, "Failed to create conversation: "+err.Error())
		return
	}

	utils.Success(c, conversation)
}

// GetUserConversations gets all conversations for the current user
func (h *Handler) GetUserConversations(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
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

	result, err := h.service.GetUserConversations(userID.(uint), page, pageSize, conversationType)
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
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	// Check if pagination is requested
	pageStr := c.Query("page")
	pageSizeStr := c.Query("page_size")

	// If no pagination params, return all messages (backward compatible)
	if pageStr == "" && pageSizeStr == "" {
		conversation, err := h.service.GetConversationWithMessages(uint(conversationID), userID.(uint))
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

	conversation, err := h.service.GetConversationWithMessagesPaginated(uint(conversationID), userID.(uint), page, pageSize)
	if err != nil {
		utils.Error(c, 500, "Failed to get conversation: "+err.Error())
		return
	}

	utils.Success(c, conversation)
}

// DeleteConversation deletes a conversation
func (h *Handler) DeleteConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	if err := h.service.DeleteConversation(uint(conversationID), userID.(uint)); err != nil {
		utils.Error(c, 500, "Failed to delete conversation: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Conversation deleted successfully"})
}

// AddMessage adds a message to a conversation
func (h *Handler) AddMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	var req CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	message, err := h.service.AddMessage(uint(conversationID), userID.(uint), req)
	if err != nil {
		utils.Error(c, 500, "Failed to add message: "+err.Error())
		return
	}

	utils.Success(c, message)
}

// UpdateConversationTitle updates the title of a conversation
func (h *Handler) UpdateConversationTitle(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	var req struct {
		Title string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.UpdateConversationTitle(uint(conversationID), userID.(uint), req.Title); err != nil {
		utils.Error(c, 500, "Failed to update title: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Title updated successfully"})
}

// StreamAdvancedSearch 处理基于AI的智能分析请求（使用MCP工具）
func (h *Handler) StreamAdvancedSearch(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	messageID, err := strconv.ParseUint(c.Param("messageId"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid message ID")
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
	conversation, err := h.service.GetConversationWithMessages(uint(conversationID), userID.(uint))
	if err != nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// Find the target message
	var targetMessage *ConversationMessage
	for i := range conversation.Messages {
		if conversation.Messages[i].ID == uint(messageID) {
			targetMessage = &conversation.Messages[i]
			break
		}
	}

	if targetMessage == nil {
		utils.Error(c, 404, "Message not found")
		return
	}

	// 1. 先检查余额（不扣费）
	if err := h.checkBalanceForSmartAnalysis(userID.(uint), modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.Error(c, 500, "检查余额失败: "+err.Error())
		}
		return
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 2. 执行智能分析并流式返回结果（使用指定的模型级别）
	err = h.service.AdvancedSearchAndAnalyze(
		uint(conversationID),
		targetMessage.SearchQuery,
		c.Writer,
		userID.(uint),
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		// Error handling for streaming - write error as SSE, do not deduct
		c.Writer.Write([]byte(fmt.Sprintf("data: [ERROR] %s\n\n", err.Error())))
		c.Writer.(http.Flusher).Flush()
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForSmartAnalysisAfterSuccess(userID.(uint), modelLevel)

	// Send done signal with deducted amount
	c.Writer.Write([]byte(fmt.Sprintf("data: [DONE] {\"deducted_amount\": %d}\n\n", deductedAmount)))
	c.Writer.(http.Flusher).Flush()
}

// StreamContinueConversation handles continuing the conversation with context
func (h *Handler) StreamContinueConversation(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	var req struct {
		Query      string `json:"query" binding:"required"`
		ModelLevel string `json:"model_level"` // Optional, defaults to "mid"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
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
	conversation, err := h.service.GetConversationWithMessages(uint(conversationID), userID.(uint))
	if err != nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// Verify the conversation exists
	if conversation == nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// 1. 先检查余额（不扣费）
	if err := h.checkBalanceForSmartAnalysis(userID.(uint), modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.Error(c, 500, "检查余额失败: "+err.Error())
		}
		return
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 2. Continue the conversation with specified model level
	err = h.service.ContinueConversation(
		uint(conversationID),
		req.Query,
		c.Writer,
		userID.(uint),
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		// Error handling for streaming - write error as SSE, do not deduct
		c.Writer.Write([]byte(fmt.Sprintf("data: [ERROR] %s\n\n", err.Error())))
		c.Writer.(http.Flusher).Flush()
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForSmartAnalysisAfterSuccess(userID.(uint), modelLevel)

	// Send done signal with deducted amount
	c.Writer.Write([]byte(fmt.Sprintf("data: [DONE] {\"deducted_amount\": %d}\n\n", deductedAmount)))
	c.Writer.(http.Flusher).Flush()
}


// GetFollowUpQuestions handles getting follow-up questions for a message
// This is a separate endpoint called after the streaming response completes
func (h *Handler) GetFollowUpQuestions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 401, "Unauthorized")
		return
	}

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid conversation ID")
		return
	}

	messageID, err := strconv.ParseUint(c.Param("messageId"), 10, 32)
	if err != nil {
		utils.Error(c, 400, "Invalid message ID")
		return
	}

	// Call service to get or generate follow-up questions
	questions, err := h.service.GetFollowUpQuestions(uint(conversationID), uint(messageID), userID.(uint))
	if err != nil {
		utils.Error(c, 404, err.Error())
		return
	}

	// Return questions as JSON
	utils.Success(c, map[string]interface{}{
		"questions": questions,
	})
}
