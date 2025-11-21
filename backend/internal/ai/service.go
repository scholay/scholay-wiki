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
	// 构建翻译提示词（硬编码）
	translatePrompt := fmt.Sprintf(`你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 只返回翻译后的英文，不要有任何额外说明
2. 保持学术专业性
3. 如果原文已经是英文，直接返回原文
4. 如果是混合语言，只翻译非英文部分

查询：%s

翻译：`, query)

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
