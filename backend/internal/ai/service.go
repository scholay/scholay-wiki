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
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

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

// TranslateToEnglish 将查询翻译成英文学术术语（实现 QueryTranslator 接口）
// 使用Redis缓存避免重复翻译，缓存时间12小时
func (s *Service) TranslateToEnglish(query string) (string, error) {
	ctx := context.Background()
	
	// 1. 生成缓存key（使用MD5避免特殊字符）
	cacheKey := generateTranslationCacheKey(query)
	
	// 2. 尝试从Redis缓存获取
	var cachedTranslation string
	translationCache := cache.NewQueryCache("translation", 12*time.Hour)
	err := translationCache.Get(ctx, cacheKey, &cachedTranslation)
	if err == nil && cachedTranslation != "" {
		fmt.Printf("[Translation Cache] Hit for query: '%s' -> '%s'\n", query, cachedTranslation)
		return cachedTranslation, nil
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
1. 只返回翻译后的英文，不要有任何额外说明
2. 保持学术专业性
3. 如果原文已经是英文，直接返回原文
4. 如果是混合语言，只翻译非英文部分

查询：%s

翻译：`, query)
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
	go func() {
		if err := translationCache.Set(context.Background(), cacheKey, translatedText); err != nil {
			fmt.Printf("[Translation Cache] Failed to cache translation: %v\n", err)
		} else {
			fmt.Printf("[Translation Cache] Cached: '%s' -> '%s'\n", query, translatedText)
		}
	}()

	return translatedText, nil
}

// generateTranslationCacheKey 生成翻译缓存的key
// 使用MD5哈希避免特殊字符和长度问题
func generateTranslationCacheKey(query string) string {
	hash := md5.Sum([]byte(strings.TrimSpace(strings.ToLower(query))))
	return hex.EncodeToString(hash[:])
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
func (s *Service) ChatCompletionWithTools(messages []ChatMessage, tools []Tool, toolChoice string, modelLevel thirdparty.ModelLevel) (*ChatCompletionResponse, error) {
	fmt.Printf("[DEBUG] ChatCompletionWithTools called, messages: %d, tools: %d, modelLevel: %s\n", len(messages), len(tools), modelLevel)

	// Get AI model config by level
	config, _, err := s.accountService.GetRandomAIModelConfigByLevel(modelLevel)
	if err != nil {
		fmt.Printf("[ERROR] Failed to get AI config: %v\n", err)
		return nil, fmt.Errorf("no AI model account configured for level %s: %w", modelLevel, err)
	}
	fmt.Printf("[DEBUG] Got AI config, BaseURL: %s, ModelLow: %s\n", config.BaseURL, config.ModelLow)

	// ModelLow field contains the actual model code for the requested level
	modelCode := config.ModelLow
	if modelCode == "" {
		modelCode = "gpt-3.5-turbo" // Final fallback
	}

	// Prepare request
	reqBody := ChatCompletionRequest{
		Model:       modelCode,
		Messages:    messages,
		Tools:       tools,
		ToolChoice:  toolChoice,
		Stream:      false,
		Temperature: 0.7,
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
	url := strings.TrimSuffix(config.BaseURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+config.APIKey)

	// Send request using shared HTTP client for connection pooling with circuit breaker protection
	client := GetHTTPClient()

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
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return resultInterface.(*ChatCompletionResponse), nil
}

// StreamChatCompletionWithLevel sends a streaming chat completion request with a specific model level
func (s *Service) StreamChatCompletionWithLevel(messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) error {
	// Get AI model config by level
	config, _, err := s.accountService.GetRandomAIModelConfigByLevel(modelLevel)
	if err != nil {
		return fmt.Errorf("no AI model account configured for level %s: %w", modelLevel, err)
	}

	// Prepare request - ModelLow field contains the actual model code for this level
	reqBody := ChatCompletionRequest{
		Model:       config.ModelLow, // This now contains the model code for the requested level
		Messages:    messages,
		Stream:      true,
		Temperature: 0.7,
	}

	// Set default model if not configured
	if reqBody.Model == "" {
		reqBody.Model = "gpt-3.5-turbo"
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

	// Send request using shared HTTP client for connection pooling with circuit breaker protection
	client := GetHTTPClient()

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
		if circuitbreaker.IsCircuitBreakerError(err) {
			return fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return err
	}

	return nil
}

// StreamChatCompletion sends a streaming chat completion request
func (s *Service) StreamChatCompletion(messages []ChatMessage, writer io.Writer) error {
	// Get AI model config
	apiKey, _, err := s.accountService.GetRandomAPIKey(thirdparty.AccountTypeAIModel)
	if err != nil {
		return fmt.Errorf("no AI model account configured: %w", err)
	}

	// Get AI model config details
	accounts, err := s.accountService.GetActiveAccountsByType(thirdparty.AccountTypeAIModel)
	if err != nil || len(accounts) == 0 {
		return fmt.Errorf("no active AI model account found")
	}

	config, err := accounts[0].GetAIModelConfig()
	if err != nil {
		return fmt.Errorf("failed to parse AI model config: %w", err)
	}

	// Select model code: prefer ModelMid for general streaming, fallback to any available model
	modelCode := config.ModelMid
	if modelCode == "" {
		modelCode = config.ModelLow
	}
	if modelCode == "" {
		modelCode = config.ModelHigh
	}
	if modelCode == "" {
		modelCode = "gpt-3.5-turbo" // Final fallback
	}

	// Prepare request
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
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Send request using shared HTTP client for connection pooling with circuit breaker protection
	client := GetHTTPClient()

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
		if circuitbreaker.IsCircuitBreakerError(err) {
			return fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return err
	}

	return nil
}

// StreamChatCompletionAndCollectWithLevel streams chat completion with specific model level and collects full content
func (s *Service) StreamChatCompletionAndCollectWithLevel(messages []ChatMessage, writer io.Writer, modelLevel thirdparty.ModelLevel) (string, error) {
	fmt.Printf("[DEBUG] StreamChatCompletionAndCollectWithLevel called, modelLevel: %s, messages count: %d\n", modelLevel, len(messages))

	// Get AI model config by level
	fmt.Printf("[DEBUG] Getting AI model config for level: %s\n", modelLevel)
	config, _, err := s.accountService.GetRandomAIModelConfigByLevel(modelLevel)
	if err != nil {
		fmt.Printf("[ERROR] Failed to get AI model config: %v\n", err)
		return "", fmt.Errorf("no AI model account configured for level %s: %w", modelLevel, err)
	}
	fmt.Printf("[DEBUG] Got AI model config, BaseURL: %s, ModelLow: %s\n", config.BaseURL, config.ModelLow)

	// Create request - ModelLow field contains the actual model code for this level
	reqBody := ChatCompletionRequest{
		Model:       config.ModelLow, // This now contains the model code for the requested level
		Messages:    messages,
		Stream:      true,
		Temperature: 0.7,
	}

	// Use default model if not specified
	if reqBody.Model == "" {
		reqBody.Model = "gpt-3.5-turbo"
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

	// Send request with circuit breaker protection
	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

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
		if circuitbreaker.IsCircuitBreakerError(err) {
			return "", fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return "", err
	}

	return resultInterface.(string), nil
}

// StreamChatCompletionAndCollect streams chat completion and collects full content
func (s *Service) StreamChatCompletionAndCollect(messages []ChatMessage, writer io.Writer) (string, error) {
	// Get AI model account
	apiKey, _, err := s.accountService.GetRandomAPIKey(thirdparty.AccountTypeAIModel)
	if err != nil {
		return "", fmt.Errorf("failed to get AI model API key: %w", err)
	}

	// Get accounts to fetch configuration
	accounts, err := s.accountService.GetActiveAccountsByType(thirdparty.AccountTypeAIModel)
	if err != nil || len(accounts) == 0 {
		return "", fmt.Errorf("no active AI model accounts found")
	}

	// Get configuration
	config, err := accounts[0].GetAIModelConfig()
	if err != nil {
		return "", fmt.Errorf("failed to parse AI model config: %w", err)
	}

	// Select model code: prefer ModelMid for general streaming with collection, fallback to any available model
	modelCode := config.ModelMid
	if modelCode == "" {
		modelCode = config.ModelLow
	}
	if modelCode == "" {
		modelCode = config.ModelHigh
	}
	if modelCode == "" {
		modelCode = "gpt-3.5-turbo" // Final fallback
	}

	// Create request
	reqBody := ChatCompletionRequest{
		Model:       modelCode,
		Messages:    messages,
		Stream:      true,
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
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Send request using shared HTTP client for connection pooling with circuit breaker protection
	client := GetHTTPClient()

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

		// Stream response and collect content
		return s.streamResponseAndCollect(resp.Body, writer)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return "", fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return "", err
	}

	return resultInterface.(string), nil
}

// streamResponse reads SSE stream and writes to output
func (s *Service) streamResponse(reader io.Reader, writer io.Writer) error {
	scanner := bufio.NewScanner(reader)

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

// AnalyzePaperAbstract 分析论文摘要，提取结构化信息
// 使用low级别模型进行分析，根据用户的分析维度动态生成提示词
// 优先从数据库缓存获取，如果没有则调用AI分析并保存结果
// userID: 用户ID，用于获取用户自定义的分析维度（nil表示使用系统默认）
func (s *Service) AnalyzePaperAbstract(paperId string, paperTitle string, abstract string, userID *uint) (*PaperAnalysisResult, error) {
	if abstract == "" {
		return nil, fmt.Errorf("abstract is required for analysis")
	}

	// 1. 获取用户的分析维度
	dimensionResult, err := s.GetAnalysisDimensions(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get analysis dimensions: %w", err)
	}

	dimensions := dimensionResult.Dimensions
	if len(dimensions) == 0 {
		return nil, fmt.Errorf("no active analysis dimensions found")
	}

	// 生成维度的哈希值，用于缓存key
	dimensionHash := s.generateDimensionHash(dimensions)

	// 2. 检查数据库缓存（需要匹配维度哈希）
	if paperId != "" {
		var cachedAnalysis PaperAnalysis
		if err := s.db.Where("paper_id = ? AND dimension_hash = ?", paperId, dimensionHash).First(&cachedAnalysis).Error; err == nil {
			// 找到匹配的缓存，直接返回
			fmt.Printf("[INFO] Found cached analysis for paper: %s (dimension_hash: %s)\n", paperId, dimensionHash)
			return s.convertCachedAnalysisToResult(cachedAnalysis, dimensions), nil
		}
		// 没找到匹配的缓存，继续调用AI分析
		fmt.Printf("[INFO] No cached analysis found for paper: %s with dimension_hash: %s, calling AI...\n", paperId, dimensionHash)
	}

	// 3. 动态构建提示词
	prompt := s.buildAnalysisPrompt(paperTitle, abstract, dimensions)

	messages := []ChatMessage{
		{
			Role:    "user",
			Content: prompt,
		},
	}

	// 使用low级别模型调用AI
	response, err := s.ChatCompletionWithTools(messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return nil, fmt.Errorf("AI analysis failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(response.Choices[0].Message.Content)
	
	// 尝试从响应中提取JSON
	// 可能包含```json ... ```标记
	if strings.Contains(content, "```json") {
		start := strings.Index(content, "```json") + 7
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	} else if strings.Contains(content, "```") {
		start := strings.Index(content, "```") + 3
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	}

	// 解析JSON响应为动态map
	var resultMap map[string]string
	if err := json.Unmarshal([]byte(content), &resultMap); err != nil {
		// 如果JSON解析失败，返回错误
		fmt.Printf("[WARN] Failed to parse AI analysis response as JSON: %v\n", err)
		fmt.Printf("[DEBUG] Raw content: %s\n", content[:min(500, len(content))])
		// 创建一个包含所有维度的失败结果
		resultMap = make(map[string]string)
		for _, dim := range dimensions {
			resultMap[dim.DimensionKey] = "解析失败"
		}
	}

	// 4. 保存分析结果到数据库（如果有paperId）
	if paperId != "" {
		// 将resultMap转为JSON存储
		analysisDataJSON, _ := json.Marshal(resultMap)
		
		paperAnalysis := PaperAnalysis{
			PaperID:       paperId,
			PaperTitle:    paperTitle,
			DimensionHash: dimensionHash,
			AnalysisData:  string(analysisDataJSON),
		}
		
		// 使用 upsert 逻辑：如果存在相同 paper_id + dimension_hash 则更新，否则创建
		if err := s.db.Where("paper_id = ? AND dimension_hash = ?", paperId, dimensionHash).
			Assign(paperAnalysis).FirstOrCreate(&paperAnalysis).Error; err != nil {
			fmt.Printf("[WARN] Failed to save paper analysis to database: %v\n", err)
		} else {
			fmt.Printf("[INFO] Saved paper analysis to database for paper: %s (dimension_hash: %s)\n", paperId, dimensionHash)
		}
	}

	// 5. 转换为 PaperAnalysisResult 返回
	result := s.convertMapToResult(resultMap, dimensions)
	return result, nil
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
func (s *Service) buildAnalysisPrompt(paperTitle, abstract string, dimensions []AnalysisDimension) string {
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
	for i, dim := range dimensions {
		sb.WriteString(fmt.Sprintf("%d. %s（%s）\n", i+1, dim.Name, dim.DimensionKey))
		sb.WriteString(fmt.Sprintf("分析指示：%s\n\n", dim.Description))
	}
	
	sb.WriteString("【输出格式】\n")
	sb.WriteString("请严格使用以下JSON格式输出，不得增删字段：\n")
	sb.WriteString("{\n")
	for i, dim := range dimensions {
		if i < len(dimensions)-1 {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\",\n", dim.DimensionKey, dim.Name))
		} else {
			sb.WriteString(fmt.Sprintf("  \"%s\": \"%s分析结果\"\n", dim.DimensionKey, dim.Name))
		}
	}
	sb.WriteString("}\n\n")
	sb.WriteString("所有维度都必须输出，即使内容全部为\"未提及\"。")
	
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
func (s *Service) ChatCompletionWithLevel(messages []ChatMessage, modelLevel thirdparty.ModelLevel) (string, error) {
	fmt.Printf("[DEBUG] ChatCompletionWithLevel called, modelLevel: %s, messages count: %d\n", modelLevel, len(messages))

	// Get AI model config by level
	config, _, err := s.accountService.GetRandomAIModelConfigByLevel(modelLevel)
	if err != nil {
		return "", fmt.Errorf("no AI model account configured for level %s: %w", modelLevel, err)
	}

	// Select model code based on level
	modelCode := config.ModelLow
	if modelLevel == thirdparty.ModelLevelMid {
		modelCode = config.ModelMid
	} else if modelLevel == thirdparty.ModelLevelHigh {
		modelCode = config.ModelHigh
	}

	// Fallback logic
	if modelCode == "" {
		modelCode = config.ModelLow
	}
	if modelCode == "" {
		modelCode = config.ModelMid
	}
	if modelCode == "" {
		modelCode = config.ModelHigh
	}
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

	// Send request using shared HTTP client with circuit breaker protection
	client := GetHTTPClient()

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
		if circuitbreaker.IsCircuitBreakerError(err) {
			return "", fmt.Errorf("AI service temporarily unavailable (circuit breaker open): %w", err)
		}
		return "", err
	}

	return resultInterface.(string), nil
}

