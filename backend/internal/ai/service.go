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
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai/prompts"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/thirdparty"
)

// MCPToolDef is a protocol-agnostic tool definition used to decouple the ai
// package from the mcp package.  Callers convert MCP-specific types to this
// DTO before passing them to ConvertMCPToolsToOpenAIFormat.
type MCPToolDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
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
	
	// 3. 缓存未命中，调用AI翻译
	// 优先从数据库读取提示词模版，本地兜底
	var translatePrompt string
	
	// 尝试从数据库获取提示词模版
	renderedPrompt, template, err := s.GetAndRenderPrompt("search_term_translation", map[string]string{
		"query": query,
	})
	
	if err != nil || template == nil {
		// 数据库获取失败，使用本地兜底提示词
		slog.Warn("Failed to get prompt template from DB, using fallback", "err", err)
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
		slog.Info("Using prompt template from DB", "name", template.Name, "id", template.ID)
	}

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
	go func() {
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
	go func() {
		cacheResult := suggestionsCacheResult{
			Cached:      true,
			Suggestions: suggestions,
		}
		if err := suggestionsCache.Set(context.Background(), cacheKey, cacheResult); err != nil {
			slog.Warn("Failed to cache suggestions", "err", err)
		} else {
			slog.Debug("Suggestions cached", "query", query, "suggestions", suggestions)
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
func (s *Service) ChatCompletionWithTools(ctx context.Context, messages []ChatMessage, tools []Tool, toolChoice string, modelLevel thirdparty.ModelLevel) (*ChatCompletionResponse, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		convertedMessages := ConvertMessagesForModel(messages, modelCode)

		reqBody := ChatCompletionRequest{
			Model:       modelCode,
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

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetLongRunningHTTPClient()

		return circuitbreaker.AIServiceBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			var result ChatCompletionResponse
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			return &result, nil
		})
	})
	if err != nil {
		return nil, err
	}
	return result.(*ChatCompletionResponse), nil
}

// ToolExecutor is a callback function type for executing tool calls
// It receives the tool calls from AI and returns the results
type ToolExecutor func(toolCalls []ToolCall) ([]ToolResult, error)

// StreamChatCompletionWithToolLoop performs a complete tool call loop:
// 1. First phase: Send request with tools, get tool call decisions (non-streaming)
// 2. Execute tools via callback, inject results into context
// 3. Second phase: Continue requesting AI, stream the final analysis
//
// This method enables a single logical conversation that includes both tool execution and analysis,
// improving context coherence and reducing latency compared to separate calls.
func (s *Service) StreamChatCompletionWithToolLoop(
	ctx context.Context,
	messages []ChatMessage,
	tools []Tool,
	toolExecutor ToolExecutor,
	writer io.Writer,
	modelLevel thirdparty.ModelLevel,
) (string, error) {
	slog.Debug("ToolLoop starting", "messages", len(messages), "tools", len(tools), "modelLevel", modelLevel)

	// Phase 1: Call AI with tools to get tool call decisions (non-streaming)
	slog.Debug("ToolLoop phase 1: getting tool call decisions")
	toolCallResponse, err := s.ChatCompletionWithTools(ctx, messages, tools, "auto", modelLevel)
	if err != nil {
		slog.Error("ToolLoop error getting tool call decisions", "err", err)
		return "", fmt.Errorf("failed to get tool call decisions: %w", err)
	}

	// Check if AI returned tool calls
	if toolCallResponse == nil || len(toolCallResponse.Choices) == 0 {
		return "", fmt.Errorf("no response from AI for tool call phase")
	}

	choice := toolCallResponse.Choices[0]
	
	// If no tool calls, AI responded directly - stream the content
	if len(choice.Message.ToolCalls) == 0 {
		slog.Debug("ToolLoop no tool calls, AI responded directly")
		if choice.Message.Content != "" {
			// Stream the direct response
			chunk := ChatCompletionChunk{
				Choices: []struct {
					Index int `json:"index"`
					Delta struct {
						Role      string     `json:"role,omitempty"`
						Content   string     `json:"content,omitempty"`
						ToolCalls []ToolCall `json:"tool_calls,omitempty"`
					} `json:"delta"`
					FinishReason string `json:"finish_reason,omitempty"`
				}{
					{
						Index: 0,
						Delta: struct {
							Role      string     `json:"role,omitempty"`
							Content   string     `json:"content,omitempty"`
							ToolCalls []ToolCall `json:"tool_calls,omitempty"`
						}{
							Content: choice.Message.Content,
						},
					},
				},
			}
			chunkJSON, _ := json.Marshal(chunk)
			fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON))
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
		}
		return choice.Message.Content, nil
	}

	slog.Debug("ToolLoop AI requested tool calls", "count", len(choice.Message.ToolCalls))
	for i, tc := range choice.Message.ToolCalls {
		slog.Debug("ToolLoop tool call", "index", i+1, "name", tc.Function.Name, "id", tc.ID)
	}

	// Phase 2: Execute tools via callback
	slog.Debug("ToolLoop phase 2: executing tools")
	toolResults, err := toolExecutor(choice.Message.ToolCalls)
	if err != nil {
		slog.Error("ToolLoop error executing tools", "err", err)
		return "", fmt.Errorf("failed to execute tools: %w", err)
	}

	slog.Debug("ToolLoop tools executed", "results", len(toolResults))

	// Phase 3: Build new messages with tool results
	// Add the assistant message with tool calls
	assistantMsg := map[string]any{
		"role":       "assistant",
		"content":    choice.Message.Content, // Can be empty
		"tool_calls": choice.Message.ToolCalls,
	}

	// Convert to interface for message building
	newMessages := make([]any, 0, len(messages)+1+len(toolResults))
	for _, msg := range messages {
		newMessages = append(newMessages, msg)
	}
	newMessages = append(newMessages, assistantMsg)

	// Add tool results as tool messages
	for _, result := range toolResults {
		toolMsg := map[string]any{
			"role":         "tool",
			"content":      result.Content,
			"tool_call_id": result.ToolCallID,
		}
		newMessages = append(newMessages, toolMsg)
	}

	slog.Debug("ToolLoop built messages for streaming phase", "count", len(newMessages))

	// Phase 4: Stream the final analysis
	slog.Debug("ToolLoop phase 3: streaming final analysis")
	fullContent, err := s.streamChatCompletionWithRawMessages(ctx, newMessages, writer, modelLevel)
	if err != nil {
		slog.Error("ToolLoop error streaming analysis", "err", err)
		return "", fmt.Errorf("failed to stream analysis: %w", err)
	}

	slog.Debug("ToolLoop completed", "contentLength", len(fullContent))
	return fullContent, nil
}

