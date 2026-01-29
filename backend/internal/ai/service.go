// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"bufio"
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai/prompts"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// min returns the smaller of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type Service struct {
	db             *gorm.DB
	accountService *thirdparty.Service
}

func NewService(db *gorm.DB, accountService *thirdparty.Service) *Service {
	return &Service{
		db:             db,
		accountService: accountService,
	}
}

// AI 重试相关常量
const AIMaxRetries = 5

// isAIRetryableError 检查是否是可重试的 AI 错误
// 只要是 API 错误（非 200 响应）都应该重试，切换到其他账号
func isAIRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	// 所有 "API error (status xxx)" 格式的错误都是非200响应，都应该重试
	// 这包括 401/403/429/500/502/503 等所有非 200 错误
	return strings.Contains(errStr, "API error (status")
}

// RetryableError 包装可重试的错误，用于告诉熔断器这不应该计入失败
type RetryableError struct {
	Err error
}

func (e *RetryableError) Error() string {
	return e.Err.Error()
}

// wrapRetryableError 将可重试的错误包装，避免触发熔断器
func wrapRetryableError(err error) error {
	if isAIRetryableError(err) {
		return &RetryableError{Err: err}
	}
	return err
}

// TranslateToEnglish 将查询翻译成英文学术术语（实现 QueryTranslator 接口）
// 使用Redis缓存避免重复翻译，缓存时间12小时
// 如果查询本身已经是英文，返回空字符串（不需要翻译）
func (s *Service) TranslateToEnglish(query string) (string, error) {
	ctx := context.Background()
	
	// 1. 生成缓存key（使用MD5避免特殊字符）
	cacheKey := generateTranslationCacheKey(query)
	
	// 2. 尝试从Redis缓存获取
	// 使用特殊标记区分"未缓存"和"缓存了空值"
	translationCache := cache.NewQueryCache("translation", 12*time.Hour)
	var cachedResult translationCacheResult
	err := translationCache.Get(ctx, cacheKey, &cachedResult)
	if err == nil && cachedResult.Cached {
		if cachedResult.Translation == "" {
			fmt.Printf("[Translation Cache] Hit for query: '%s' -> (empty, no translation needed)\n", query)
		} else {
			fmt.Printf("[Translation Cache] Hit for query: '%s' -> '%s'\n", query, cachedResult.Translation)
		}
		return cachedResult.Translation, nil
	}
	
	fmt.Printf("[Translation Cache] Miss for query: '%s', calling AI...\n", query)
	
	// 3. 缓存未命中，调用AI翻译
	// 优先从数据库读取提示词模版，本地兜底
	var translatePrompt string
	
	// 尝试从数据库获取提示词模版
	renderedPrompt, template, err := s.GetAndRenderPrompt("search_term_translation", map[string]string{
		"query": query,
	})
	
	if err != nil || template == nil {
		// 数据库获取失败，使用本地兜底提示词
		fmt.Printf("[WARN] Failed to get prompt template from DB: %v, using fallback\n", err)
		translatePrompt = fmt.Sprintf(`你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 如果查询已经是纯英文（包括英文单词、缩写、专有名词等），直接返回空内容，不要返回任何文字
2. 如果查询包含非英文内容（如中文、日文等），将其翻译成准确的英文学术术语
3. 只返回翻译后的英文，不要有任何额外说明
4. 保持学术专业性

查询：%s

翻译（如果是英文则返回空）：`, query)
	} else {
		// 成功从数据库获取提示词模版
		translatePrompt = renderedPrompt
		fmt.Printf("[INFO] Using prompt template from DB: '%s' (ID: %d)\n", template.Name, template.ID)
	}

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	// 使用low级别模型调用AI
	response, err := s.ChatCompletionWithTools(messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return "", fmt.Errorf("AI translation failed: %w", err)
	}
	
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	translatedText := strings.TrimSpace(response.Choices[0].Message.Content)
	
	// 4. 存入Redis缓存（异步，失败不影响返回）
	// 使用结构体缓存，支持缓存空值
	go func() {
		cacheResult := translationCacheResult{
			Cached:      true,
			Translation: translatedText,
		}
		if err := translationCache.Set(context.Background(), cacheKey, cacheResult); err != nil {
			fmt.Printf("[Translation Cache] Failed to cache translation: %v\n", err)
		} else {
			if translatedText == "" {
				fmt.Printf("[Translation Cache] Cached: '%s' -> (empty, no translation needed)\n", query)
			} else {
				fmt.Printf("[Translation Cache] Cached: '%s' -> '%s'\n", query, translatedText)
			}
		}
	}()

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
func (s *Service) GetSearchSuggestions(query string) ([]string, error) {
	ctx := context.Background()

	// 1. 生成缓存key（使用MD5避免特殊字符）
	cacheKey := "suggestions:" + generateTranslationCacheKey(query)

	// 2. 尝试从Redis缓存获取
	suggestionsCache := cache.NewQueryCache("search_suggestions", 12*time.Hour)
	var cachedResult suggestionsCacheResult
	err := suggestionsCache.Get(ctx, cacheKey, &cachedResult)
	if err == nil && cachedResult.Cached {
		fmt.Printf("[Suggestions Cache] Hit for query: '%s' -> %v\n", query, cachedResult.Suggestions)
		return cachedResult.Suggestions, nil
	}

	fmt.Printf("[Suggestions Cache] Miss for query: '%s', calling AI...\n", query)

	// 3. 缓存未命中，使用硬编码提示词调用AI
	suggestionsPrompt := prompts.RenderSearchSuggestionsPrompt(query)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: suggestionsPrompt,
		},
	}

	// 使用low级别模型调用AI
	response, err := s.ChatCompletionWithTools(messages, nil, "", thirdparty.ModelLevelLow)
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
	go func() {
		cacheResult := suggestionsCacheResult{
			Cached:      true,
			Suggestions: suggestions,
		}
		if err := suggestionsCache.Set(context.Background(), cacheKey, cacheResult); err != nil {
			fmt.Printf("[Suggestions Cache] Failed to cache suggestions: %v\n", err)
		} else {
			fmt.Printf("[Suggestions Cache] Cached: '%s' -> %v\n", query, suggestions)
		}
	}()

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

// ListPromptTemplates lists all prompt templates
func (s *Service) ListPromptTemplates() ([]PromptTemplate, error) {
	var templates []PromptTemplate
	err := s.db.Order("created_at DESC").Find(&templates).Error
	return templates, err
}

// GetPromptTemplateByID gets a prompt template by ID
func (s *Service) GetPromptTemplateByID(id uint) (*PromptTemplate, error) {
	var template PromptTemplate
	err := s.db.First(&template, id).Error
	return &template, err
}

// CreatePromptTemplate creates a new prompt template
func (s *Service) CreatePromptTemplate(template *PromptTemplate) error {
	return s.db.Create(template).Error
}

// UpdatePromptTemplate updates a prompt template
func (s *Service) UpdatePromptTemplate(template *PromptTemplate) error {
	return s.db.Save(template).Error
}

// DeletePromptTemplate deletes a prompt template
func (s *Service) DeletePromptTemplate(id uint) error {
	return s.db.Delete(&PromptTemplate{}, id).Error
}

