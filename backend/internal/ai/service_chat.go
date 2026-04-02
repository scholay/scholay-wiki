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
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/thirdparty"
)

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
			return nil, fmt.Errorf("failed to send request: %w", err)
		}
		defer resp.Body.Close()
		slog.Debug("Tool call response received", "status", resp.StatusCode)

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
		}

		// Parse response
		var result ChatCompletionResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
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
