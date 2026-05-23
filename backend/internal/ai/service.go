// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai/prompts"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/thirdparty"
)

// MCPToolDef is a protocol-agnostic tool definition used to decouple the ai
// package from the mcp package.  Callers convert MCP-specific types to this
// DTO before passing them to ConvertMCPToolsToOpenAIFormat.
type MCPToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// min returns the smaller of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type Service struct {
	db             *gorm.DB
	repo           *Repository
	accountService *thirdparty.Service
}

func NewService(db *gorm.DB, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		repo:           NewRepository(db),
		accountService: accountService,
	}
}

// AI 重试相关常量
const AIMaxRetries = 5

// APIErrorPrefix 是 AI 上游非 200 响应生成的错误前缀。
// 所有 adapter / service_chat / service_analysis 构造 upstream 错误时必须用它，
// 这样 isAIRetryableError 通过单一字符串匹配就能识别可切账号重试的错误。
// 不区分具体 status code：401/403/429/5xx 都进入账号轮换流程。
const APIErrorPrefix = "API error (status"

// isAIRetryableError 检查是否是可重试的 AI 错误。
// 判定规则：错误文案以 APIErrorPrefix 开头的上游响应都会触发账号切换重试。
func isAIRetryableError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), APIErrorPrefix)
}

// aiAttemptFn is the per-attempt callback used by executeWithRetry.
// It receives the resolved model config and the originating account ID.
// Return (result, nil) on success, or (nil, err) on failure.
type aiAttemptFn func(config *thirdparty.AIModelConfig, accountID uint) (any, error)

// executeWithRetry encapsulates the common retry-with-account-switching pattern
// used across all AI service methods. On retryable errors (non-200 API status)
// it excludes the failed account and tries again with a different one.
func (s *Service) executeWithRetry(ctx context.Context, modelLevel thirdparty.ModelLevel, fn aiAttemptFn) (any, error) {
	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			lastErr = err
			// 账号池已耗尽：再循环只是重复同一个错误，直接提前退出避免空转。
			if len(excludeAccountIDs) > 0 {
				break
			}
			continue
		}

		result, err := fn(config, accountID)
		if err == nil {
			return result, nil
		}

		lastErr = err

		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}

		if isAIRetryableError(err) {
			excludeAccountIDs = append(excludeAccountIDs, accountID)
			continue
		}

		return nil, err
	}
	return nil, fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// ==================== Translation & Suggestions ====================