// streamChatCompletionWithRawMessages streams chat completion with raw any messages
// This is needed to support tool messages which have a different structure
func (s *Service) streamChatCompletionWithRawMessages(ctx context.Context, messages []any, writer io.Writer, modelLevel thirdparty.ModelLevel) (string, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		reqBody := map[string]any{
			"model":       modelCode,
			"messages":    messages,
			"stream":      true,
			"temperature": 0.7,
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetStreamingHTTPClient()

		return circuitbreaker.AIServiceStreamBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}
			return s.streamResponseAndCollect(resp.Body, writer)
		})
	})
	if err != nil {
		return "", err
	}
	return result.(string), nil
}

// ChatCompletionWithModel sends a chat completion request with a specific model (non-streaming)
// This method directly uses the provided baseURL, apiKey and modelName without account selection
func (s *Service) ChatCompletionWithModel(ctx context.Context, messages []ChatMessage, tools []Tool, toolChoice string, baseURL, apiKey, modelName string) (*ChatCompletionResponse, error) {
	slog.Debug("ChatCompletionWithModel called", "messages", len(messages), "tools", len(tools), "model", modelName)

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

	slog.Debug("Tool call request body", "bodyPreview", string(jsonData[:min(500, len(jsonData))]))
	if len(tools) > 0 {
		slog.Debug("First tool info", "name", tools[0].Function.Name, "description", tools[0].Function.Description)
	}

	// Create HTTP request
	url := strings.TrimSuffix(baseURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Send request using long-running HTTP client
	client := GetLongRunningHTTPClient()

	slog.Debug("Sending tool call request", "url", url, "model", modelName)

	// Execute with circuit breaker protection
	resultInterface, err := circuitbreaker.AIServiceBreaker.Execute(func() (any, error) {
		resp, err := client.Do(req)
		if err != nil {
			slog.Error("Tool call request failed", "err", err)
			return nil, fmt.Errorf("failed to send request: %w", err)
		}
		defer resp.Body.Close()
		slog.Debug("Tool call response received", "status", resp.StatusCode)

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			slog.Error("Tool call API error", "status", resp.StatusCode, "body", string(body))
			return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
		}

		// Parse response
		var result ChatCompletionResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			slog.Error("Failed to decode tool call response", "err", err)
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		slog.Debug("Tool call completed successfully", "choices", len(result.Choices))
		if len(result.Choices) > 0 {
			slog.Debug("First choice info", "toolCalls", len(result.Choices[0].Message.ToolCalls))
			if result.Choices[0].Message.Content != "" {
				contentPreview := result.Choices[0].Message.Content
				if len(contentPreview) > 200 {
					contentPreview = contentPreview[:200]
				}
				slog.Debug("AI response content (no tool call)", "content", contentPreview)
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
func (s *Service) StreamChatCompletionWithLevel(ctx context.Context, messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) error {
	_, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
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
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetStreamingHTTPClient()

		return circuitbreaker.AIServiceStreamBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}
			return nil, s.streamResponse(resp.Body, writer)
		})
	})
	return err
}

