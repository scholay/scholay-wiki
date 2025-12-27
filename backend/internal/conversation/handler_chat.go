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
// 注意：配额检查已废弃，subscriptionService 参数保留用于向后兼容但不再使用
func NewChatHandler(repo *Repository, aiService *ai.Service, service *Service, subscriptionService interface{}) *ChatHandler {
	chatService := NewChatService(repo, aiService)
	return &ChatHandler{
		chatService: chatService,
		service:     service,
	}
}

// SetCurrencyService sets the currency service for deduction
func (h *ChatHandler) SetCurrencyService(currencyService *currency.Service) {
	h.currencyService = currencyService
}

// getBizTypeForChat 根据模型级别获取业务类型
func (h *ChatHandler) getBizTypeForChat(modelLevel string) string {
	switch modelLevel {
	case "mid":
		return "ai_chat_mid"
	case "high":
		return "ai_chat_high"
	default:
		return "ai_chat_low"
	}
}

// checkBalanceForChat 检查余额是否充足（不扣费）
func (h *ChatHandler) checkBalanceForChat(userID uint, modelLevel string) error {
	if h.currencyService == nil {
		return nil
	}

	bizType := h.getBizTypeForChat(modelLevel)
	checkResult, err := h.currencyService.CheckBalanceByBizType(userID, bizType)
	if err != nil {
		return err
	}
	if !checkResult.Sufficient {
		return currency.ErrInsufficientBalance
	}
	return nil
}

// deductForChatAfterSuccess 成功后扣费，返回扣费金额
func (h *ChatHandler) deductForChatAfterSuccess(userID uint, modelLevel string) int64 {
	if h.currencyService == nil {
		log.Printf("[AI Chat] Currency service not set, skip deduct")
		return 0
	}

	bizType := h.getBizTypeForChat(modelLevel)
	ctx := context.Background()
	transaction, err := h.currencyService.DeductByBizType(ctx, userID, bizType, "")
	if err != nil {
		log.Printf("[AI Chat] Deduct failed after success: userID=%d, bizType=%s, err=%v", userID, bizType, err)
		return 0
	}
	if transaction == nil {
		log.Printf("[AI Chat] No deduct config or disabled: userID=%d, bizType=%s", userID, bizType)
		return 0
	}
	// transaction.Amount 是负数（扣费），取绝对值返回
	amount := transaction.Amount
	if amount < 0 {
		amount = -amount
	}
	log.Printf("[AI Chat] Deduct success: userID=%d, bizType=%s, amount=%d", userID, bizType, amount)
	return amount
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

	// 1. 先检查余额（不扣费）
	modelLevel := req.ModelLevel
	if modelLevel == "" {
		modelLevel = "low"
	}
	if err := h.checkBalanceForChat(userID, modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.ErrorResponse(c, http.StatusInternalServerError, "检查余额失败: "+err.Error())
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

	// 2. 执行流式对话
	if err := h.chatService.StreamChat(ctx, userID, req, c.Writer); err != nil {
		log.Printf("Stream chat error: %v", err)
		// Error already sent via SSE, do not deduct
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForChatAfterSuccess(userID, modelLevel)

	// 4. 发送扣费信息事件
	deductEvent := fmt.Sprintf("data: {\"type\":\"deduct_info\",\"deducted_amount\":%d}\n\n", deductedAmount)
	c.Writer.Write([]byte(deductEvent))
	c.Writer.(http.Flusher).Flush()

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

	// 1. 先检查余额（不扣费）
	modelLevel := req.ModelLevel
	if modelLevel == "" {
		modelLevel = "low"
	}
	if err := h.checkBalanceForChat(userID, modelLevel); err != nil {
		if err == currency.ErrInsufficientBalance {
			c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "经费不足"})
		} else {
			utils.ErrorResponse(c, http.StatusInternalServerError, "检查余额失败: "+err.Error())
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

	// 2. Start chat
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
		// Error occurred, do not deduct
		return
	}

	// 3. 成功后扣费
	deductedAmount := h.deductForChatAfterSuccess(userID, modelLevel)

	// 4. 发送扣费信息事件
	deductEvent := fmt.Sprintf("data: {\"type\":\"deduct_info\",\"deducted_amount\":%d}\n\n", deductedAmount)
	c.Writer.Write([]byte(deductEvent))
	c.Writer.(http.Flusher).Flush()

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