// GetPromptTemplate gets a prompt template by key
func (s *Service) GetPromptTemplate(key string) (*PromptTemplate, error) {
	var template PromptTemplate
	err := s.db.Where("`key` = ? AND is_active = 1", key).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// RenderPrompt renders a template with variables
func (s *Service) RenderPrompt(template string, variables map[string]string) string {
	result := template
	for key, value := range variables {
		placeholder := fmt.Sprintf("{{%s}}", key)
		result = strings.ReplaceAll(result, placeholder, value)
	}
	return result
}

// GetAndRenderPrompt gets a prompt template by key and renders it with variables
// Returns the rendered prompt and the template (for fallback scenarios)
func (s *Service) GetAndRenderPrompt(key string, variables map[string]string) (string, *PromptTemplate, error) {
	template, err := s.GetPromptTemplate(key)
	if err != nil {
		return "", nil, fmt.Errorf("failed to get prompt template '%s': %w", key, err)
	}

	rendered := s.RenderPrompt(template.Template, variables)
	return rendered, template, nil
}

// ChatCompletionWithTools sends a chat completion request with tools (non-streaming)
// Includes automatic retry logic with account switching on 403/429 errors
func (s *Service) ChatCompletionWithTools(messages []ChatMessage, tools []Tool, toolChoice string, modelLevel thirdparty.ModelLevel) (*ChatCompletionResponse, error) {
	fmt.Printf("[DEBUG] ChatCompletionWithTools called, messages: %d, tools: %d, modelLevel: %s\n", len(messages), len(tools), modelLevel)

	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		// Get AI model config by level, excluding previously failed accounts
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			fmt.Printf("[ERROR] Attempt %d: Failed to get AI config: %v\n", attempt+1, err)
			lastErr = err
			continue
		}

		if attempt > 0 {
			fmt.Printf("[AI Retry] Attempt %d/%d with account ID: %d, model: %s\n", attempt+1, AIMaxRetries+1, accountID, config.ModelLow)
		} else {
			fmt.Printf("[DEBUG] Got AI config, BaseURL: %s, Model: %s, AccountID: %d\n", config.BaseURL, config.ModelLow, accountID)
		}

		// ModelLow field contains the actual model code for the requested level
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo" // Final fallback
		}

		// 根据模型类型转换消息格式（Claude vs OpenAI）
		convertedMessages := ConvertMessagesForModel(messages, modelCode)

		// Prepare request
		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    convertedMessages,
			Tools:       tools,
			ToolChoice:  toolChoice,
			Stream:      false,
			Temperature: 0.7,
			MaxTokens:   8192, // 增加输出 token 限制，避免被截断
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		// Debug: Print tool request details
		if attempt == 0 {
			fmt.Printf("[DEBUG] Tool call request body (first 500 chars): %s\n", string(jsonData[:min(500, len(jsonData))]))
			if len(tools) > 0 {
				fmt.Printf("[DEBUG] First tool: name=%s, description=%s\n", tools[0].Function.Name, tools[0].Function.Description)
			}
		}

		// Create HTTP request
		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		// Send request using long-running HTTP client for AI tasks that may take a while
		// (e.g., peer review with PDF processing)
		client := GetLongRunningHTTPClient()

		fmt.Printf("[DEBUG] Sending tool call request to: %s, model: %s\n", url, modelCode)

		// Execute with circuit breaker protection
		resultInterface, err := circuitbreaker.AIServiceBreaker.Execute(func() (interface{}, error) {
			resp, err := client.Do(req)
			if err != nil {
				fmt.Printf("[ERROR] Tool call request failed: %v\n", err)
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()
			fmt.Printf("[DEBUG] Tool call response status: %d\n", resp.StatusCode)

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				fmt.Printf("[ERROR] Tool call API error, status %d: %s\n", resp.StatusCode, string(body))
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			// Parse response
			var result ChatCompletionResponse
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				fmt.Printf("[ERROR] Failed to decode tool call response: %v\n", err)
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}

			fmt.Printf("[DEBUG] Tool call completed successfully, got %d choices\n", len(result.Choices))
			if len(result.Choices) > 0 {
				fmt.Printf("[DEBUG] First choice has %d tool calls\n", len(result.Choices[0].Message.ToolCalls))
				// Debug: Print the AI's response message
				if result.Choices[0].Message.Content != "" {
					fmt.Printf("[DEBUG] AI response content (no tool call): %s\n", result.Choices[0].Message.Content[:min(200, len(result.Choices[0].Message.Content))])
				}
			}

			return &result, nil
		})

		if err != nil {
			lastErr = err

			// Check if circuit breaker is open
			if circuitbreaker.IsCircuitBreakerError(err) {
				return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
			}

			// Check if error is retryable (403/429)
			if isAIRetryableError(err) {
				fmt.Printf("[AI Retry] Retryable error (403/429) with account %d: %v\n", accountID, err)
				excludeAccountIDs = append(excludeAccountIDs, accountID)
				continue
			}

			// Non-retryable error, return immediately
			fmt.Printf("[ERROR] Non-retryable AI error: %v\n", err)
			return nil, err
		}

		// Success
		return resultInterface.(*ChatCompletionResponse), nil
	}

	return nil, fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// ChatCompletionWithModel sends a chat completion request with a specific model (non-streaming)
