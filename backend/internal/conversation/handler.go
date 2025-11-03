package conversation

import (
	"fmt"
	"net/http"
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
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

// StreamAnalysis streams AI analysis for a message's papers
func (h *Handler) StreamAnalysis(c *gin.Context) {
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

	// Verify conversation belongs to user and get message
	conv, err := h.service.GetConversationWithMessages(uint(conversationID), userID.(uint))
	if err != nil {
		utils.Error(c, 404, "Conversation not found")
		return
	}

	// Find the message
	var targetMessage *ConversationMessage
	for i := range conv.Messages {
		if conv.Messages[i].ID == uint(messageID) {
			targetMessage = &conv.Messages[i]
			break
		}
	}

	if targetMessage == nil {
		utils.Error(c, 404, "Message not found")
		return
	}

	// Check if message has papers
	if len(targetMessage.SearchResults) == 0 {
		utils.Error(c, 400, "No papers found in this message")
		return
	}

	// Convert SearchResults to []map[string]interface{}
	papers := make([]map[string]interface{}, len(targetMessage.SearchResults))
	for i, paper := range targetMessage.SearchResults {
		papers[i] = paper
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Stream AI analysis and collect full content
	fullContent, err := h.service.StreamAIAnalysisAndSave(
		uint(conversationID),
		targetMessage.SearchQuery,
		papers,
		c.Writer,
	)
	if err != nil {
		// Error handling for streaming - write error as SSE
		c.Writer.Write([]byte(fmt.Sprintf("data: [ERROR] %s\n\n", err.Error())))
		c.Writer.(http.Flusher).Flush()
		return
	}

	// Send done signal with message ID
	c.Writer.Write([]byte(fmt.Sprintf("data: [DONE] {\"content\": %q}\n\n", fullContent)))
	c.Writer.(http.Flusher).Flush()
}

// StreamAdvancedSearch handles advanced AI-powered search using MCP tools
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

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Perform advanced search and stream results
	err = h.service.AdvancedSearchAndAnalyze(
		uint(conversationID),
		targetMessage.SearchQuery,
		c.Writer,
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
		Query string `json:"query" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request: "+err.Error())
		return
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

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Continue the conversation
	err = h.service.ContinueConversation(
		uint(conversationID),
		req.Query,
		c.Writer,
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
