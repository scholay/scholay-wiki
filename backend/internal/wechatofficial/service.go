package wechatofficial

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/thirdparty"
)

// Service handles WeChat Official Account operations
type Service struct {
	repo               *Repository
	aiService          *ai.Service
	accessToken        string
	accessTokenExpires time.Time
	accessTokenMutex   sync.RWMutex
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

// GetAccessToken gets WeChat access token (cached)
func (s *Service) GetAccessToken() (string, error) {
	s.accessTokenMutex.RLock()
	if s.accessToken != "" && time.Now().Before(s.accessTokenExpires) {
		token := s.accessToken
		s.accessTokenMutex.RUnlock()
		return token, nil
	}
	s.accessTokenMutex.RUnlock()

	// Need to fetch new token
	s.accessTokenMutex.Lock()
	defer s.accessTokenMutex.Unlock()

	// Double check after acquiring write lock
	if s.accessToken != "" && time.Now().Before(s.accessTokenExpires) {
		return s.accessToken, nil
	}

	// Get config
	config, err := s.GetConfig()
	if err != nil {
		return "", fmt.Errorf("failed to get config: %w", err)
	}

	// Fetch access token from WeChat API
	url := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s",
		config.AppID, config.AppSecret)

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch access token: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp WeChatAccessTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode access token response: %w", err)
	}

	if tokenResp.ErrCode != 0 {
		return "", fmt.Errorf("WeChat API error %d: %s", tokenResp.ErrCode, tokenResp.ErrMsg)
	}

	// Cache token (expire 5 minutes earlier than actual expiration)
	s.accessToken = tokenResp.AccessToken
	s.accessTokenExpires = time.Now().Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second)

	fmt.Printf("[WeChat] Access token refreshed, expires at: %s\n", s.accessTokenExpires)

	return s.accessToken, nil
}

// DownloadImage downloads image from WeChat server and returns base64 encoded data
func (s *Service) DownloadImage(mediaID string) (string, error) {
	// Get access token
	accessToken, err := s.GetAccessToken()
	if err != nil {
		return "", fmt.Errorf("failed to get access token: %w", err)
	}

	// Download image from WeChat
	url := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/media/get?access_token=%s&media_id=%s",
		accessToken, mediaID)

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	// Read image data
	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read image data: %w", err)
	}

	// Check if response is error (JSON)
	if resp.Header.Get("Content-Type") == "application/json" || resp.Header.Get("Content-Type") == "text/plain" {
		return "", fmt.Errorf("failed to download image, response: %s", string(imageData))
	}

	// Encode to base64
	base64Image := base64.StdEncoding.EncodeToString(imageData)

	fmt.Printf("[WeChat] Downloaded image, size: %d bytes, base64 length: %d\n", len(imageData), len(base64Image))

	return base64Image, nil
}

// GetAIReply gets AI reply for user message (text only)
func (s *Service) GetAIReply(userMessage string, aiModelLevel string) (string, error) {
	return s.GetAIReplyWithImage(userMessage, "", aiModelLevel)
}

// GetAIReplyWithImage gets AI reply for user message with optional image
func (s *Service) GetAIReplyWithImage(userMessage string, base64Image string, aiModelLevel string) (string, error) {
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
	}

	// Build user message content
	var userContent ai.MessageContent
	if base64Image != "" {
		// Multimodal message with image
		contentParts := []interface{}{
			ai.TextContent{
				Type: "text",
				Text: userMessage,
			},
		}

		// Add image if provided
		imageContent := ai.ImageURLContent{
			Type: "image_url",
		}
		imageContent.ImageURL.URL = "data:image/jpeg;base64," + base64Image
		imageContent.ImageURL.Detail = "auto"
		contentParts = append(contentParts, imageContent)

		userContent = contentParts
	} else {
		// Text-only message
		userContent = userMessage
	}

	messages = append(messages, ai.ChatMessage{
		Role:    "user",
		Content: userContent,
	})

	// Call AI service (non-streaming)
	response, err := s.aiService.ChatCompletionWithTools(messages, nil, "", level)
	if err != nil {
		return "", fmt.Errorf("failed to get AI response: %w", err)
	}

	// Extract reply from response
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	// Response content is always string in non-streaming mode
	reply := response.Choices[0].Message.Content
	return reply, nil
}