// This method directly uses the provided baseURL, apiKey and modelName without account selection
func (s *Service) ChatCompletionWithModel(messages []ChatMessage, tools []Tool, toolChoice string, baseURL, apiKey, modelName string) (*ChatCompletionResponse, error) {
	fmt.Printf("[DEBUG] ChatCompletionWithModel called, messages: %d, tools: %d, model: %s\n", len(messages), len(tools), modelName)

	// 根据模型类型转换消息格式（Claude vs OpenAI）
	convertedMessages := ConvertMessagesForModel(messages, modelName)

	// Prepare request
	reqBody := ChatCompletionRequest{
		Model:       modelName,
		Messages:    convertedMessages,
		Tools:       tools,
		ToolChoice:  toolChoice,
		Stream:      false,
		Temperature: 0.7,
		MaxTokens:   8192,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Debug: Print tool request details
	fmt.Printf("[DEBUG] Tool call request body (first 500 chars): %s\n", string(jsonData[:min(500, len(jsonData))]))
	if len(tools) > 0 {
		fmt.Printf("[DEBUG] First tool: name=%s, description=%s\n", tools[0].Function.Name, tools[0].Function.Description)
	}

	// Create HTTP request
	url := strings.TrimSuffix(baseURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Send request using long-running HTTP client
	client := GetLongRunningHTTPClient()

	fmt.Printf("[DEBUG] Sending tool call request to: %s, model: %s\n", url, modelName)

	// Execute with circuit breaker protection
	resultInterface, err := circuitbreaker.AIServiceBreaker.Execute(func() (interface{}, error) {
		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("[ERROR] Tool call request failed: %v\n", err)
			return nil, fmt.Errorf("failed to send request: %w", err)
		}
		defer resp.Body.Close()
		fmt.Printf("[DEBUG] Tool call response status: %d\n", resp.StatusCode)

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			fmt.Printf("[ERROR] Tool call API error, status %d: %s\n", resp.StatusCode, string(body))
			return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
		}

		// Parse response
		var result ChatCompletionResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			fmt.Printf("[ERROR] Failed to decode tool call response: %v\n", err)
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		fmt.Printf("[DEBUG] Tool call completed successfully, got %d choices\n", len(result.Choices))
		if len(result.Choices) > 0 {
			fmt.Printf("[DEBUG] First choice has %d tool calls\n", len(result.Choices[0].Message.ToolCalls))
			if result.Choices[0].Message.Content != "" {
				contentPreview := result.Choices[0].Message.Content
				if len(contentPreview) > 200 {
					contentPreview = contentPreview[:200]
				}
				fmt.Printf("[DEBUG] AI response content (no tool call): %s\n", contentPreview)
			}
		}

		return &result, nil
	})

	if err != nil {
		// Check if circuit breaker is open
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return resultInterface.(*ChatCompletionResponse), nil
}

// StreamChatCompletionWithLevel sends a streaming chat completion request with a specific model level
// Includes automatic retry logic with account switching on 403/429 errors
func (s *Service) StreamChatCompletionWithLevel(messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) error {
	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		// Get AI model config by level, excluding previously failed accounts
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			fmt.Printf("[AI Retry] Attempt %d: Failed to get AI config: %v\n", attempt+1, err)
			lastErr = err
			continue
		}

		if attempt > 0 {
			fmt.Printf("[AI Retry] Attempt %d/%d with account ID: %d, model: %s\n", attempt+1, AIMaxRetries+1, accountID, config.ModelLow)
		}

		// Prepare request - ModelLow field contains the actual model code for this level
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      true,
			Temperature: 0.7,
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("failed to marshal request: %w", err)
		}

		// Create HTTP request
		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		// Send request using streaming HTTP client (no timeout) for long-running streaming requests
		client := GetStreamingHTTPClient()

		// Execute with circuit breaker protection
		_, err = circuitbreaker.AIServiceBreaker.Execute(func() (interface{}, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			// Stream response
			return nil, s.streamResponse(resp.Body, writer)
		})

		if err != nil {
			lastErr = err

			// Check if circuit breaker is open
			if circuitbreaker.IsCircuitBreakerError(err) {
				return fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
			}

			// Check if error is retryable (403/429)
			if isAIRetryableError(err) {
				fmt.Printf("[AI Retry] Retryable error (403/429) with account %d: %v\n", accountID, err)
				excludeAccountIDs = append(excludeAccountIDs, accountID)
				continue
			}

			// Non-retryable error, return immediately
			return err
		}

		// Success
		return nil
	}

	return fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// StreamChatCompletion sends a streaming chat completion request
// Uses mid-level model by default, includes automatic retry logic with account switching
func (s *Service) StreamChatCompletion(messages []ChatMessage, writer io.Writer) error {
	// Use mid-level model by default for general streaming
	return s.StreamChatCompletionWithLevel(messages, writer, thirdparty.ModelLevelMid)
}

// StreamChatCompletionAndCollectWithLevel streams chat completion with specific model level and collects full content
// Includes automatic retry logic with account switching on 403/429 errors
func (s *Service) StreamChatCompletionAndCollectWithLevel(messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) (string, error) {
	fmt.Printf("[DEBUG] StreamChatCompletionAndCollectWithLevel called, modelLevel: %s, messages count: %d\n", modelLevel, len(messages))

	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		// Get AI model config by level, excluding previously failed accounts
		fmt.Printf("[DEBUG] Getting AI model config for level: %s (attempt %d)\n", modelLevel, attempt+1)
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			fmt.Printf("[ERROR] Attempt %d: Failed to get AI model config: %v\n", attempt+1, err)
			lastErr = err
			continue
		}

		if attempt > 0 {
			fmt.Printf("[AI Retry] Attempt %d/%d with account ID: %d, model: %s\n", attempt+1, AIMaxRetries+1, accountID, config.ModelLow)
		} else {
			fmt.Printf("[DEBUG] Got AI model config, BaseURL: %s, Model: %s, AccountID: %d\n", config.BaseURL, config.ModelLow, accountID)
		}

		// Create request - ModelLow field contains the actual model code for this level
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      true,
			Temperature: 0.7,
		}

		fmt.Printf("[DEBUG] Final model for request: %s\n", reqBody.Model)

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			fmt.Printf("[ERROR] Failed to marshal request: %v\n", err)
			return "", fmt.Errorf("failed to marshal request: %w", err)
		}
		fmt.Printf("[DEBUG] Request marshaled successfully, size: %d bytes\n", len(jsonData))

		// Create HTTP request
		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		fmt.Printf("[DEBUG] Creating request to URL: %s\n", url)
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			fmt.Printf("[ERROR] Failed to create HTTP request: %v\n", err)
			return "", fmt.Errorf("failed to create request: %w", err)
		}
		fmt.Printf("[DEBUG] HTTP request created successfully\n")

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		// Send request with streaming HTTP client (no timeout) for long-running streaming requests
		client := GetStreamingHTTPClient()

		fmt.Printf("[DEBUG] Sending AI request, model: %s, url: %s, level: %s\n", reqBody.Model, url, modelLevel)

		// Execute with circuit breaker protection
		resultInterface, err := circuitbreaker.AIServiceBreaker.Execute(func() (interface{}, error) {
			resp, err := client.Do(req)
			if err != nil {
				fmt.Printf("[ERROR] AI request failed: %v\n", err)
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				fmt.Printf("[ERROR] AI API returned status %d, model: %s, body: %s\n", resp.StatusCode, reqBody.Model, string(body))
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			fmt.Printf("[DEBUG] AI API call successful, model: %s, starting to stream response\n", reqBody.Model)
			// Stream response and collect content
			return s.streamResponseAndCollect(resp.Body, writer)
		})

		if err != nil {
			lastErr = err

			// Check if circuit breaker is open
			if circuitbreaker.IsCircuitBreakerError(err) {
				return "", fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
			}

			// Check if error is retryable (403/429)
			if isAIRetryableError(err) {
				fmt.Printf("[AI Retry] Retryable error (403/429) with account %d: %v\n", accountID, err)
				excludeAccountIDs = append(excludeAccountIDs, accountID)
				continue
			}

			// Non-retryable error, return immediately
			return "", err
		}

		// Success
		return resultInterface.(string), nil
	}

	return "", fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// StreamChatCompletionAndCollect streams chat completion and collects full content
// Uses mid-level model by default, includes automatic retry logic with account switching
func (s *Service) StreamChatCompletionAndCollect(messages []ChatMessage, writer io.Writer) (string, error) {
	// Use mid-level model by default for general streaming with collection
	return s.StreamChatCompletionAndCollectWithLevel(messages, writer, thirdparty.ModelLevelMid)
}

// streamResponse reads SSE stream and writes to output
func (s *Service) streamResponse(reader io.Reader, writer io.Writer) error {
	scanner := bufio.NewScanner(reader)
	// Increase buffer size to handle large SSE messages (1MB)
	const maxScannerBuffer = 1024 * 1024
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines
		if line == "" {
			continue
		}

		// Check for SSE data line
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		// Check for stream end
		if data == "[DONE]" {
			break
		}

		// Parse JSON chunk
		var chunk ChatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Log error but continue
			fmt.Printf("Warning: failed to parse chunk: %v\n", err)
			continue
		}

		// Extract content and forward the entire chunk as JSON
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			// Marshal the chunk back to JSON
			chunkJSON, err := json.Marshal(chunk)
			if err != nil {
				fmt.Printf("Warning: failed to marshal chunk: %v\n", err)
				continue
			}

			// Write SSE formatted data
			_, err = fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON))
			if err != nil {
				return err
			}

			// Flush if writer is a flusher
			if flusher, ok := writer.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading stream: %w", err)
	}

	return nil
}