// StreamChatCompletion sends a streaming chat completion request
// Uses mid-level model by default, includes automatic retry logic with account switching
func (s *Service) StreamChatCompletion(ctx context.Context, messages []ChatMessage, writer io.Writer) error {
	// Use mid-level model by default for general streaming
	return s.StreamChatCompletionWithLevel(ctx, messages, writer, thirdparty.ModelLevelMid)
}

// StreamChatCompletionAndCollectWithLevel streams chat completion with specific model level and collects full content
func (s *Service) StreamChatCompletionAndCollectWithLevel(ctx context.Context, messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) (string, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
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
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetStreamingHTTPClient()

		return circuitbreaker.AIServiceStreamBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}
			return s.streamResponseAndCollect(resp.Body, writer)
		})
	})
	if err != nil {
		return "", err
	}
	return result.(string), nil
}

// StreamChatCompletionAndCollect streams chat completion and collects full content
// Uses mid-level model by default, includes automatic retry logic with account switching
func (s *Service) StreamChatCompletionAndCollect(ctx context.Context, messages []ChatMessage, writer io.Writer) (string, error) {
	// Use mid-level model by default for general streaming with collection
	return s.StreamChatCompletionAndCollectWithLevel(ctx, messages, writer, thirdparty.ModelLevelMid)
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
			slog.Warn("Failed to parse chunk", "err", err)
			continue
		}

		// Extract content and forward the entire chunk as JSON
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			// Marshal the chunk back to JSON
			chunkJSON, err := json.Marshal(chunk)
			if err != nil {
				slog.Warn("Failed to marshal chunk", "err", err)
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
			slog.Warn("Failed to parse chunk", "err", err)
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
				slog.Warn("Failed to marshal chunk", "err", err)
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

// ConvertMCPToolsToOpenAIFormat converts protocol-agnostic tool definitions
// to OpenAI function calling format.
func ConvertMCPToolsToOpenAIFormat(mcpTools []MCPToolDef) []Tool {
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
func FormatPapersForPrompt(papers []map[string]any) string {
	return FormatPapersForPromptWithLimit(papers, 20, 300)
}

// FormatPapersForPromptWithLimit formats papers with custom limits
func FormatPapersForPromptWithLimit(papers []map[string]any, maxPapers int, maxAbstractLen int) string {
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
		if authors, ok := paper["authors"].([]any); ok && len(authors) > 0 {
			builder.WriteString("**作者**: ")
			authorNames := make([]string, 0, len(authors))
			maxAuthors := 3
			for j, author := range authors {
				if j >= maxAuthors {
					authorNames = append(authorNames, "等")
					break
				}
				if authorMap, ok := author.(map[string]any); ok {
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
func (s *Service) AnalyzePaperAbstract(ctx context.Context, paperId string, paperTitle string, abstract string, userID *uint) (*PaperAnalysisResult, *AnalysisContext, error) {
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
			slog.Info("Found cached analysis for paper", "paperId", paperId, "dimensionHash", dimensionHash)
			analysisCtx.FromCache = true
			return s.convertCachedAnalysisToResult(cachedAnalysis, dimensions), analysisCtx, nil
		}
		slog.Info("No cached analysis found, calling AI", "paperId", paperId, "dimensionHash", dimensionHash)
	}

	// 3. 首先尝试一次性分析所有维度（带重试）
	resultMap, parseSuccess := s.analyzeWithRetry(ctx, paperTitle, abstract, dimensions, paperId)
	
	// 4. 如果一次性分析失败，尝试分批请求
	if !parseSuccess {
		slog.Info("Full analysis failed, trying batch analysis", "paperId", paperId)
		resultMap, parseSuccess = s.analyzeInBatches(ctx, paperTitle, abstract, dimensions, paperId)
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
			slog.Warn("Failed to save paper analysis to database", "err", err)
		} else {
			slog.Info("Saved paper analysis to database", "paperId", paperId, "dimensionHash", dimensionHash)
		}
	} else if !parseSuccess {
		slog.Warn("Analysis failed for paper, not saving to database", "paperId", paperId)
	}

	// 6. 转换为 PaperAnalysisResult 返回
	result := s.convertMapToResult(resultMap, dimensions)
	return result, analysisCtx, nil
}

// analyzeWithRetry retries parsing the AI response as structured JSON.
// Unlike executeWithRetry (which rotates API accounts on HTTP-level failures),
// this retries within a single successful API response: it re-prompts the LLM
// when the returned text is not valid JSON, up to maxRetries attempts.
func (s *Service) analyzeWithRetry(ctx context.Context, paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
	prompt := s.buildAnalysisPrompt(paperTitle, abstract, dimensions)
	messages := []ChatMessage{
		{
			Role:    "user",
			Content: prompt,
		},
	}

	for attempt := 1; attempt <= AnalysisMaxRetries; attempt++ {
		if attempt > 1 {
			slog.Info("Analysis retry", "attempt", attempt, "maxRetries", AnalysisMaxRetries, "paperId", paperId)
		}
		
		response, err := s.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
		if err != nil {
			slog.Error("AI analysis failed", "attempt", attempt, "err", err)
			continue
		}

		if len(response.Choices) == 0 {
			slog.Error("No response from AI", "attempt", attempt)
			continue
		}

		content := strings.TrimSpace(response.Choices[0].Message.Content)
		content = s.extractJSONFromContent(content)

		resultMap := make(map[string]string)
		if err := json.Unmarshal([]byte(content), &resultMap); err != nil {
			slog.Warn("Failed to parse AI response as JSON", "attempt", attempt, "err", err)
			slog.Debug("Raw content info", "length", len(content))
			if len(content) > 0 {
				slog.Debug("Raw content preview", "content", content[:min(2000, len(content))])
			}
			continue
		}

		// 解析成功
		if attempt > 1 {
			slog.Info("Analysis retry succeeded", "attempt", attempt, "paperId", paperId)
		}
		return resultMap, true
	}

	slog.Error("All analysis attempts failed", "maxRetries", AnalysisMaxRetries, "paperId", paperId)
	return nil, false
}

// analyzeInBatches 分批分析维度，每批最多4个维度
func (s *Service) analyzeInBatches(ctx context.Context, paperTitle, abstract string, dimensions []AnalysisDimension, paperId string) (map[string]string, bool) {
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
		
		slog.Info("Batch analysis processing", "batch", batchNum, "totalBatches", totalBatches, "dimensions", len(batchDimensions), "paperId", paperId)
		
		// 对每个批次进行分析（带重试）
		batchResult, success := s.analyzeWithRetry(ctx, paperTitle, abstract, batchDimensions, paperId)
		
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
			slog.Warn("Batch analysis failed", "batch", batchNum, "paperId", paperId)
		}
	}
	
	if allSuccess {
		slog.Info("Batch analysis all completed successfully", "paperId", paperId)
	} else {
		slog.Warn("Batch analysis some batches failed", "paperId", paperId)
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

// checkPaperAnalysisCache 检查论文分析缓存是否存在
// 用于批量分析时预判断是否需要扣费
func (s *Service) checkPaperAnalysisCache(paperId, dimensionHash string) bool {
	if paperId == "" {
		return false
	}
	var count int64
	s.db.Model(&PaperAnalysis{}).Where("paper_id = ? AND dimension_hash = ?", paperId, dimensionHash).Count(&count)
	return count > 0
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
		slog.Warn("Failed to get prompt template from DB, using fallback", "key", "dimensions_paper_analysis", "err", err)
		return s.buildAnalysisPromptFallback(paperTitle, abstract, dimensionList, jsonFormat)
	}
	
	slog.Info("Using prompt template from DB", "name", template.Name, "id", template.ID)
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
func (s *Service) ChatCompletionWithLevel(ctx context.Context, messages []ChatMessage, modelLevel thirdparty.ModelLevel) (string, error) {
	result, err := s.executeWithRetry(ctx, modelLevel, func(config *thirdparty.AIModelConfig, _ uint) (any, error) {
		modelCode := config.ModelLow
		if modelCode == "" {
			modelCode = "gpt-3.5-turbo"
		}

		reqBody := ChatCompletionRequest{
			Model:       modelCode,
			Messages:    messages,
			Stream:      false,
			Temperature: 0.7,
		}

		jsonData, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		client := GetLongRunningHTTPClient()

		return circuitbreaker.AIServiceBreaker.Execute(func() (any, error) {
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("failed to send request: %w", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
			}

			var response ChatCompletionResponse
			if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
				return nil, fmt.Errorf("failed to decode response: %w", err)
			}
			if len(response.Choices) == 0 {
				return nil, fmt.Errorf("no response choices returned")
			}
			return response.Choices[0].Message.Content, nil
		})
	})
	if err != nil {
		return "", err
	}
	return result.(string), nil
}

