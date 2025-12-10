// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"
	"log"
	"net/http"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/currency"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ChatHandler handles chat-related HTTP requests
type ChatHandler struct {
	chatService     *ChatService
	service         *Service
	currencyService *currency.Service
}

// NewChatHandler creates a new chat handler
func NewChatHandler(repo *Repository, aiService *ai.Service, service *Service, subscriptionService interface {
	CheckQuota(userID uint, featureType string) (bool, error)
	IncrementUsage(userID uint, featureType string) error
	CheckAndIncrementQuota(userID uint, featureType string) error
}) *ChatHandler {
	chatService := NewChatService(repo, aiService)
	chatService.SetSubscriptionService(subscriptionService)
	return &ChatHandler{
		chatService: chatService,
		service:     service,
	}
}

// SetCurrencyService sets the currency service for deduction
func (h *ChatHandler) SetCurrencyService(currencyService *currency.Service) {
	h.currencyService = currencyService
}

// deductForChat handles currency deduction for AI chat based on model level
func (h *ChatHandler) deductForChat(userID uint, modelLevel string) error {
	if h.currencyService == nil {
		return nil // No currency service configured, skip deduction
	}

	// Determine biz_type based on model level
	bizType := "ai_chat_low"
	switch modelLevel {
	case "mid":
		bizType = "ai_chat_mid"
	case "high":
		bizType = "ai_chat_high"
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

// StreamChatMessage handles streaming chat requests
// POST /api/v1/conversations/:id/chat/stream
func (h *ChatHandler) StreamChatMessage(c *gin.Context) {
	userID := c.GetUint("user_id")

	// Parse conversation ID
	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Parse request body
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	req.ConversationID = uint(conversationID)

	// Deduct currency before processing
	modelLevel := req.ModelLevel
	if modelLevel == "" {
		modelLevel = "low"
	}
	if err := h.deductForChat(userID, modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "金币不足"})
		} else {
			utils.ErrorResponse(c, http.StatusInternalServerError, "扣费失败: "+err.Error())
		}
		return
	}

	// Set headers for Server-Sent Events
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable nginx buffering

	// Create context with timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	// Stream the chat
	if err := h.chatService.StreamChat(ctx, userID, req, c.Writer); err != nil {
		log.Printf("Stream chat error: %v", err)
		// Error already sent via SSE
		return
	}

	c.Status(http.StatusOK)
}