// streamResponseAndCollect reads SSE stream, writes to output, and collects full content
func (s *Service) streamResponseAndCollect(reader io.Reader, writer io.Writer) (string, error) {
	scanner := bufio.NewScanner(reader)
	// Increase buffer size to handle large SSE messages (1MB)
	const maxScannerBuffer = 1024 * 1024
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)
	var fullContent strings.Builder

	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines
		if line == "" {
			continue
		}

		// Check for SSE data line
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		// Check for stream end
		if data == "[DONE]" {
			break
		}

		// Parse JSON chunk
		var chunk ChatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Log error but continue
			fmt.Printf("Warning: failed to parse chunk: %v\n", err)
			continue
		}

		// Extract content and forward the entire chunk as JSON
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			content := chunk.Choices[0].Delta.Content

			// Collect content
			fullContent.WriteString(content)

			// Marshal the chunk back to JSON
			chunkJSON, err := json.Marshal(chunk)
			if err != nil {
				fmt.Printf("Warning: failed to marshal chunk: %v\n", err)
				continue
			}

			// Write SSE formatted data
			_, err = fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON))
			if err != nil {
				return "", err
			}

			// Flush if writer is a flusher
			if flusher, ok := writer.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("error reading stream: %w", err)
	}

	return fullContent.String(), nil
}

// ConvertMCPToolsToOpenAIFormat converts MCP tools to OpenAI function calling format
func ConvertMCPToolsToOpenAIFormat(mcpTools []mcp.Tool) []Tool {
	tools := make([]Tool, 0, len(mcpTools))

	for _, mcpTool := range mcpTools {
		tool := Tool{
			Type: "function",
			Function: ToolFunction{
				Name:        mcpTool.Name,
				Description: mcpTool.Description,
				Parameters:  mcpTool.InputSchema,
			},
		}
		tools = append(tools, tool)
	}

	return tools
}

// FormatPapersForPrompt formats papers list for prompt with flexible limits
func FormatPapersForPrompt(papers []map[string]interface{}) string {
	return FormatPapersForPromptWithLimit(papers, 20, 300)
}

// FormatPapersForPromptWithLimit formats papers with custom limits
func FormatPapersForPromptWithLimit(papers []map[string]interface{}, maxPapers int, maxAbstractLen int) string {
	var builder strings.Builder

	for i, paper := range papers {
		if i >= maxPapers {
			break
		}

		builder.WriteString(fmt.Sprintf("\n### %d. ", i+1))

		// Title
		if title, ok := paper["title"].(string); ok {
			builder.WriteString(title)
		}
		builder.WriteString("\n")

		// Authors (limit to first 3 for brevity)
		if authors, ok := paper["authors"].([]interface{}); ok && len(authors) > 0 {
			builder.WriteString("**作者**: ")
			authorNames := make([]string, 0, len(authors))
			maxAuthors := 3
			for j, author := range authors {
				if j >= maxAuthors {
					authorNames = append(authorNames, "等")
					break
				}
				if authorMap, ok := author.(map[string]interface{}); ok {
					if name, ok := authorMap["name"].(string); ok {
						authorNames = append(authorNames, name)
					}
				}
			}
			builder.WriteString(strings.Join(authorNames, ", "))
			builder.WriteString("\n")
		}

		// Year and venue
		if year, ok := paper["year"].(float64); ok {
			builder.WriteString(fmt.Sprintf("**年份**: %.0f  ", year))
		}
		if venue, ok := paper["venue"].(string); ok && venue != "" {
			builder.WriteString(fmt.Sprintf("**期刊/会议**: %s  ", venue))
		}
		if citationCount, ok := paper["citationCount"].(float64); ok {
			builder.WriteString(fmt.Sprintf("**引用次数**: %.0f", citationCount))
		}
		builder.WriteString("\n")

		// Abstract
		if abstract, ok := paper["abstract"].(string); ok && abstract != "" {
			// Limit abstract length
			if len(abstract) > maxAbstractLen {
				abstract = abstract[:maxAbstractLen] + "..."
			}
			builder.WriteString(fmt.Sprintf("**摘要**: %s\n", abstract))
		}

		builder.WriteString("\n")
	}

	return builder.String()
}

// TruncateContextForLimit truncates context messages to fit within token limit
// Priority: Keep system messages, current query, and current papers; truncate old messages
func TruncateContextForLimit(messages []ChatMessage, maxChars int) []ChatMessage {
	const avgCharsPerToken = 4 // Rough estimate: 1 token ≈ 4 characters for mixed content
	maxContextChars := maxChars - 20000 // Reserve space for response

	// Helper function to get content length
	getContentLength := func(content MessageContent) int {
		if content == nil {
			return 0
		}
		// Handle string content
		if strContent, ok := content.(string); ok {
			return len(strContent)
		}
		// Estimate length for other types (rough estimate)
		return 100
	}

	// Helper function to get content as string for checking
	getContentString := func(content MessageContent) string {
		if strContent, ok := content.(string); ok {
			return strContent
		}
		return ""
	}

	// Calculate total length
	totalChars := 0
	for _, msg := range messages {
		totalChars += getContentLength(msg.Content)
	}

	// If within limit, return as is
	if totalChars <= maxContextChars {
		return messages
	}

	// Strategy: Keep first (system) and last messages, truncate middle
	var result []ChatMessage

	// Always keep system message if exists
	startIdx := 0
	if len(messages) > 0 && messages[0].Role == "system" {
		result = append(result, messages[0])
		startIdx = 1
		maxContextChars -= getContentLength(messages[0].Content)
	}

	// Keep last few messages (current conversation)
	keepLast := 2 // Keep last 2 messages (user query + current context)
	if len(messages)-startIdx > keepLast {
		// Add truncation notice
		result = append(result, ChatMessage{
			Role:    "assistant",
			Content: "[之前的对话历史已被截断以节省空间]",
		})

		// Add last messages
		for i := len(messages) - keepLast; i < len(messages); i++ {
			msg := messages[i]
			contentStr := getContentString(msg.Content)

			// If message contains papers, truncate them
			if strings.Contains(contentStr, "### 1.") && len(contentStr) > 10000 {
				// This is likely a paper list, truncate it
				truncated := contentStr[:5000] + "\n\n[...论文列表已截断...]"
				msg.Content = truncated
			}
			result = append(result, msg)
		}
	} else {
		// Keep all if not many messages
		result = append(result, messages[startIdx:]...)
	}

	return result
}


// 论文分析重试次数
const AnalysisMaxRetries = 3

// 分批请求时每批的维度数量
const DimensionsPerBatch = 4

// AnalysisContext 分析上下文，用于扣费去重
type AnalysisContext struct {
	DimensionHash string // 维度配置哈希
	FromCache     bool   // 是否来自缓存
}

