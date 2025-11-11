package wechatofficial

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/thirdparty"
)

// Service handles WeChat Official Account operations
type Service struct {
	repo      *Repository
	aiService *ai.Service
}

// NewService creates a new service
func NewService(db *gorm.DB, aiService *ai.Service) *Service {
	return &Service{
		repo:      NewRepository(db),
		aiService: aiService,
	}
}

// GetConfig gets the WeChat Official Account configuration
func (s *Service) GetConfig() (*WeChatOfficialConfig, error) {
	return s.repo.GetConfig()
}

// UpdateConfig updates the WeChat Official Account configuration
func (s *Service) UpdateConfig(config *WeChatOfficialConfig) error {
	return s.repo.UpdateConfig(config)
}

// VerifySignature verifies the WeChat signature for server validation
func (s *Service) VerifySignature(signature, timestamp, nonce, token string) bool {
	// Sort the parameters
	params := []string{token, timestamp, nonce}
	sort.Strings(params)

	// Join and hash
	str := strings.Join(params, "")
	hash := sha1.New()
	hash.Write([]byte(str))
	hashStr := hex.EncodeToString(hash.Sum(nil))

	return hashStr == signature
}

// GetAIReply gets AI reply for user message
func (s *Service) GetAIReply(userMessage string, aiModelLevel string) (string, error) {
	// Get config to check if auto-reply is enabled
	config, err := s.GetConfig()
	if err != nil {
		return "", fmt.Errorf("failed to get config: %w", err)
	}

	if !config.AutoReplyEnabled {
		return "", fmt.Errorf("auto-reply is disabled")
	}

	// Use configured AI model level or default to low
	modelLevel := aiModelLevel
	if modelLevel == "" {
		modelLevel = config.AIModelLevel
	}

	// Convert string to thirdparty.ModelLevel
	var level thirdparty.ModelLevel
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "medium", "mid":
		level = thirdparty.ModelLevelMid
	case "high":
		level = thirdparty.ModelLevelHigh
	default:
		level = thirdparty.ModelLevelLow
	}

	// Prepare system prompt
	systemPrompt := config.SystemPrompt
	if systemPrompt == "" {
		// Default system prompt if not configured
		systemPrompt = "你是一个友好的助手，请简洁准确地回答用户的问题。回复不要超过200字。"
	}

	// Prepare messages for AI
	messages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: systemPrompt,
		},
		{
			Role:    "user",
			Content: userMessage,
		},
	}

	// Call AI service (non-streaming)
	response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
	if err != nil {
		return "", fmt.Errorf("failed to get AI response: %w", err)
	}

	// Extract reply from response
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	reply := response.Choices[0].Message.Content
	return reply, nil
}
