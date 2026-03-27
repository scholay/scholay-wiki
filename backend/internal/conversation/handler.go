// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"
	"log/slog"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/currency"
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
func (h *Handler) deductForSmartAnalysisAfterSuccess(ctx context.Context, userID uint, modelLevel string) int64 {
	if h.currencyService == nil {
		slog.Info("currency service not set, skip deduct")
		return 0
	}

	bizType := h.getBizTypeForSmartAnalysis(modelLevel)
	transaction, err := h.currencyService.DeductByBizType(ctx, userID, bizType, "")
	if err != nil {
		slog.Error("deduct failed after success", "userID", userID, "bizType", bizType, "err", err)
		return 0
	}
	if transaction == nil {
		slog.Info("no deduct config or disabled", "userID", userID, "bizType", bizType)
		return 0
	}
	// transaction.Amount 是负数（扣费），取绝对值返回
	amount := transaction.Amount
	if amount < 0 {
		amount = -amount
	}
	slog.Info("deduct success", "userID", userID, "bizType", bizType, "amount", amount)
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

	conversation, err := h.service.CreateConversation(c.Request.Context(), userID.(uint), req.Title, conversationType)
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

	result, err := h.service.GetUserConversations(c.Request.Context(), userID.(uint), page, pageSize, conversationType)
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
		conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), uint(conversationID), userID.(uint))
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

	conversation, err := h.service.GetConversationWithMessagesPaginated(c.Request.Context(), uint(conversationID), userID.(uint), page, pageSize)
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

	if err := h.service.DeleteConversation(c.Request.Context(), uint(conversationID), userID.(uint)); err != nil {
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

	message, err := h.service.AddMessage(c.Request.Context(), uint(conversationID), userID.(uint), req)
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

	if err := h.service.UpdateConversationTitle(c.Request.Context(), uint(conversationID), userID.(uint), req.Title); err != nil {
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
	conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), uint(conversationID), userID.(uint))
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
			utils.PaymentRequired(c, "经费不足", nil)
		} else {
			utils.Error(c, 500, "检查余额失败: "+err.Error())
		}
		return
	}

	sse.SetHeaders(c)

	// 2. 执行智能分析并流式返回结果（使用指定的模型级别）
	// 根据环境变量选择使用 V1 或 V2 版本
	if useAdvancedSearchV2() {
		slog.Info("using optimized advanced search V2")
		err = h.service.AdvancedSearchAndAnalyzeV2(
			c.Request.Context(),
			uint(conversationID),
			targetMessage.SearchQuery,
			c.Writer,
			userID.(uint),
			thirdparty.ModelLevel(modelLevel),
		)
	} else {
		slog.Info("using original advanced search V1")
		err = h.service.AdvancedSearchAndAnalyze(
			c.Request.Context(),
			uint(conversationID),
			targetMessage.SearchQuery,
			c.Writer,
			userID.(uint),
			thirdparty.ModelLevel(modelLevel),
		)
	}
	if err != nil {
		sse.WriteErrorText(c.Writer, err.Error())
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForSmartAnalysisAfterSuccess(c.Request.Context(), userID.(uint), modelLevel)

	sse.WriteDoneWithData(c.Writer, map[string]int64{"deducted_amount": deductedAmount})
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
	conversation, err := h.service.GetConversationWithMessages(c.Request.Context(), uint(conversationID), userID.(uint))
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
			utils.PaymentRequired(c, "经费不足", nil)
		} else {
			utils.Error(c, 500, "检查余额失败: "+err.Error())
		}
		return
	}

	sse.SetHeaders(c)

	// 2. Continue the conversation with specified model level
	err = h.service.ContinueConversation(
		c.Request.Context(),
		uint(conversationID),
		req.Query,
		c.Writer,
		userID.(uint),
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		sse.WriteErrorText(c.Writer, err.Error())
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForSmartAnalysisAfterSuccess(c.Request.Context(), userID.(uint), modelLevel)

	sse.WriteDoneWithData(c.Writer, map[string]int64{"deducted_amount": deductedAmount})
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
	questions, err := h.service.GetFollowUpQuestions(c.Request.Context(), uint(conversationID), uint(messageID), userID.(uint))
	if err != nil {
		utils.Error(c, 404, err.Error())
		return
	}

	// Return questions as JSON
	utils.Success(c, map[string]any{
		"questions": questions,
	})
}