// AnalyzePaperAbstract 分析论文摘要，提取结构化信息
// 使用low级别模型进行分析，根据用户的分析维度动态生成提示词
// 优先从数据库缓存获取，如果没有则调用AI分析并保存结果
// 当JSON解析失败时，最多重试3次；如果仍然失败，则按维度分批请求
// userID: 用户ID，用于获取用户自定义的分析维度（nil表示使用系统默认）
// 返回: 分析结果, 分析上下文（用于扣费去重）, 错误
func (s *Service) AnalyzePaperAbstract(paperId string, paperTitle string, abstract string, userID *uint) (*PaperAnalysisResult, *AnalysisContext, error) {
	if abstract == "" {
		return nil, nil, fmt.Errorf("abstract is required for analysis")
	}

	// 1. 获取用户的分析维度
	dimensionResult, err := s.GetAnalysisDimensions(userID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get analysis dimensions: %w", err)
	}

	dimensions := dimensionResult.Dimensions
	if len(dimensions) == 0 {
		return nil, nil, fmt.Errorf("no active analysis dimensions found")
	}

	// 生成维度的哈希值，用于缓存key
	dimensionHash := s.generateDimensionHash(dimensions)
	
	// 创建分析上下文
	analysisCtx := &AnalysisContext{
		DimensionHash: dimensionHash,
		FromCache:     false,
	}

	// 2. 检查数据库缓存（需要匹配维度哈希）
	if paperId != "" {
		var cachedAnalysis PaperAnalysis
		if err := s.db.Where("paper_id = ? AND dimension_hash = ?", paperId, dimensionHash).First(&cachedAnalysis).Error; err == nil {
			// 找到匹配的缓存，直接返回
			fmt.Printf("[INFO] Found cached analysis for paper: %s (dimension_hash: %s)\n", paperId, dimensionHash)
			analysisCtx.FromCache = true
			return s.convertCachedAnalysisToResult(cachedAnalysis, dimensions), analysisCtx, nil
		}
		// 没找到匹配的缓存，继续调用AI分析
		fmt.Printf("[INFO] No cached analysis found for paper: %s with dimension_hash: %s, calling AI...\n", paperId, dimensionHash)
	}

	// 3. 首先尝试一次性分析所有维度（带重试）
	resultMap, parseSuccess := s.analyzeWithRetry(paperTitle, abstract, dimensions, paperId)
	
	// 4. 如果一次性分析失败，尝试分批请求
	if !parseSuccess {
		fmt.Printf("[INFO] Full analysis failed, trying batch analysis for paper: %s\n", paperId)
		resultMap, parseSuccess = s.analyzeInBatches(paperTitle, abstract, dimensions, paperId)
	}

	// 5. 只有解析成功才保存到数据库
	if parseSuccess && paperId != "" {
		analysisDataJSON, _ := json.Marshal(resultMap)
		
		paperAnalysis := PaperAnalysis{
			PaperID:       paperId,
			PaperTitle:    paperTitle,
			DimensionHash: dimensionHash,
			AnalysisData:  string(analysisDataJSON),
		}
		
		if err := s.db.Where("paper_id = ? AND dimension_hash = ?", paperId, dimensionHash).
			Assign(paperAnalysis).FirstOrCreate(&paperAnalysis).Error; err != nil {
			fmt.Printf("[WARN] Failed to save paper analysis to database: %v\n", err)
		} else {
			fmt.Printf("[INFO] Saved paper analysis to database for paper: %s (dimension_hash: %s)\n", paperId, dimensionHash)
		}
	} else if !parseSuccess {
		fmt.Printf("[WARN] Analysis failed for paper: %s, not saving to database\n", paperId)
	}

	// 6. 转换为 PaperAnalysisResult 返回
	result := s.convertMapToResult(resultMap, dimensions)
	return result, analysisCtx, nil
}

// analyzeWithRetry 带重试的分析，返回结果map和是否解析成功
func (s *Service) analyzeWithRetry(paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
	prompt := s.buildAnalysisPrompt(paperTitle, abstract, dimensions)
	messages := []ChatMessage{
		{
			Role:    "user",
			Content: prompt,
		},
	}

	for attempt := 1; attempt <= AnalysisMaxRetries; attempt++ {
		if attempt > 1 {
			fmt.Printf("[Analysis Retry] Attempt %d/%d for paper: %s\n", attempt, AnalysisMaxRetries, paperId)
		}
		
		response, err := s.ChatCompletionWithTools(messages, nil, "", thirdparty.ModelLevelLow)
		if err != nil {
			fmt.Printf("[ERROR] AI analysis failed on attempt %d: %v\n", attempt, err)
			continue
		}

		if len(response.Choices) == 0 {
			fmt.Printf("[ERROR] No response from AI on attempt %d\n", attempt)
			continue
		}

		content := strings.TrimSpace(response.Choices[0].Message.Content)
		content = s.extractJSONFromContent(content)

		resultMap := make(map[string]string)
		if err := json.Unmarshal([]byte(content), &resultMap); err != nil {
			fmt.Printf("[WARN] Attempt %d: Failed to parse AI response as JSON: %v\n", attempt, err)
			fmt.Printf("[DEBUG] Raw content length: %d\n", len(content))
			if len(content) > 0 {
				fmt.Printf("[DEBUG] Raw content (first 2000 chars): %s\n", content[:min(2000, len(content))])
			}
			continue
		}

		// 解析成功
		if attempt > 1 {
			fmt.Printf("[Analysis Retry] Successfully parsed on attempt %d for paper: %s\n", attempt, paperId)
		}
		return resultMap, true
	}

	// 所有重试都失败
	fmt.Printf("[ERROR] All %d attempts failed for paper: %s\n", AnalysisMaxRetries, paperId)
	return nil, false
}

// analyzeInBatches 分批分析维度，每批最多4个维度
func (s *Service) analyzeInBatches(paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
	resultMap := make(map[string]string)
	allSuccess := true
	
	// 将维度分成多个批次
	for i := 0; i < len(dimensions); i += DimensionsPerBatch {
		end := i + DimensionsPerBatch
		if end > len(dimensions) {
			end = len(dimensions)
		}
		
		batchDimensions := dimensions[i:end]
		batchNum := (i / DimensionsPerBatch) + 1
		totalBatches := (len(dimensions) + DimensionsPerBatch - 1) / DimensionsPerBatch
		
		fmt.Printf("[Batch Analysis] Processing batch %d/%d (%d dimensions) for paper: %s\n", 
			batchNum, totalBatches, len(batchDimensions), paperId)
		
		// 对每个批次进行分析（带重试）
		batchResult, success := s.analyzeWithRetry(paperTitle, abstract, batchDimensions, paperId)
		
		if success {
			// 合并结果
			for k, v := range batchResult {
				resultMap[k] = v
			}
		} else {
			// 批次失败，标记对应维度为解析失败
			allSuccess = false
			for _, dim := range batchDimensions {
				resultMap[dim.DimensionKey] = "解析失败"
			}
			fmt.Printf("[WARN] Batch %d failed for paper: %s\n", batchNum, paperId)
		}
	}
	
	if allSuccess {
		fmt.Printf("[Batch Analysis] All batches completed successfully for paper: %s\n", paperId)
	} else {
		fmt.Printf("[WARN] Some batches failed for paper: %s\n", paperId)
	}
	
	// 只要有部分成功就返回true（部分结果总比没有好）
	hasAnySuccess := false
	for _, v := range resultMap {
		if v != "解析失败" {
			hasAnySuccess = true
			break
		}
	}
	
	return resultMap, hasAnySuccess
}

