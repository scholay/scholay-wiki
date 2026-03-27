// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/thirdparty"
	"strings"

	"github.com/google/uuid"
)

// ChatService handles chat-style conversations with message chains
// 注意：配额检查已废弃，现在使用货币系统进行扣费控制
type ChatService struct {
	repo         *Repository
	aiService    *ai.Service
	tokenCounter *TokenCounter
}

// NewChatService creates a new chat service
func NewChatService(repo *Repository, aiService *ai.Service) *ChatService {
	// Default max context: 4000 tokens (conservative for most models)
	// This leaves room for system prompts and response
	return &ChatService{
		repo:         repo,
		aiService:    aiService,
		tokenCounter: NewTokenCounter(4000),
	}
}

// ChatRequest represents a streaming chat request
type ChatRequest struct {
	ConversationID  uint    `json:"conversation_id"` // Set by handler from URL param
	Content         string  `json:"content" binding:"required"`
	ParentMessageID *string `json:"parent_message_id,omitempty"`
	ModelLevel      string  `json:"model_level,omitempty"` // "low", "mid", "high"
}

// ChatResponse represents a streaming chat response chunk
type ChatResponse struct {
	Type      string `json:"type"` // "message_start", "content_delta", "message_end", "error"
	MessageID string `json:"message_id,omitempty"`
	Content   string `json:"content,omitempty"`
	Error     string `json:"error,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// StreamChat handles a chat request with streaming response
// 注意：配额检查已废弃，现在使用货币系统进行扣费控制（在 handler 层处理）
func (s *ChatService) StreamChat(ctx context.Context, userID uint, req ChatRequest, writer io.Writer) error {
	// 1. Verify conversation ownership and update model level
	conversation, err := s.repo.GetConversationByID(req.ConversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation not found: %w", err)
	}

	// Update conversation's model level if changed
	if modelLevel := req.ModelLevel; modelLevel != "" && conversation.ModelLevel != modelLevel {
		conversation.ModelLevel = modelLevel
		if err := s.repo.UpdateConversation(conversation); err != nil {
			slog.Error("failed to update conversation model level", "err", err)
		}
	}

	// 2. Create user message
	userMessageID := uuid.New().String()
	userMessage := &ConversationMessage{
		MessageID:       userMessageID,
		ConversationID:  req.ConversationID,
		ParentMessageID: req.ParentMessageID,
		Role:            MessageRoleUser,
		Content:         req.Content,
	}

	// Calculate and cache token count
	userMessage.TokenCount = s.tokenCounter.CountMessageTokens(userMessage)

	// Save user message
	if err := s.repo.UpsertMessage(userMessage); err != nil {
		return fmt.Errorf("failed to save user message: %w", err)
	}

	// 3. Build message chain for context
	messageChain, err := s.buildContextChain(userMessageID)
	if err != nil {
		return fmt.Errorf("failed to build context: %w", err)
	}

	// 4. Apply token window limiting
	contextMessages := s.tokenCounter.BuildContextWindow(messageChain)

	// 5. Convert to AI service format
	aiMessages := s.convertToAIMessages(contextMessages)

	// 6. Create assistant message placeholder
	assistantMessageID := uuid.New().String()
	assistantMessage := &ConversationMessage{
		MessageID:       assistantMessageID,
		ConversationID:  req.ConversationID,
		ParentMessageID: &userMessageID,
		Role:            MessageRoleAssistant,
		Content:         "",
		Unfinished:      true,
	}

	if err := s.repo.UpsertMessage(assistantMessage); err != nil {
		return fmt.Errorf("failed to create assistant message: %w", err)
	}

	// 6.5. Send user_message_created event (for new conversations)
	s.sendEvent(writer, ChatResponse{
		Type:      "user_message_created",
		MessageID: userMessageID,
		Metadata: map[string]any{
			"content": req.Content,
		},
	})

	// 7. Send message_start event with parent info
	s.sendEvent(writer, ChatResponse{
		Type:      "message_start",
		MessageID: assistantMessageID,
		Metadata: map[string]any{
			"parent_message_id": userMessageID,  // Frontend needs this for context chain
		},
	})

	// 8. Stream AI response with specified model level
	// Determine model level (default to "low" if not specified)
	modelLevel := thirdparty.ModelLevelLow
	if req.ModelLevel != "" {
		switch req.ModelLevel {
		case "mid":
			modelLevel = thirdparty.ModelLevelMid
		case "high":
			modelLevel = thirdparty.ModelLevelHigh
		}
	}

	fullContent := ""
	var streamBuffer bytes.Buffer
	multiWriter := io.MultiWriter(&streamBuffer, writer)

	// Create a custom writer that forwards chunks as SSE
	customWriter := &sseWriter{writer: multiWriter, onChunk: func(chunk string) {
		fullContent += chunk
		s.sendEvent(writer, ChatResponse{
			Type:    "content_delta",
			Content: chunk,
		})
	}}

	err = s.aiService.StreamChatCompletionWithLevel(ctx, aiMessages, customWriter, modelLevel)
	if err != nil {
		s.sendEvent(writer, ChatResponse{
			Type:  "error",
			Error: err.Error(),
		})
		assistantMessage.Error = true
		assistantMessage.Unfinished = false
		s.repo.UpdateMessage(assistantMessage)
		return err
	}

	// 9. Update assistant message with complete content
	assistantMessage.Content = fullContent
	assistantMessage.Unfinished = false
	assistantMessage.FinishReason = "stop"
	assistantMessage.TokenCount = s.tokenCounter.EstimateTokenCount(fullContent) + 4

	if err := s.repo.UpdateMessage(assistantMessage); err != nil {
		slog.Error("failed to update assistant message", "err", err)
	}

	// 10. Touch conversation to update timestamp
	s.repo.TouchConversation(req.ConversationID)

	// 11. Send message_end event
	s.sendEvent(writer, ChatResponse{
		Type:      "message_end",
		MessageID: assistantMessageID,
		Metadata: map[string]any{
			"token_count":   assistantMessage.TokenCount,
			"finish_reason": assistantMessage.FinishReason,
		},
	})

	return nil
}

// sseWriter wraps an io.Writer and extracts text chunks from SSE stream
type sseWriter struct {
	writer  io.Writer
	onChunk func(string)
}

func (w *sseWriter) Write(p []byte) (n int, err error) {
	// Forward to underlying writer
	n, err = w.writer.Write(p)
	if err != nil {
		return n, err
	}

	// Extract content from SSE stream
	content := string(p)
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				continue
			}

			var chunk ai.ChatCompletionChunk
			if err := json.Unmarshal([]byte(data), &chunk); err == nil {
				if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
					if w.onChunk != nil {
						w.onChunk(chunk.Choices[0].Delta.Content)
					}
				}
			}
		}
	}

	return n, nil
}

// buildContextChain builds the message chain from root to the specified message
// Uses optimized version to avoid N+1 query problem (10-100x faster)
func (s *ChatService) buildContextChain(messageID string) ([]ConversationMessage, error) {
	return s.repo.BuildMessageChainOptimized(messageID)
}

// convertToAIMessages converts conversation messages to AI service format
func (s *ChatService) convertToAIMessages(messages []ConversationMessage) []ai.Message {
	aiMessages := make([]ai.Message, 0, len(messages))

	for _, msg := range messages {
		// Skip system messages and error messages
		if msg.Role == MessageRoleSystem || msg.Error {
			continue
		}

		aiMessages = append(aiMessages, ai.Message{
			Role:    string(msg.Role),
			Content: msg.Content,
		})
	}

	return aiMessages
}

// sendEvent sends a Server-Sent Event to the client
func (s *ChatService) sendEvent(writer io.Writer, response ChatResponse) {
	data, err := json.Marshal(response)
	if err != nil {
		slog.Error("failed to marshal response", "err", err)
		return
	}

	// SSE format: data: {json}\n\n
	fmt.Fprintf(writer, "data: %s\n\n", data)

	// Flush if possible
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
}

// GetMessageTree returns the complete message tree for a conversation
func (s *ChatService) GetMessageTree(ctx context.Context, conversationID uint, userID uint) (map[string]MessageChainResponse, error) {
	// Verify ownership
	_, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation not found: %w", err)
	}

	// Get all messages
	messages, err := s.repo.GetAllMessagesForTree(conversationID)
	if err != nil {
		return nil, err
	}

	// Build tree structure
	tree := make(map[string]MessageChainResponse)
	childrenMap := make(map[string][]string)

	// First pass: create all nodes and collect children
	for _, msg := range messages {
		tree[msg.MessageID] = MessageChainResponse{
			ConversationMessage: msg,
			Children:            []string{},
		}

		if msg.ParentMessageID != nil {
			parentID := *msg.ParentMessageID
			childrenMap[parentID] = append(childrenMap[parentID], msg.MessageID)
		}
	}

	// Second pass: assign children to nodes
	for parentID, children := range childrenMap {
		if node, exists := tree[parentID]; exists {
			node.Children = children
			tree[parentID] = node
		}
	}

	return tree, nil
}

// RegenerateMessage regenerates an assistant message by creating a new sibling
func (s *ChatService) RegenerateMessage(ctx context.Context, userID uint, messageID string, writer io.Writer) error {
	// Get the message to regenerate
	message, err := s.repo.GetMessageByMessageID(messageID)
	if err != nil {
		return fmt.Errorf("message not found: %w", err)
	}

	// Verify ownership
	_, err = s.repo.GetConversationByID(message.ConversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation not found: %w", err)
	}

	// Only allow regenerating assistant messages
	if message.Role != MessageRoleAssistant {
		return fmt.Errorf("can only regenerate assistant messages")
	}

	// Get parent message (the user message we're responding to)
	if message.ParentMessageID == nil {
		return fmt.Errorf("cannot regenerate root message")
	}

	// Build message chain from parent user message for context
	messageChain, err := s.buildContextChain(*message.ParentMessageID)
	if err != nil {
		return fmt.Errorf("failed to build context: %w", err)
	}

	// Apply token window limiting
	contextMessages := s.tokenCounter.BuildContextWindow(messageChain)

	// Convert to AI service format
	aiMessages := s.convertToAIMessages(contextMessages)

	// Create new assistant message placeholder (as sibling to the old response)
	assistantMessageID := uuid.New().String()
	assistantMessage := &ConversationMessage{
		MessageID:       assistantMessageID,
		ConversationID:  message.ConversationID,
		ParentMessageID: message.ParentMessageID, // Same parent as original assistant message
		Role:            MessageRoleAssistant,
		Content:         "",
		Unfinished:      true,
	}

	if err := s.repo.UpsertMessage(assistantMessage); err != nil {
		return fmt.Errorf("failed to create assistant message: %w", err)
	}

	// Send message_start event
	s.sendEvent(writer, ChatResponse{
		Type:      "message_start",
		MessageID: assistantMessageID,
		Metadata: map[string]any{
			"parent_message_id": *message.ParentMessageID,
		},
	})

	// Stream AI response
	fullContent := ""
	var streamBuffer bytes.Buffer
	multiWriter := io.MultiWriter(&streamBuffer, writer)

	customWriter := &sseWriter{writer: multiWriter, onChunk: func(chunk string) {
		fullContent += chunk
		s.sendEvent(writer, ChatResponse{
			Type:    "content_delta",
			Content: chunk,
		})
	}}

	err = s.aiService.StreamChatCompletion(ctx, aiMessages, customWriter)
	if err != nil {
		s.sendEvent(writer, ChatResponse{
			Type:  "error",
			Error: err.Error(),
		})
		assistantMessage.Error = true
		assistantMessage.Unfinished = false
		s.repo.UpdateMessage(assistantMessage)
		return err
	}

	// Update assistant message with complete content
	assistantMessage.Content = fullContent
	assistantMessage.Unfinished = false
	assistantMessage.FinishReason = "stop"
	assistantMessage.TokenCount = s.tokenCounter.CountMessageTokens(assistantMessage)

	if err := s.repo.UpdateMessage(assistantMessage); err != nil {
		slog.Warn("failed to update assistant message", "err", err)
	}

	// Send message_end event
	s.sendEvent(writer, ChatResponse{
		Type:      "message_end",
		MessageID: assistantMessageID,
		Content:   fullContent,
	})

	return nil
}

// EditMessage allows editing a user message and regenerating the conversation from that point
func (s *ChatService) EditMessage(ctx context.Context, userID uint, messageID string, newContent string, writer io.Writer) error {
	// Get the message to edit
	message, err := s.repo.GetMessageByMessageID(messageID)
	if err != nil {
		return fmt.Errorf("message not found: %w", err)
	}

	// Verify ownership
	_, err = s.repo.GetConversationByID(message.ConversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation not found: %w", err)
	}

	// Only allow editing user messages
	if message.Role != MessageRoleUser {
		return fmt.Errorf("can only edit user messages")
	}

	// Create new branch with edited content
	req := ChatRequest{
		ConversationID:  message.ConversationID,
		Content:         newContent,
		ParentMessageID: message.ParentMessageID,
	}

	// Stream new response
	return s.StreamChat(ctx, userID, req, writer)
}

// GetConversationHistory returns the main conversation path (no branches)
func (s *ChatService) GetConversationHistory(ctx context.Context, conversationID uint, userID uint) ([]ConversationMessage, error) {
	// Verify ownership
	_, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation not found: %w", err)
	}

	// Get latest message
	latestMessage, err := s.repo.GetLatestMessageInConversation(conversationID)
	if err != nil {
		// If no messages exist (empty conversation), return empty array
		// This can happen for newly created conversations or after schema reset
		return []ConversationMessage{}, nil
	}

	slog.Debug("latest message found", "messageID", latestMessage.MessageID, "role", latestMessage.Role)

	// Build chain from latest message (optimized version)
	chain, err := s.repo.BuildMessageChainOptimized(latestMessage.MessageID)
	if err != nil {
		return nil, err
	}

	slog.Debug("built message chain", "conversationID", conversationID, "messageCount", len(chain))

	return chain, nil
}

// GetConversationByID retrieves a conversation by ID and verifies user ownership
func (s *ChatService) GetConversationByID(ctx context.Context, conversationID uint, userID uint) (*Conversation, error) {
	return s.repo.GetConversationByID(conversationID, userID)
}

// GetSiblingMessages returns all sibling messages sharing the same parent
func (s *ChatService) GetSiblingMessages(ctx context.Context, messageID string) ([]ConversationMessage, error) {
	return s.repo.GetSiblingMessages(messageID)
}

// GetBranchChain returns the complete chain from root to the deepest leaf of a specific branch
// This is used when navigating to a sibling message - we want to show the complete conversation
// path for that branch, not just the sibling message itself
func (s *ChatService) GetBranchChain(ctx context.Context, messageID string, userID uint) ([]ConversationMessage, error) {
	// Get the starting message
	message, err := s.repo.GetMessageByMessageID(messageID)
	if err != nil {
		return nil, fmt.Errorf("message not found: %w", err)
	}

	// Verify ownership
	_, err = s.repo.GetConversationByID(message.ConversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation not found: %w", err)
	}

	// Find the latest leaf (deepest child) starting from this message
	leafMessageID, err := s.repo.GetLatestLeafFromMessage(messageID)
	if err != nil {
		return nil, fmt.Errorf("failed to find leaf message: %w", err)
	}

	// Build complete chain from root to the leaf (optimized version)
	chain, err := s.repo.BuildMessageChainOptimized(leafMessageID)
	if err != nil {
		return nil, fmt.Errorf("failed to build branch chain: %w", err)
	}

	return chain, nil
}
