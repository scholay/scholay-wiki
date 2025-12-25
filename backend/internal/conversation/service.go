// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"fmt"
	"strings"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/subscription"
	"scholar-backend/internal/thirdparty"
)

type Service struct {
	repo                *Repository
	scholarManager      *semanticscholar.Manager
	aiService           *ai.Service
	subscriptionService *subscription.Service
}

func NewService(repo *Repository, scholarManager *semanticscholar.Manager, aiService *ai.Service, subscriptionService *subscription.Service) *Service {
	return &Service{
		repo:                repo,
		scholarManager:      scholarManager,
		aiService:           aiService,
		subscriptionService: subscriptionService,
	}
}

// CreateConversation creates a new conversation for a user
func (s *Service) CreateConversation(userID uint, title string, conversationType ConversationType) (*Conversation, error) {
	// Default to search type if not provided
	if conversationType == "" {
		conversationType = ConversationTypeSearch
	}

	conversation := &Conversation{
		UserID:           userID,
		Title:            title,
		ConversationType: conversationType,
	}

	if err := s.repo.CreateConversation(conversation); err != nil {
		return nil, err
	}

	return conversation, nil
}

// GetUserConversations gets all conversations for a user, optionally filtered by type
func (s *Service) GetUserConversations(userID uint, page, pageSize int, conversationType *ConversationType) (*ConversationListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	conversations, total, err := s.repo.GetUserConversations(userID, pageSize, offset, conversationType)
	if err != nil {
		return nil, err
	}

	return &ConversationListResponse{
		Conversations: conversations,
		Total:         total,
	}, nil
}

// GetConversationWithMessages gets a conversation with all its messages
func (s *Service) GetConversationWithMessages(conversationID uint, userID uint) (*ConversationWithMessages, error) {
	return s.repo.GetConversationWithMessages(conversationID, userID)
}

// GetConversationWithMessagesPaginated gets a conversation with paginated messages
// Messages are returned in DESC order (newest first) for pagination
// Frontend should reverse the order when displaying
func (s *Service) GetConversationWithMessagesPaginated(conversationID uint, userID uint, page, pageSize int) (*ConversationWithMessagesPaginated, error) {
	// Get conversation
	conversation, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return nil, err
	}

	// Validate pagination params
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Get paginated messages
	messages, total, err := s.repo.GetConversationMessagesPaginated(conversationID, page, pageSize)
	if err != nil {
		return nil, err
	}

	// Reverse messages to ASC order (oldest first) for display
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return &ConversationWithMessagesPaginated{
		Conversation: *conversation,
		Messages:     messages,
		Total:        total,
		Page:         page,
		PageSize:     pageSize,
		HasMore:      int64(page*pageSize) < total,
	}, nil
}

// DeleteConversation deletes a conversation
func (s *Service) DeleteConversation(conversationID uint, userID uint) error {
	return s.repo.DeleteConversation(conversationID, userID)
}

// AddMessage adds a message to a conversation and optionally searches papers
func (s *Service) AddMessage(conversationID uint, userID uint, req CreateMessageRequest) (*ConversationMessage, error) {
	// Verify conversation belongs to user
	conversation, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation not found: %w", err)
	}

	// Create user message
	message := &ConversationMessage{
		ConversationID: conversationID,
		Role:           MessageRoleUser,
		Content:        req.Content,
		SearchQuery:    req.SearchQuery,
	}

	// If search is requested, search papers via Semantic Scholar
	if req.SearchPapers && req.SearchQuery != "" {
		searchResults, total, err := s.searchPapers(req.SearchQuery)
		if err != nil {
			// Don't fail the message creation if search fails
			fmt.Printf("Warning: failed to search papers: %v\n", err)
		} else {
			message.SearchResults = searchResults
			message.SearchResultsTotal = total
		}
	}

	// Save message
	if err := s.repo.CreateMessage(message); err != nil {
		return nil, err
	}

	// Update conversation's updated_at timestamp
	if err := s.repo.TouchConversation(conversationID); err != nil {
		fmt.Printf("Warning: failed to update conversation timestamp: %v\n", err)
	}

	// Auto-update conversation title if this is the first message
	messages, _ := s.repo.GetConversationMessages(conversationID)
	if len(messages) == 1 {
		title := s.generateTitle(req.Content)
		conversation.Title = title
		s.repo.UpdateConversation(conversation)
	}

	return message, nil
}