// GetAnalysisDimensions 获取用户的分析维度
// 采用覆盖式设计：系统默认维度 + 用户自定义维度（用户自定义覆盖同dimension_key的系统默认）
// GetAnalysisDimensionsResult 返回维度列表和是否自定义的标志
type GetAnalysisDimensionsResult struct {
	Dimensions []AnalysisDimension
	IsCustom   bool // 是否包含用户自定义维度
}

func (s *Service) GetAnalysisDimensions(userID *uint) (*GetAnalysisDimensionsResult, error) {
	// 1. 获取系统默认维度
	var systemDimensions []AnalysisDimension
	err := s.db.Where("user_id IS NULL AND is_active = ?", true).
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

// GetSystemDimensions 获取系统默认维度
func (s *Service) GetSystemDimensions() ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := s.db.Where("user_id IS NULL AND is_active = ?", true).
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

// CreateUserDimension 创建或更新用户自定义维度
// 如果用户已有该dimension_key的自定义，则更新；否则创建新的
func (s *Service) CreateUserDimension(userID uint, dimensionKey, name, description string, sortOrder int) (*AnalysisDimension, error) {
	// 检查用户是否已有该dimension_key的自定义
	var existingDimension AnalysisDimension
	err := s.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).First(&existingDimension).Error
	
	if err == nil {
		// 已存在，更新
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

	// 不存在，创建新的
	dimension := &AnalysisDimension{
		UserID:       &userID,
		DimensionKey: dimensionKey,
		Name:         name,
		Description:  description,
		SortOrder:    sortOrder,
		IsActive:     true,
	}

	if err := s.db.Create(dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to create dimension: %w", err)
	}

	fmt.Printf("[INFO] Created user dimension: %s for user %d\n", dimensionKey, userID)
	return dimension, nil
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
			UserID:       &userID,
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
	// 只能更新系统默认维度（user_id IS NULL）
	if err := s.db.Where("id = ? AND user_id IS NULL", dimensionID).First(&dimension).Error; err != nil {
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