// extractJSONFromContent 从AI响应中提取JSON内容
func (s *Service) extractJSONFromContent(content string) string {
	if strings.Contains(content, "```json") {
		start := strings.Index(content, "```json") + 7
		end := strings.LastIndex(content, "```")
		if end > start {
			return strings.TrimSpace(content[start:end])
		}
	} else if strings.Contains(content, "```") {
		start := strings.Index(content, "```") + 3
		end := strings.LastIndex(content, "```")
		if end > start {
			return strings.TrimSpace(content[start:end])
		}
	}
	return content
}

// PaperAnalysisResult 论文分析结果结构（动态维度）
type PaperAnalysisResult struct {
	// 动态维度数据，key为dimension_key，value为分析结果
	Data map[string]string `json:"data"`
	// 维度元信息，用于前端显示
	Dimensions []DimensionInfo `json:"dimensions"`
}

// DimensionInfo 维度信息（用于前端显示）
type DimensionInfo struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

// generateDimensionHash 生成维度配置的哈希值
// 用于判断缓存是否匹配当前维度配置
func (s *Service) generateDimensionHash(dimensions []AnalysisDimension) string {
	// 将维度的key和description拼接后计算MD5
	var sb strings.Builder
	for _, dim := range dimensions {
		sb.WriteString(dim.DimensionKey)
		sb.WriteString(":")
		sb.WriteString(dim.Description)
		sb.WriteString(";")
	}
	hash := md5.Sum([]byte(sb.String()))
	return hex.EncodeToString(hash[:8]) // 只取前8字节，生成16位哈希
}

// buildAnalysisPrompt 动态构建分析提示词
// 优先从数据库获取提示词模板，本地兜底
func (s *Service) buildAnalysisPrompt(paperTitle, abstract string, dimensions []AnalysisDimension) string {
	// 1. 构建维度列表字符串
	dimensionList := s.buildDimensionListString(dimensions)
	
	// 2. 构建JSON输出格式字符串
	jsonFormat := s.buildJSONFormatString(dimensions)
	
	// 3. 尝试从数据库获取提示词模板
	renderedPrompt, template, err := s.GetAndRenderPrompt("dimensions_paper_analysis", map[string]string{
		"paper_title":    paperTitle,
		"abstract":       abstract,
		"dimension_list": dimensionList,
		"json_format":    jsonFormat,
	})
	
	if err != nil || template == nil {
		// 数据库获取失败，使用本地兜底提示词
		fmt.Printf("[WARN] Failed to get prompt template 'dimensions_paper_analysis' from DB: %v, using fallback\n", err)
		return s.buildAnalysisPromptFallback(paperTitle, abstract, dimensionList, jsonFormat)
	}
	
	fmt.Printf("[INFO] Using prompt template from DB: '%s' (ID: %d)\n", template.Name, template.ID)
	return renderedPrompt
}

// buildDimensionListString 构建维度列表字符串
func (s *Service) buildDimensionListString(dimensions []AnalysisDimension) string {
	var sb strings.Builder
	for i, dim := range dimensions {
		sb.WriteString(fmt.Sprintf("%d. %s（%s）\n", i+1, dim.Name, dim.DimensionKey))
		sb.WriteString(fmt.Sprintf("分析指示：%s\n\n", dim.Description))
	}
	return sb.String()
}

// buildJSONFormatString 构建JSON输出格式字符串
func (s *Service) buildJSONFormatString(dimensions []AnalysisDimension) string {
	var sb strings.Builder
	sb.WriteString("{\n")
	for i, dim := range dimensions {
		if i < len(dimensions)-1 {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\",\n", dim.DimensionKey, dim.Name))
		} else {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\"\n", dim.DimensionKey, dim.Name))
		}
	}
	sb.WriteString("}")
	return sb.String()
}

// buildAnalysisPromptFallback 本地兜底提示词
func (s *Service) buildAnalysisPromptFallback(paperTitle, abstract, dimensionList, jsonFormat string) string {
	var sb strings.Builder
	
	sb.WriteString("请你阅读以下论文摘要，并严格根据摘要内容进行分析。\n\n")
	sb.WriteString(fmt.Sprintf("论文标题：%s\n\n", paperTitle))
	sb.WriteString(fmt.Sprintf("论文摘要：%s\n\n", abstract))
	
	sb.WriteString("为确保输出稳定性、可控性与准确性，请遵守以下规则：\n")
	sb.WriteString("【核心规则】\n")
	sb.WriteString("1. 必须先在内部逐步推理，但不要展示推理过程，只输出最终结果。\n")
	sb.WriteString("2. 所有分类必须完全基于摘要原文，不允许推断、不允许类比、不允许编造。\n")
	sb.WriteString("3. 允许所有维度的结果为空。如果摘要中完全没有对应信息，请回答：未提及。\n")
	sb.WriteString("4. 当摘要极短、极度模糊、非学术化、甚至不含任何可分析内容时，你必须保持结构完整，但允许全部返回未提及。\n")
	sb.WriteString("5. 不要引入摘要中没有的技术、领域、理论、国家、组织、数据、研究方法等信息。\n")
	sb.WriteString("6. 每一项结论都必须在摘要中找到明确对应的词句；若无法定位对应内容，必须回答：未提及。\n\n")
	
	sb.WriteString("【分析维度】\n")
	sb.WriteString(dimensionList)
	
	sb.WriteString("【输出格式】\n")
	sb.WriteString("请严格使用以下JSON格式输出，不得增删字段：\n")
	sb.WriteString(jsonFormat)
	sb.WriteString("\n\n所有维度都必须输出，即使内容全部为\"未提及\"。")
	
	return sb.String()
}

// convertCachedAnalysisToResult 将缓存的分析结果转换为返回结构
func (s *Service) convertCachedAnalysisToResult(cached PaperAnalysis, dimensions []AnalysisDimension) *PaperAnalysisResult {
	// 解析存储的JSON数据
	var dataMap map[string]string
	if err := json.Unmarshal([]byte(cached.AnalysisData), &dataMap); err != nil {
		dataMap = make(map[string]string)
	}
	
	return s.convertMapToResult(dataMap, dimensions)
}

// convertMapToResult 将map数据转换为返回结构
func (s *Service) convertMapToResult(dataMap map[string]string, dimensions []AnalysisDimension) *PaperAnalysisResult {
	result := &PaperAnalysisResult{
		Data:       dataMap,
		Dimensions: make([]DimensionInfo, 0, len(dimensions)),
	}
	
	for _, dim := range dimensions {
		value := dataMap[dim.DimensionKey]
		if value == "" {
			value = "未提及"
		}
		result.Dimensions = append(result.Dimensions, DimensionInfo{
			Key:   dim.DimensionKey,
			Name:  dim.Name,
			Value: value,
		})
	}
	
	return result
}

