package conversation

import (
	"fmt"
	"io"
	"strings"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/semanticscholar"
)

type Service struct {
	repo           *Repository
	scholarManager *semanticscholar.Manager
	aiService      *ai.Service
}

func NewService(repo *Repository, scholarManager *semanticscholar.Manager, aiService *ai.Service) *Service {
	return &Service{
		repo:           repo,
		scholarManager: scholarManager,
		aiService:      aiService,
	}
}

// CreateConversation creates a new conversation for a user
func (s *Service) CreateConversation(userID uint, title string) (*Conversation, error) {
	conversation := &Conversation{
		UserID: userID,
		Title:  title,
	}

	if err := s.repo.CreateConversation(conversation); err != nil {
		return nil, err
	}

	return conversation, nil
}

// GetUserConversations gets all conversations for a user
func (s *Service) GetUserConversations(userID uint, page, pageSize int) (*ConversationListResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	conversations, total, err := s.repo.GetUserConversations(userID, pageSize, offset)
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

// StreamAIAnalysis generates AI analysis for papers and streams the response
func (s *Service) StreamAIAnalysis(query string, papers []map[string]interface{}, writer io.Writer) error {
	// Get prompt template
	template, err := s.aiService.GetPromptTemplate("paper_analysis")
	if err != nil {
		return fmt.Errorf("failed to get prompt template: %w", err)
	}

	// Format papers for prompt
	papersText := ai.FormatPapersForPrompt(papers)

	// Render prompt with variables
	prompt := s.aiService.RenderPrompt(template.Template, map[string]string{
		"query":  query,
		"papers": papersText,
	})

	// Create messages for AI
	messages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: "你是一位专业的学术研究助手，擅长分析和总结学术论文。请用 Markdown 格式输出。",
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	// Stream AI response
	return s.aiService.StreamChatCompletion(messages, writer)
}

// StreamAIAnalysisAndSave streams AI analysis and saves it as assistant message
func (s *Service) StreamAIAnalysisAndSave(conversationID uint, query string, papers []map[string]interface{}, writer io.Writer) (string, error) {
	// Get prompt template
	template, err := s.aiService.GetPromptTemplate("paper_analysis")
	if err != nil {
		return "", fmt.Errorf("failed to get prompt template: %w", err)
	}

	// Format papers for prompt
	papersText := ai.FormatPapersForPrompt(papers)

	// Render prompt with variables
	prompt := s.aiService.RenderPrompt(template.Template, map[string]string{
		"query":  query,
		"papers": papersText,
	})

	// Create messages for AI
	messages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: "你是一位专业的学术研究助手，擅长分析和总结学术论文。请用 Markdown 格式输出。",
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	// Stream AI response and collect full content
	fullContent, err := s.aiService.StreamChatCompletionAndCollect(messages, writer)
	if err != nil {
		return "", err
	}

	// Save assistant message to conversation
	assistantMessage := &ConversationMessage{
		ConversationID: conversationID,
		Role:           MessageRoleAssistant,
		Content:        fullContent,
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to save assistant message: %v\n", err)
	}

	return fullContent, nil
}