// GetMessageTree retrieves the complete message tree for a conversation
// GET /api/v1/conversations/:id/tree
func (h *ChatHandler) GetMessageTree(c *gin.Context) {
	userID := c.GetUint("user_id")

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	tree, err := h.chatService.GetMessageTree(uint(conversationID), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Message tree retrieved successfully", tree)
}

// RegenerateMessage regenerates an assistant message
// POST /api/v1/conversations/messages/:messageId/regenerate
func (h *ChatHandler) RegenerateMessage(c *gin.Context) {
	userID := c.GetUint("user_id")
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Message ID is required")
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.RegenerateMessage(ctx, userID, messageID, c.Writer); err != nil {
		log.Printf("Regenerate message error: %v", err)
		return
	}

	c.Status(http.StatusOK)
}

// EditMessage edits a user message and creates a new branch
// POST /api/v1/conversations/messages/:messageId/edit
func (h *ChatHandler) EditMessage(c *gin.Context) {
	userID := c.GetUint("user_id")
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Message ID is required")
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.EditMessage(ctx, userID, messageID, req.Content, c.Writer); err != nil {
		log.Printf("Edit message error: %v", err)
		return
	}

	c.Status(http.StatusOK)
}

// GetConversationHistory returns the main conversation path with metadata
// GET /api/v1/conversations/:id/history
func (h *ChatHandler) GetConversationHistory(c *gin.Context) {
	userID := c.GetUint("user_id")

	conversationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	messages, err := h.chatService.GetConversationHistory(uint(conversationID), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Also get conversation metadata (including model_level)
	conversation, err := h.chatService.repo.GetConversationByID(uint(conversationID), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Return both conversation metadata and messages
	response := map[string]interface{}{
		"conversation": conversation,
		"messages":     messages,
	}

	utils.SuccessResponse(c, http.StatusOK, "Conversation history retrieved successfully", response)
}

// CreateConversationAndChat creates a new conversation and starts chatting
// POST /api/v1/conversations/chat/new
func (h *ChatHandler) CreateConversationAndChat(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req struct {
		Title      string `json:"title"`
		Content    string `json:"content" binding:"required"`
		ModelLevel string `json:"model_level,omitempty"` // "low", "mid", "high"
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// Deduct currency before processing
	modelLevel := req.ModelLevel
	if modelLevel == "" {
		modelLevel = "low"
	}
	if err := h.deductForChat(userID, modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "金币不足"})
		} else {
			utils.ErrorResponse(c, http.StatusInternalServerError, "扣费失败: "+err.Error())
		}
		return
	}

	// Generate title from first message if not provided
	title := req.Title
	if title == "" {
		title = h.generateTitle(req.Content)
	}

	// Create conversation with chat type
	conversation, err := h.service.CreateConversation(userID, title, ConversationTypeChat)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create conversation")
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Send conversation ID first
	h.chatService.sendEvent(c.Writer, ChatResponse{
		Type: "conversation_created",
		Metadata: map[string]interface{}{
			"conversation_id": conversation.ID,
			"title":           conversation.Title,
		},
	})

	// Start chat
	chatReq := ChatRequest{
		ConversationID:  conversation.ID,
		Content:         req.Content,
		ParentMessageID: nil,
		ModelLevel:      req.ModelLevel, // Pass model level to chat service
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.StreamChat(ctx, userID, chatReq, c.Writer); err != nil {
		log.Printf("Stream chat error: %v", err)
		return
	}

	c.Status(http.StatusOK)
}

// generateTitle generates a conversation title from the first message
func (h *ChatHandler) generateTitle(content string) string {
	// Take first 50 characters or first sentence
	title := content
	if len(title) > 50 {
		title = title[:50] + "..."
	}
	return title
}

// QuickChat handles a simple non-streaming chat for backward compatibility
// POST /api/v1/conversations/:id/chat
func (h *ChatHandler) QuickChat(c *gin.Context) {
	_ = c.GetUint("user_id") // userID not used in this simple endpoint

	_, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	var req struct {
		Content         string  `json:"content" binding:"required"`
		ParentMessageID *string `json:"parent_message_id,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	// Create user message ID for response
	userMessageID := uuid.New().String()

	utils.SuccessResponse(c, http.StatusOK, "Message sent. Use /chat/stream for streaming responses", gin.H{
		"message_id": userMessageID,
		"message":    "Use streaming endpoint for full chat experience",
	})
}

// GetSiblingMessages returns all sibling messages (same parent) for branch navigation
// GET /api/v1/conversations/messages/:messageId/siblings
func (h *ChatHandler) GetSiblingMessages(c *gin.Context) {
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Message ID is required")
		return
	}

	siblings, err := h.chatService.repo.GetSiblingMessages(messageID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Calculate current index
	currentIndex := 0
	for i, msg := range siblings {
		if msg.MessageID == messageID {
			currentIndex = i
			break
		}
	}

	utils.SuccessResponse(c, http.StatusOK, "Siblings retrieved successfully", gin.H{
		"siblings":      siblings,
		"current_index": currentIndex,
		"total":         len(siblings),
	})
}

// GetBranchChain returns the complete chain from root to leaf for a specific branch
// GET /api/v1/conversations/messages/:messageId/branch
func (h *ChatHandler) GetBranchChain(c *gin.Context) {
	userID := c.GetUint("user_id")
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Message ID is required")
		return
	}

	// Get complete branch chain
	chain, err := h.chatService.GetBranchChain(messageID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Branch chain retrieved successfully", chain)
}