// ChatCompletionWithLevel calls AI model without streaming and returns the complete response
// Used for non-streaming operations like generating follow-up questions
// Includes automatic retry logic with account switching on 403/429 errors
func (s *Service) ChatCompletionWithLevel(messages []ChatMessage, modelLevel thirdparty.ModelLevel) (string, error) {
	fmt.Printf("[DEBUG] ChatCompletionWithLevel called, modelLevel: %s, messages count: %d\n", modelLevel, len(messages))

	var lastErr error
	var excludeAccountIDs []uint

	for attempt := 0; attempt <= AIMaxRetries; attempt++ {
		// Get AI model config by level, excluding previously failed accounts
		config, accountID, err := s.accountService.GetRandomAIModelConfigByLevelExcluding(modelLevel, excludeAccountIDs)
		if err != nil {
			fmt.Printf("[AI Retry] Attempt %d: Failed to get AI config: %v\n", attempt+1, err)
			lastErr = err
			continue
		}

		if attempt > 0 {
			fmt.Printf("[AI Retry] Attempt %d/%d with account ID: %d, model: %s\n", attempt+1, AIMaxRetries+1, accountID, config.ModelLow)
		}

		// ModelLow field now contains the actual model code for the requested level
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo" // Final fallback
		}

		// Prepare request (NO streaming)
		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      false, // Non-streaming
			Temperature: 0.7,
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return "", fmt.Errorf("failed to marshal request: %w", err)
		}

		// Create HTTP request
		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return "", fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		// Send request using long-running HTTP client for AI tasks
		client := GetLongRunningHTTPClient()

		// Execute with circuit breaker protection
		resultInterface, err := circuitbreaker.AIServiceBreaker.Execute(func() (interface{}, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			// Parse non-streaming response
			var response ChatCompletionResponse
			if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}

			if len(response.Choices) == 0 {
				return nil, fmt.Errorf("no response choices returned")
			}

			return response.Choices[0].Message.Content, nil
		})

		if err != nil {
			lastErr = err

			// Check if circuit breaker is open
			if circuitbreaker.IsCircuitBreakerError(err) {
				return "", fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
			}

			// Check if error is retryable (403/429)
			if isAIRetryableError(err) {
				fmt.Printf("[AI Retry] Retryable error (403/429) with account %d: %v\n", accountID, err)
				excludeAccountIDs = append(excludeAccountIDs, accountID)
				continue
			}

			// Non-retryable error, return immediately
			return "", err
		}

		// Success
		return resultInterface.(string), nil
	}

	return "", fmt.Errorf("all %d AI retry attempts failed, last error: %w", AIMaxRetries+1, lastErr)
}

// GetAnalysisDimensions 获取用户的分析维度
// 采用覆盖式设计：系统默认维度 + 用户自定义维度（用户自定义覆盖同dimension_key的系统默认）
// GetAnalysisDimensionsResult 返回维度列表和是否自定义的标志
type GetAnalysisDimensionsResult struct {
	Dimensions []AnalysisDimension
	IsCustom   bool // 是否包含用户自定义维度
}

func (s *Service) GetAnalysisDimensions(userID *uint) (*GetAnalysisDimensionsResult, error) {
	// 1. 获取系统默认维度（user_id = -1 表示系统级）
	var systemDimensions []AnalysisDimension
	err := s.db.Where("user_id = -1 AND is_active = ?", true).
		Order("sort_order ASC").
		Find(&systemDimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}

	// 如果没有用户ID，直接返回系统默认维度
	if userID == nil || *userID == 0 {
		fmt.Printf("[INFO] Using %d system default dimensions (no user)\n", len(systemDimensions))
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	// 2. 获取用户自定义维度
	var userDimensions []AnalysisDimension
	err = s.db.Where("user_id = ?", *userID).
		Find(&userDimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}

	// 如果用户没有任何自定义维度，直接返回系统默认
	if len(userDimensions) == 0 {
		fmt.Printf("[INFO] Using %d system default dimensions for user %d (no customization)\n", len(systemDimensions), *userID)
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	// 3. 合并：用户自定义覆盖系统默认（按dimension_key匹配）
	userDimMap := make(map[string]AnalysisDimension)
	for _, ud := range userDimensions {
		userDimMap[ud.DimensionKey] = ud
	}

	var mergedDimensions []AnalysisDimension
	customCount := 0
	for _, sd := range systemDimensions {
		if ud, exists := userDimMap[sd.DimensionKey]; exists {
			// 用户有自定义，检查是否启用
			if ud.IsActive {
				mergedDimensions = append(mergedDimensions, ud)
				customCount++
			}
			// 如果用户自定义为停用，则该维度不显示
		} else {
			// 用户没有自定义，使用系统默认
			mergedDimensions = append(mergedDimensions, sd)
		}
	}

	// 4. 检查用户是否有额外的自定义维度（不在系统默认中的）
	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] && ud.IsActive {
			// 用户新增的维度
			mergedDimensions = append(mergedDimensions, ud)
			customCount++
		}
	}

	// 按sort_order排序
	sort.Slice(mergedDimensions, func(i, j int) bool {
		return mergedDimensions[i].SortOrder < mergedDimensions[j].SortOrder
	})

	fmt.Printf("[INFO] Merged dimensions for user %d: %d total (%d customized)\n", *userID, len(mergedDimensions), customCount)
	return &GetAnalysisDimensionsResult{
		Dimensions: mergedDimensions,
		IsCustom:   customCount > 0, // 只有当实际有自定义维度时才为true
	}, nil
}

// GetSystemDimensions 获取系统默认维度（user_id = -1 表示系统级）
func (s *Service) GetSystemDimensions() ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := s.db.Where("user_id = -1 AND is_active = ?", true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}
	return dimensions, nil
}

// GetUserDimensions 获取用户自定义维度
func (s *Service) GetUserDimensions(userID uint) ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := s.db.Where("user_id = ? AND is_active = ?", userID, true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}
	return dimensions, nil
}

// 用户维度数量限制
const MaxUserDimensions = 15

// CreateUserDimension 创建或更新用户自定义维度
// 如果用户已有该dimension_key的自定义，则更新；否则创建新的
// 维度总数限制为15个（系统维度 + 用户新增的自定义维度）
func (s *Service) CreateUserDimension(userID uint, dimensionKey, name, description string, sortOrder int) (*AnalysisDimension, error) {
	// 检查用户是否已有该dimension_key的自定义
	var existingDimension AnalysisDimension
	err := s.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).First(&existingDimension).Error
	
	if err == nil {
		// 已存在，更新（修改系统维度或更新已有自定义维度，不计入数量限制）
		existingDimension.Name = name
		existingDimension.Description = description
		existingDimension.SortOrder = sortOrder
		existingDimension.IsActive = true
		
		if err := s.db.Save(&existingDimension).Error; err != nil {
			return nil, fmt.Errorf("failed to update dimension: %w", err)
		}
		fmt.Printf("[INFO] Updated user dimension: %s for user %d\n", dimensionKey, userID)
		return &existingDimension, nil
	}

	// 不存在，需要创建新的
	// 检查是否是修改系统维度（dimension_key已存在于系统维度中）
	var systemDimension AnalysisDimension
	isModifyingSystemDimension := s.db.Where("user_id = -1 AND dimension_key = ?", dimensionKey).First(&systemDimension).Error == nil

	// 只有新增自定义维度（非修改系统维度）才需要检查数量限制
	if !isModifyingSystemDimension {
		// 计算用户当前的维度总数
		currentCount, err := s.GetUserDimensionCount(userID)
		if err != nil {
			return nil, fmt.Errorf("failed to check dimension count: %w", err)
		}

		if currentCount >= MaxUserDimensions {
			return nil, fmt.Errorf("已达到维度数量上限（%d个），请删除部分自定义维度后再添加", MaxUserDimensions)
		}
	}

	// 创建新的维度记录
	dimension := &AnalysisDimension{
		UserID:       int64(userID),
		DimensionKey: dimensionKey,
		Name:         name,
		Description:  description,
		SortOrder:    sortOrder,
		IsActive:     true,
	}

	if err := s.db.Create(dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to create dimension: %w", err)
	}

	if isModifyingSystemDimension {
		fmt.Printf("[INFO] Created user override for system dimension: %s for user %d\n", dimensionKey, userID)
	} else {
		fmt.Printf("[INFO] Created new user dimension: %s for user %d\n", dimensionKey, userID)
	}
	return dimension, nil
}

