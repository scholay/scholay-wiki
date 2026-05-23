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
	"net/http"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/common/utils"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ChatHandler handles chat-related HTTP requests
type ChatHandler struct {
	chatService *ChatService
	service     *Service
}

// NewChatHandler 创建聊天处理器
func NewChatHandler(repo *Repository, aiService *ai.Service, service *Service) *ChatHandler {
	chatService := NewChatService(repo, aiService)
	return &ChatHandler{
		chatService: chatService,
		service:     service,
	}
}

// StreamChatMessage handles streaming chat requests
// POST /api/v1/conversations/:id/chat/stream
func (h *ChatHandler) StreamChatMessage(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	// Parse conversation ID
	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	// Parse request body
	var req ChatRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	req.ConversationID = conversationID

	w, stop := sse.BeginStream(c)
	defer stop()

	// Create context with timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.StreamChat(ctx, userID, req, w); err != nil {
		slog.Error("stream chat error", "err", err)
		// 错误已通过 SSE 下发给客户端
		return
	}

	c.Status(http.StatusOK)
}

// GetMessageTree retrieves the complete message tree for a conversation
// GET /api/v1/conversations/:id/tree
func (h *ChatHandler) GetMessageTree(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	tree, err := h.chatService.GetMessageTree(c.Request.Context(), conversationID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Message tree retrieved successfully", tree)
}

// RegenerateMessage regenerates an assistant message
// POST /api/v1/conversations/messages/:messageId/regenerate
func (h *ChatHandler) RegenerateMessage(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "请提供消息 ID")
		return
	}

	w, stop := sse.BeginStream(c)
	defer stop()

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.RegenerateMessage(ctx, userID, messageID, w); err != nil {
		slog.Error("regenerate message error", "err", err)
		return
	}

	c.Status(http.StatusOK)
}

// EditMessage edits a user message and creates a new branch
// POST /api/v1/conversations/messages/:messageId/edit
func (h *ChatHandler) EditMessage(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "请提供消息 ID")
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if !utils.BindJSON(c, &req) {
		return
	}

	w, stop := sse.BeginStream(c)
	defer stop()

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	if err := h.chatService.EditMessage(ctx, userID, messageID, req.Content, w); err != nil {
		slog.Error("edit message error", "err", err)
		return
	}

	c.Status(http.StatusOK)
}

// GetConversationHistory returns the main conversation path with metadata
// GET /api/v1/conversations/:id/history
func (h *ChatHandler) GetConversationHistory(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	conversationID, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	messages, err := h.chatService.GetConversationHistory(c.Request.Context(), conversationID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Also get conversation metadata (including model_level)
	conversation, err := h.chatService.GetConversationByID(c.Request.Context(), conversationID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Return both conversation metadata and messages
	response := map[string]any{
		"conversation": conversation,
		"messages":     messages,
	}

	utils.SuccessResponse(c, http.StatusOK, "Conversation history retrieved successfully", response)
}

// CreateConversationAndChat creates a new conversation and starts chatting
// POST /api/v1/conversations/chat/new
func (h *ChatHandler) CreateConversationAndChat(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req struct {
		Title      string `json:"title"`
		Content    string `json:"content" binding:"required"`
		ModelLevel string `json:"model_level,omitempty"` // "low", "mid", "high"
	}

	if !utils.BindJSON(c, &req) {
		return
	}

	// Generate title from first message if not provided
	title := req.Title
	if title == "" {
		title = h.generateTitle(req.Content)
	}

	// Create conversation with chat type
	conversation, err := h.service.CreateConversation(c.Request.Context(), userID, title, ConversationTypeChat)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "创建会话失败,请稍后重试")
		return
	}

	// Set SSE headers + start heartbeat
	w, stop := sse.BeginStream(c)
	defer stop()

	// Send conversation ID first
	h.chatService.sendEvent(w, ChatResponse{
		Type: "conversation_created",
		Metadata: map[string]any{
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

	if err := h.chatService.StreamChat(ctx, userID, chatReq, w); err != nil {
		slog.Error("stream chat error", "err", err)
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
	if _, ok := utils.GetUserID(c); !ok { // validate auth even though userID unused
		return
	}

	if _, ok := utils.ParseUintParam(c, "id"); !ok {
		return
	}

	var req struct {
		Content         string  `json:"content" binding:"required"`
		ParentMessageID *string `json:"parent_message_id,omitempty"`
	}

	if !utils.BindJSON(c, &req) {
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
		utils.ErrorResponse(c, http.StatusBadRequest, "请提供消息 ID")
		return
	}

	siblings, err := h.chatService.GetSiblingMessages(c.Request.Context(), messageID)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	messageID := c.Param("messageId")

	if messageID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "请提供消息 ID")
		return
	}

	// Get complete branch chain
	chain, err := h.chatService.GetBranchChain(c.Request.Context(), messageID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Branch chain retrieved successfully", chain)
}
