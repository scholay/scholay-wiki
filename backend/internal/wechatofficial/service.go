// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/prompts"
	"scholar-backend/internal/thirdparty"
)

// 共享 upstream.Client for api.weixin.qq.com/cgi-bin/* — token + media 都走。
var (
	wxOfficialOnce   sync.Once
	wxOfficialClient *upstream.Client
)

func wxOfficial() *upstream.Client {
	wxOfficialOnce.Do(func() {
		// 30s timeout — media download 可能要拉几 MB 的图
		hc := &http.Client{Timeout: 30 * time.Second}
		wxOfficialClient = upstream.New("wechat_official").
			BaseURL("https://api.weixin.qq.com").
			HTTPClient(hc).
			Retry(upstream.RetryConfig{
				Max:         2,
				BackoffBase: 300 * time.Millisecond,
				BackoffMax:  2 * time.Second,
			}).
			Breaker(upstream.BreakerConfig{
				MaxRequests:  3,
				MinRequests:  5,
				FailureRatio: 0.6,
				Timeout:      30 * time.Second,
			}).
			MustBuild()
	})
	return wxOfficialClient
}

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

// GetAccessToken gets WeChat access token (cached).
// ctx 用于:刷新 token 时给上游 HTTP 调用绑定超时;命中缓存路径不消耗 ctx。
// 注意此处持写锁,token 刷新慢会卡住所有并发 caller —— 必须 ctx 兜底,
// 不能让 wxOfficial 默认的 30s Timeout 卡满整个锁段。
func (s *Service) GetAccessToken(ctx context.Context) (string, error) {
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

	// 8s ctx 兜底 —— 微信 token 接口正常 <500ms, 给 8s 已经非常宽松, 避免
	// 因网络抖动卡住锁。父 ctx 已 cancel 时直接尊重(不再 WithTimeout)。
	callCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	// Fetch access token from WeChat API
	var tokenResp WeChatAccessTokenResponse
	if err := wxOfficial().GetJSON(callCtx, "/cgi-bin/token", url.Values{
		"grant_type": {"client_credential"},
		"appid":      {config.AppID},
		"secret":     {config.AppSecret},
	}, &tokenResp); err != nil {
		return "", fmt.Errorf("failed to fetch access token: %w", err)
	}

	if tokenResp.ErrCode != 0 {
		return "", fmt.Errorf("WeChat API error %d: %s", tokenResp.ErrCode, tokenResp.ErrMsg)
	}

	// Cache token (expire 5 minutes earlier than actual expiration)
	s.accessToken = tokenResp.AccessToken
	s.accessTokenExpires = time.Now().Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second)

	slog.Info("WeChat access token refreshed", "expires_at", s.accessTokenExpires)

	return s.accessToken, nil
}

// DownloadImage downloads image from WeChat server and returns base64 encoded data.
// 15s ctx 上限 —— 微信图片一般 <2MB, 15s 比默认 30s 严格但仍宽松。
func (s *Service) DownloadImage(ctx context.Context, mediaID string) (string, error) {
	// Get access token
	accessToken, err := s.GetAccessToken(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get access token: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// Download image from WeChat — 注意成功是二进制 / JSON 是错误 (微信特殊响应)
	resp, err := wxOfficial().Do(callCtx, upstream.Request{
		Method: http.MethodGet,
		Path:   "/cgi-bin/media/get",
		Query:  url.Values{"access_token": {accessToken}, "media_id": {mediaID}},
	})
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}

	// 微信对错误情况返回 JSON / text 而非二进制 — 用 Content-Type 区分
	ct := resp.Headers.Get("Content-Type")
	if strings.HasPrefix(ct, "application/json") || strings.HasPrefix(ct, "text/plain") {
		return "", fmt.Errorf("failed to download image, response: %s", string(resp.Body))
	}

	base64Image := base64.StdEncoding.EncodeToString(resp.Body)
	slog.Info("downloaded WeChat image", "size_bytes", len(resp.Body), "base64_length", len(base64Image))
	return base64Image, nil
}

// GetAIReply gets AI reply for user message (text only)
func (s *Service) GetAIReply(ctx context.Context, userMessage string, aiModelLevel string) (string, error) {
	return s.GetAIReplyWithImage(ctx, userMessage, "", aiModelLevel)
}

// GetAIReplyWithImage gets AI reply for user message with optional image
func (s *Service) GetAIReplyWithImage(ctx context.Context, userMessage string, base64Image string, aiModelLevel string) (string, error) {
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
		systemPrompt = prompts.WechatOfficialDefaultSystemPrompt
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
		contentParts := []any{
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

	// 60s ctx 上限 —— 非流式 LLM 长任务 (vision 多模态可能 30-40s);
	// 微信公众号回复在 5s 内是最佳, 但用户已显示"正在思考"提示, 60s 不会超用户预期。
	// 父 ctx 若已 cancel (e.g. 微信端 webhook 重试) 直接终止。
	// LLM 账本归属: feature=wechat_oa, user_id=NULL (公众号非登录用户, 单独统计成本)。
	llmCtx := llmusage.WithCall(ctx, llmusage.Call{Feature: llmusage.FeatureWechatOA})
	aiCtx, cancel := context.WithTimeout(llmCtx, 60*time.Second)
	defer cancel()

	// Call AI service (non-streaming)
	response, err := s.aiService.ChatCompletionWithTools(aiCtx, messages, nil, "", level)
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