// GetUserDimensionCount 获取用户的维度总数
// 计算逻辑：系统维度数量 + 用户新增的自定义维度数量（不包括用户对系统维度的修改）
func (s *Service) GetUserDimensionCount(userID uint) (int, error) {
	// 获取系统维度
	systemDimensions, err := s.GetSystemDimensions()
	if err != nil {
		return 0, err
	}
	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}

	// 获取用户自定义维度
	userDimensions, err := s.GetUserDimensions(userID)
	if err != nil {
		return 0, err
	}

	// 计算用户新增的维度数量（不在系统维度中的）
	customCount := 0
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] {
			customCount++
		}
	}

	// 总数 = 系统维度数量 + 用户新增的自定义维度数量
	totalCount := len(systemDimensions) + customCount
	fmt.Printf("[INFO] User %d dimension count: %d (system: %d, custom: %d)\n", 
		userID, totalCount, len(systemDimensions), customCount)
	return totalCount, nil
}

// UpdateUserDimension 更新用户自定义维度
func (s *Service) UpdateUserDimension(userID uint, dimensionID uint, name, description string, sortOrder int) (*AnalysisDimension, error) {
	var dimension AnalysisDimension
	if err := s.db.Where("id = ? AND user_id = ?", dimensionID, userID).First(&dimension).Error; err != nil {
		return nil, fmt.Errorf("dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder

	if err := s.db.Save(&dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	return &dimension, nil
}

// DeleteUserDimension 删除用户自定义维度
func (s *Service) DeleteUserDimension(userID uint, dimensionID uint) error {
	result := s.db.Where("id = ? AND user_id = ?", dimensionID, userID).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete dimension: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("dimension not found or not owned by user")
	}
	return nil
}

// ResetUserDimensionToDefault 重置用户的某个维度为系统默认（删除用户的自定义覆盖）
func (s *Service) ResetUserDimensionToDefault(userID uint, dimensionKey string) error {
	result := s.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to reset dimension: %w", result.Error)
	}
	fmt.Printf("[INFO] Reset dimension %s to default for user %d\n", dimensionKey, userID)
	return nil
}

// ResetAllUserDimensions 重置用户的所有维度为系统默认（删除用户的所有自定义）
func (s *Service) ResetAllUserDimensions(userID uint) error {
	result := s.db.Where("user_id = ?", userID).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to reset all dimensions: %w", result.Error)
	}
	fmt.Printf("[INFO] Reset all dimensions to default for user %d (deleted %d)\n", userID, result.RowsAffected)
	return nil
}

// CopySystemDimensionsToUser 将系统默认维度复制给用户（用于用户首次自定义）
func (s *Service) CopySystemDimensionsToUser(userID uint) ([]AnalysisDimension, error) {
	// 获取系统默认维度
	systemDimensions, err := s.GetSystemDimensions()
	if err != nil {
		return nil, err
	}

	// 复制给用户
	var userDimensions []AnalysisDimension
	for _, sd := range systemDimensions {
		ud := AnalysisDimension{
			UserID:       int64(userID),
			DimensionKey: sd.DimensionKey,
			Name:         sd.Name,
			Description:  sd.Description,
			SortOrder:    sd.SortOrder,
			IsActive:     true,
		}
		if err := s.db.Create(&ud).Error; err != nil {
			return nil, fmt.Errorf("failed to copy dimension %s: %w", sd.DimensionKey, err)
		}
		userDimensions = append(userDimensions, ud)
	}

	fmt.Printf("[INFO] Copied %d system dimensions to user %d\n", len(userDimensions), userID)
	return userDimensions, nil
}

// UpdateSystemDimension 更新系统默认维度（管理员接口）
func (s *Service) UpdateSystemDimension(dimensionID uint, name, description string, sortOrder int, isActive bool) (*AnalysisDimension, error) {
	var dimension AnalysisDimension
	// 只能更新系统默认维度（user_id = -1）
	if err := s.db.Where("id = ? AND user_id = -1", dimensionID).First(&dimension).Error; err != nil {
		return nil, fmt.Errorf("system dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder
	dimension.IsActive = isActive

	if err := s.db.Save(&dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	fmt.Printf("[INFO] Updated system dimension: %s (ID: %d)\n", dimension.DimensionKey, dimension.ID)
	return &dimension, nil
}

// StreamTranslateToChinese 流式翻译文本为中文
// 使用low级别模型进行翻译，通过SSE流式输出翻译结果
// 使用结构化XML标签约束输入输出格式
func (s *Service) StreamTranslateToChinese(text string, writer io.Writer) error {
	if text == "" {
		return fmt.Errorf("text is required for translation")
	}

	// 限制文本长度，避免过长的请求
	if len(text) > 10000 {
		return fmt.Errorf("text exceeds 10000 characters limit")
	}

	// 构建翻译提示词，使用结构化标签约束输入输出
	translatePrompt := fmt.Sprintf(`<translate_input>
%s
</translate_input>

你是一位专业的学术翻译专家。请将上述<translate_input>标签中的英文学术文本翻译成流畅、准确的中文。

翻译要求：
1. 保持学术术语的准确性和专业性
2. 确保译文通顺自然，符合中文学术表达习惯
3. 专有名词可保留英文原文或采用通用中文译法
4. 只输出翻译结果，不要添加任何解释、注释或XML标签

请直接输出翻译后的中文内容：`, text)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	// 使用low级别模型进行流式翻译
	return s.StreamChatCompletionWithLevel(messages, writer, thirdparty.ModelLevelLow)
}

// StreamTranslatePaperToChinese 流式翻译论文（标题+摘要+TLDR）为中文
// 使用low级别模型进行翻译，通过SSE流式输出翻译结果
// 使用结构化XML标签约束输入输出格式，一次性翻译三个字段
func (s *Service) StreamTranslatePaperToChinese(title, abstract, tldr string, writer io.Writer) error {
	// 至少需要一个字段有内容
	if title == "" && abstract == "" && tldr == "" {
		return fmt.Errorf("at least one of title, abstract, or tldr is required")
	}

	// 限制总文本长度，避免过长的请求
	totalLen := len(title) + len(abstract) + len(tldr)
	if totalLen > 20000 {
		return fmt.Errorf("total text exceeds 20000 characters limit")
	}

	// 使用提示词模板渲染
	translatePrompt := prompts.RenderPaperTranslationPrompt(title, abstract, tldr)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: translatePrompt,
		},
	}

	// 使用low级别模型进行流式翻译
	return s.StreamChatCompletionWithLevel(messages, writer, thirdparty.ModelLevelLow)
}