// TranslateToEnglish 将查询翻译成英文学术术语（实现 QueryTranslator 接口）
// 使用Redis缓存避免重复翻译，缓存时间12小时
// 如果查询本身已经是英文，返回空字符串（不需要翻译）
func (s *Service) TranslateToEnglish(ctx context.Context, query string) (string, error) {

	// 1. 生成缓存key（使用MD5避免特殊字符）
	cacheKey := generateTranslationCacheKey(query)

	// 2. 尝试从Redis缓存获取
	// 使用特殊标记区分"未缓存"和"缓存了空值"
	translationCache := cache.NewQueryCache("translation", 12*time.Hour)
	var cachedResult translationCacheResult
	err := translationCache.Get(ctx, cacheKey, &cachedResult)
	if err == nil && cachedResult.Cached {
		if cachedResult.Translation == "" {
			slog.Debug("Translation cache hit, no translation needed", "query", query)
		} else {
			slog.Debug("Translation cache hit", "query", query, "translation", cachedResult.Translation)
		}
		return cachedResult.Translation, nil
	}

	slog.Debug("Translation cache miss, calling AI", "query", query)

	// prompt_templates 表已下线 —— 所有提示词写死在代码,见 0045 迁移。
	translatePrompt := fmt.Sprintf(`你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 如果查询已经是纯英文（包括英文单词、缩写、专有名词等），直接返回空内容，不要返回任何文字
2. 如果查询包含非英文内容（如中文、日文等），将其翻译成准确的英文学术术语
3. 只返回翻译后的英文，不要有任何额外说明
4. 保持学术专业性

查询：%s

翻译（如果是英文则返回空）：`, query)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	// 使用low级别模型调用AI
	response, err := s.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return "", fmt.Errorf("AI translation failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	translatedText := strings.TrimSpace(response.Choices[0].Message.Content)

	// 4. 存入Redis缓存（异步，失败不影响返回）
	// 使用结构体缓存，支持缓存空值
	safego.Go("ai-cache-translation", func() {
		cacheResult := translationCacheResult{
			Cached:      true,
			Translation: translatedText,
		}
		if err := translationCache.Set(context.Background(), cacheKey, cacheResult); err != nil {
			slog.Warn("Failed to cache translation", "err", err)
		} else {
			if translatedText == "" {
				slog.Debug("Translation cached, no translation needed", "query", query)
			} else {
				slog.Debug("Translation cached", "query", query, "translation", translatedText)
			}
		}
	})

	return translatedText, nil
}

// translationCacheResult 翻译缓存结果结构体
// 用于区分"未缓存"和"缓存了空值"的情况
type translationCacheResult struct {
	Cached      bool   `json:"cached"`      // 是否已缓存
	Translation string `json:"translation"` // 翻译结果，空字符串表示不需要翻译
}

// generateTranslationCacheKey 生成翻译缓存的key
// 使用MD5哈希避免特殊字符和长度问题
func generateTranslationCacheKey(query string) string {
	hash := md5.Sum([]byte(strings.TrimSpace(strings.ToLower(query))))
	return hex.EncodeToString(hash[:])
}

// GetSearchSuggestions 获取搜索联想建议（实现 SearchSuggester 接口）
// 使用硬编码的结构化提示词，返回最多3个相关的英文搜索建议
// 使用Redis缓存避免重复调用，缓存时间12小时
func (s *Service) GetSearchSuggestions(ctx context.Context, query string) ([]string, error) {

	// 1. 生成缓存key（使用MD5避免特殊字符）
	cacheKey := "suggestions:" + generateTranslationCacheKey(query)

	// 2. 尝试从Redis缓存获取
	suggestionsCache := cache.NewQueryCache("search_suggestions", 12*time.Hour)
	var cachedResult suggestionsCacheResult
	err := suggestionsCache.Get(ctx, cacheKey, &cachedResult)
	if err == nil && cachedResult.Cached {
		slog.Debug("Suggestions cache hit", "query", query, "suggestions", cachedResult.Suggestions)
		return cachedResult.Suggestions, nil
	}

	slog.Debug("Suggestions cache miss, calling AI", "query", query)

	// 3. 缓存未命中，使用硬编码提示词调用AI
	suggestionsPrompt := prompts.RenderSearchSuggestionsPrompt(query)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: suggestionsPrompt,
		},
	}

	// 使用low级别模型调用AI
	response, err := s.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return nil, fmt.Errorf("AI suggestions failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	responseText := strings.TrimSpace(response.Choices[0].Message.Content)

	// 4. 解析XML格式的响应
	suggestions := parseSearchSuggestions(responseText)

	// 5. 存入Redis缓存（异步，失败不影响返回）
	safego.Go("ai-cache-suggestions", func() {
		cacheResult := suggestionsCacheResult{
			Cached:      true,
			Suggestions: suggestions,
		}
		if err := suggestionsCache.Set(context.Background(), cacheKey, cacheResult); err != nil {
			slog.Warn("Failed to cache suggestions", "err", err)
		} else {
			slog.Debug("Suggestions cached", "query", query, "suggestions", suggestions)
		}
	})

	return suggestions, nil
}

// suggestionsCacheResult 搜索建议缓存结果结构体
type suggestionsCacheResult struct {
	Cached      bool     `json:"cached"`      // 是否已缓存
	Suggestions []string `json:"suggestions"` // 建议列表
}

// parseSearchSuggestions 解析AI返回的XML格式搜索建议
// 提取 <suggestions><item>...</item></suggestions> 中的内容
func parseSearchSuggestions(responseText string) []string {
	var suggestions []string

	// 使用正则表达式提取 <item>...</item> 内容
	itemRegex := regexp.MustCompile(`<item>\s*(.*?)\s*</item>`)
	matches := itemRegex.FindAllStringSubmatch(responseText, -1)

	for _, match := range matches {
		if len(match) > 1 {
			suggestion := strings.TrimSpace(match[1])
			if suggestion != "" && suggestion != "建议1" && suggestion != "建议2" && suggestion != "建议3" {
				suggestions = append(suggestions, suggestion)
			}
		}
	}

	// 最多返回3个建议
	if len(suggestions) > 3 {
		suggestions = suggestions[:3]
	}

	return suggestions
}

