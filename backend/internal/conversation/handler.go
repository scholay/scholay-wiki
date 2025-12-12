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

// deductForSmartAnalysis handles currency deduction for smart analysis based on model level
func (h *Handler) deductForSmartAnalysis(userID uint, modelLevel string) error {
	if h.currencyService == nil {
		return nil // No currency service configured, skip deduction
	}

	// Determine biz_type based on model level
	bizType := "smart_analysis_low"
	switch modelLevel {
	case "mid":
		bizType = "smart_analysis_mid"
	case "high":
		bizType = "smart_analysis_high"
	}

	// Get deduct config
	config, err := h.currencyService.GetDeductConfig(bizType)
	if err != nil {
		return err
	}

	// No config or amount is 0, skip deduction
	if config == nil || config.Amount == 0 {
		return nil
	}

	// Check balance
	checkResult, err := h.currencyService.CheckBalance(userID, config.CurrencyType, config.Amount)
	if err != nil {
		return err
	}

	if !checkResult.Sufficient {
		return currency.ErrInsufficientBalance
	}

	// Execute deduction
	ctx := context.Background()
	_, err = h.currencyService.Deduct(ctx, userID, &currency.DeductRequest{
		CurrencyType: config.CurrencyType,
		Amount:       config.Amount,
		BizType:      bizType,
		Description:  config.Description,
	})

	return err
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

// GetConversation gets a conversation with all its messages
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

	conversation, err := h.service.GetConversationWithMessages(uint(conversationID), userID.(uint))
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

	// Check quota BEFORE setting SSE headers to return proper HTTP error
	var featureType string
	switch modelLevel {
	case "low":
		featureType = "advanced_search_low"
	case "mid":
		featureType = "advanced_search_mid"
	case "high":
		featureType = "advanced_search_high"
	default:
		featureType = "advanced_search_mid"
	}

	// Perform quota check before SSE stream starts
	// Use the conversation service's subscription service to check quota
	hasQuota, err := h.service.subscriptionService.CheckQuota(userID.(uint), featureType)
	if err != nil {
		utils.Error(c, 500, fmt.Sprintf("Failed to check quota: %s", err.Error()))
		return
	}
	if !hasQuota {
		utils.Error(c, 403, "配额不足，请升级订阅")
		return
	}

	// Deduct currency before processing
	if err := h.deductForSmartAnalysis(userID.(uint), modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.Error(c, 500, "扣费失败: "+err.Error())
		}
		return
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 执行智能分析并流式返回结果（使用指定的模型级别）
	err = h.service.AdvancedSearchAndAnalyze(
		uint(conversationID),
		targetMessage.SearchQuery,
		c.Writer,
		userID.(uint),
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		// Error handling for streaming - write error as SSE
		c.Writer.Write([]byte(fmt.Sprintf("data: [ERROR] %s\n\n", err.Error())))
		c.Writer.(http.Flusher).Flush()
		return
	}

	// Send done signal
	c.Writer.Write([]byte("data: [DONE]\n\n"))
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

	// Deduct currency before processing
	if err := h.deductForSmartAnalysis(userID.(uint), modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.Error(c, 500, "扣费失败: "+err.Error())
		}
		return
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Continue the conversation with specified model level
	err = h.service.ContinueConversation(
		uint(conversationID),
		req.Query,
		c.Writer,
		userID.(uint),
		thirdparty.ModelLevel(modelLevel),
	)
	if err != nil {
		// Error handling for streaming - write error as SSE
		c.Writer.Write([]byte(fmt.Sprintf("data: [ERROR] %s\n\n", err.Error())))
		c.Writer.(http.Flusher).Flush()
		return
	}

	// Send done signal
	c.Writer.Write([]byte("data: [DONE]\n\n"))
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