// searchPapers searches papers using Semantic Scholar API
func (s *Service) searchPapers(query string) (SearchResults, int, error) {
	// Search papers
	result, err := s.scholarManager.SearchPapers(semanticscholar.PaperSearchOptions{
		Query:  query,
		Limit:  20,
		Fields: []string{"title", "abstract", "year", "authors", "citationCount", "url", "venue", "publicationDate"},
	})

	if err != nil {
		return nil, 0, err
	}

	// Convert to SearchResults format
	var searchResults SearchResults
	for _, paper := range result.Data {
		paperMap := map[string]interface{}{
			"paperId":       paper.PaperID,
			"title":         paper.Title,
			"abstract":      paper.Abstract,
			"year":          paper.Year,
			"citationCount": paper.CitationCount,
			"url":           paper.URL,
			"venue":         paper.Venue,
			"publicationDate": paper.PublicationDate,
		}

		// Convert authors
		var authors []map[string]interface{}
		for _, author := range paper.Authors {
			authors = append(authors, map[string]interface{}{
				"authorId": author.AuthorID,
				"name":     author.Name,
			})
		}
		paperMap["authors"] = authors

		searchResults = append(searchResults, paperMap)
	}

	return searchResults, result.Total, nil
}

// generateTitle generates a title from the first message content
func (s *Service) generateTitle(content string) string {
	// Take first 50 characters or until first newline
	lines := strings.Split(content, "\n")
	title := lines[0]

	if len(title) > 50 {
		title = title[:50] + "..."
	}

	return title
}

// UpdateConversationTitle updates the title of a conversation
func (s *Service) UpdateConversationTitle(conversationID uint, userID uint, title string) error {
	conversation, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return err
	}

	conversation.Title = title
	return s.repo.UpdateConversation(conversation)
}

// GenerateTitleWithAI generates a conversation title using AI based on conversation history
// Uses low-level model for cost efficiency
func (s *Service) GenerateTitleWithAI(conversationID uint) (string, error) {
	// Get all messages for this conversation
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return "", fmt.Errorf("failed to get conversation messages: %w", err)
	}

	if len(messages) == 0 {
		return "", fmt.Errorf("no messages found in conversation")
	}

	// Build user questions list for the prompt
	var userQuestions []string
	for _, msg := range messages {
		if msg.Role == MessageRoleUser {
			// Use SearchQuery if available, otherwise use Content
			question := msg.SearchQuery
			if question == "" {
				question = msg.Content
			}
			if question != "" {
				userQuestions = append(userQuestions, question)
			}
		}
	}

	if len(userQuestions) == 0 {
		return "", fmt.Errorf("no user questions found in conversation")
	}

	fmt.Printf("[TITLE-DEBUG] Found %d user questions for conversation %d:\n", len(userQuestions), conversationID)
	for i, q := range userQuestions {
		fmt.Printf("[TITLE-DEBUG]   Question %d: %s\n", i+1, q)
	}

	// Build the prompt - emphasize the latest question
	systemPrompt := `你是一个对话标题生成助手。根据用户的问题历史，生成一个简洁、准确的标题。

重要规则：
1. 标题必须反映【最新问题】的主题，而不是最早的问题
2. 如果最新问题是对之前话题的延续或追问，标题应该体现这种关联
3. 如果最新问题是一个全新的话题，标题应该完全基于新话题
4. 标题长度不超过15个字符
5. 使用用户的语言（中文/英文）
6. 不要使用标点符号
7. 只输出标题文本，不要有其他任何内容

示例：
- 如果最新问题是"心理学的分析"，标题应该是"心理学研究分析"
- 如果最新问题是"和大数据之间的关系"，而之前在讨论心理学，标题应该是"心理学与大数据"`

	// Format questions with numbers, emphasizing the latest one
	var formattedQuestions []string
	for i, q := range userQuestions {
		if i == len(userQuestions)-1 {
			formattedQuestions = append(formattedQuestions, fmt.Sprintf("【最新问题】%s", q))
		} else {
			formattedQuestions = append(formattedQuestions, fmt.Sprintf("问题%d: %s", i+1, q))
		}
	}
	userMessage := fmt.Sprintf("用户问题历史（按时间顺序）：\n%s", strings.Join(formattedQuestions, "\n"))

	// Call AI to generate title
	aiMessages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	response, err := s.aiService.ChatCompletionWithLevel(aiMessages, thirdparty.ModelLevelLow)
	if err != nil {
		return "", fmt.Errorf("failed to generate title with AI: %w", err)
	}

	// Clean up the response
	title := strings.TrimSpace(response)
	
	// Ensure title is not too long (max 20 characters for Chinese, ~30 for English)
	titleRunes := []rune(title)
	if len(titleRunes) > 25 {
		title = string(titleRunes[:22]) + "..."
	}

	return title, nil
}

// UpdateConversationTitleWithAI generates a new title using AI and updates the conversation
func (s *Service) UpdateConversationTitleWithAI(conversationID uint) (string, error) {
	// Generate new title using AI
	newTitle, err := s.GenerateTitleWithAI(conversationID)
	if err != nil {
		return "", err
	}

	// Update the conversation title in database
	err = s.repo.db.Model(&Conversation{}).Where("id = ?", conversationID).Update("title", newTitle).Error
	if err != nil {
		return "", fmt.Errorf("failed to update conversation title: %w", err)
	}

	fmt.Printf("[TITLE-DEBUG] Generated and updated title for conversation %d: %s\n", conversationID, newTitle)
	return newTitle, nil
}
