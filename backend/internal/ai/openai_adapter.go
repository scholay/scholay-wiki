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
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/circuitbreaker"
)

// ============================================================================
// OpenAI Adapter
// 实现 LLMProvider 接口，支持 OpenAI API 及兼容的第三方服务
// ============================================================================

// OpenAIAdapter OpenAI API 适配器
type OpenAIAdapter struct {
	config     *ProviderConfig
	httpClient *http.Client
	modelInfo  *ModelInfo
}

// NewOpenAIAdapter 创建 OpenAI 适配器
func NewOpenAIAdapter(config *ProviderConfig) (LLMProvider, error) {
	if config.BaseURL == "" {
		config.BaseURL = "https://api.openai.com"
	}
	if config.Model == "" {
		config.Model = "gpt-4"
	}

	// 创建 HTTP 客户端（使用连接池）
	httpClient := &http.Client{
		Timeout: 5 * time.Minute, // 长时间超时，支持流式响应
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	adapter := &OpenAIAdapter{
		config:     config,
		httpClient: httpClient,
		modelInfo:  inferModelInfo(config.Model),
	}

	return adapter, nil
}

// inferModelInfo 根据模型名称推断模型信息
func inferModelInfo(modelName string) *ModelInfo {
	info := &ModelInfo{
		Name:          modelName,
		Provider:      "openai",
		SupportsTools: true,
		SupportsVision: false,
	}

	modelLower := strings.ToLower(modelName)

	// 根据模型名推断能力
	switch {
	case strings.Contains(modelLower, "gpt-4o"):
		info.MaxContextTokens = 128000
		info.MaxOutputTokens = 16384
		info.SupportsVision = true
	case strings.Contains(modelLower, "gpt-4-turbo"):
		info.MaxContextTokens = 128000
		info.MaxOutputTokens = 4096
		info.SupportsVision = true
	case strings.Contains(modelLower, "gpt-4-32k"):
		info.MaxContextTokens = 32768
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "gpt-4"):
		info.MaxContextTokens = 8192
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "gpt-3.5-turbo-16k"):
		info.MaxContextTokens = 16384
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "gpt-3.5"):
		info.MaxContextTokens = 4096
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "claude"):
		// 某些代理服务可能使用 Claude 模型
		info.Provider = "anthropic"
		info.MaxContextTokens = 200000
		info.MaxOutputTokens = 8192
	default:
		// 默认值
		info.MaxContextTokens = 8192
		info.MaxOutputTokens = 4096
	}

	return info
}

// Chat 基础聊天（非流式）
func (a *OpenAIAdapter) Chat(ctx context.Context, req *LLMRequest) (*LLMResponse, error) {
	return a.ChatWithTools(ctx, req, nil)
}

// StreamChat 流式聊天
func (a *OpenAIAdapter) StreamChat(ctx context.Context, req *LLMRequest) (<-chan *LLMStreamChunk, error) {
	ch := make(chan *LLMStreamChunk, 100)

	go func() {
		defer close(ch)

		// 构建请求
		openaiReq := a.buildOpenAIRequest(req, nil, true)
		
		respBody, err := a.doRequest(ctx, openaiReq)
		if err != nil {
			ch <- &LLMStreamChunk{Error: err, Done: true}
			return
		}
		defer respBody.Close()

		// 解析流式响应
		a.parseStreamResponse(respBody, ch)
	}()

	return ch, nil
}

// ChatWithTools 带工具的聊天
func (a *OpenAIAdapter) ChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool) (*LLMResponse, error) {
	// 构建请求
	openaiReq := a.buildOpenAIRequest(req, tools, false)

	respBody, err := a.doRequest(ctx, openaiReq)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	// 解析响应
	return a.parseResponse(respBody)
}

// StreamChatWithTools 带工具的流式聊天
func (a *OpenAIAdapter) StreamChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool, writer io.Writer) (*LLMResponse, error) {
	// 构建请求
	openaiReq := a.buildOpenAIRequest(req, tools, true)

	respBody, err := a.doRequest(ctx, openaiReq)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	// 解析流式响应并同时收集完整内容
	return a.parseStreamResponseWithWriter(respBody, writer)
}

// GetModelInfo 获取模型信息
func (a *OpenAIAdapter) GetModelInfo() *ModelInfo {
	return a.modelInfo
}

// GetProviderName 获取提供商名称
func (a *OpenAIAdapter) GetProviderName() string {
	return "openai"
}

// SupportsStreaming 是否支持流式输出
func (a *OpenAIAdapter) SupportsStreaming() bool {
	return true
}

// SupportsTools 是否支持工具调用
func (a *OpenAIAdapter) SupportsTools() bool {
	return a.modelInfo.SupportsTools
}

// ============================================================================
// 内部方法
// ============================================================================

// openAIRequest OpenAI API 请求格式
type openAIRequest struct {
	Model            string                   `json:"model"`
	Messages         []map[string]any `json:"messages"`
	Temperature      float64                  `json:"temperature,omitempty"`
	MaxTokens        int                      `json:"max_tokens,omitempty"`
	TopP             float64                  `json:"top_p,omitempty"`
	Stop             []string                 `json:"stop,omitempty"`
	PresencePenalty  float64                  `json:"presence_penalty,omitempty"`
	FrequencyPenalty float64                  `json:"frequency_penalty,omitempty"`
	Stream           bool                     `json:"stream"`
	Tools            []LLMTool                `json:"tools,omitempty"`
	ToolChoice       any              `json:"tool_choice,omitempty"`
}

// buildOpenAIRequest 构建 OpenAI API 请求
func (a *OpenAIAdapter) buildOpenAIRequest(req *LLMRequest, tools []LLMTool, stream bool) *openAIRequest {
	// 转换消息格式
	messages := make([]map[string]any, len(req.Messages))
	for i, msg := range req.Messages {
		msgMap := map[string]any{
			"role":    msg.Role,
			"content": msg.Content,
		}
		
		// 处理工具消息
		if msg.Role == "tool" {
			msgMap["tool_call_id"] = msg.ToolCallID
			if msg.Name != "" {
				msgMap["name"] = msg.Name
			}
		}
		
		// 处理带工具调用的助手消息
		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			toolCalls := make([]map[string]any, len(msg.ToolCalls))
			for j, tc := range msg.ToolCalls {
				toolCalls[j] = map[string]any{
					"id":   tc.ID,
					"type": tc.Type,
					"function": map[string]any{
						"name":      tc.Function.Name,
						"arguments": tc.Function.Arguments,
					},
				}
			}
			msgMap["tool_calls"] = toolCalls
		}
		
		messages[i] = msgMap
	}

	openaiReq := &openAIRequest{
		Model:       a.config.Model,
		Messages:    messages,
		Stream:      stream,
		Temperature: req.Temperature,
	}

	// 设置默认温度
	if openaiReq.Temperature == 0 {
		openaiReq.Temperature = 0.7
	}

	// 设置 max_tokens
	if req.MaxTokens > 0 {
		openaiReq.MaxTokens = req.MaxTokens
	} else {
		openaiReq.MaxTokens = a.modelInfo.MaxOutputTokens
	}

	// 设置可选参数
	if req.TopP > 0 {
		openaiReq.TopP = req.TopP
	}
	if len(req.StopSequences) > 0 {
		openaiReq.Stop = req.StopSequences
	}
	if req.PresencePenalty != 0 {
		openaiReq.PresencePenalty = req.PresencePenalty
	}
	if req.FrequencyPenalty != 0 {
		openaiReq.FrequencyPenalty = req.FrequencyPenalty
	}

	// 设置工具
	if len(tools) > 0 {
		openaiReq.Tools = tools
		if req.ToolChoice != "" {
			openaiReq.ToolChoice = req.ToolChoice
		} else {
			openaiReq.ToolChoice = "auto"
		}
	}

	return openaiReq
}

// doRequest 发送 HTTP 请求
func (a *OpenAIAdapter) doRequest(ctx context.Context, req *openAIRequest) (io.ReadCloser, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := strings.TrimSuffix(a.config.BaseURL, "/") + "/v1/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.config.APIKey)

	// 添加可选头
	if a.config.Organization != "" {
		httpReq.Header.Set("OpenAI-Organization", a.config.Organization)
	}
	for key, value := range a.config.Headers {
		httpReq.Header.Set(key, value)
	}

	// 使用熔断器执行请求
	result, err := circuitbreaker.AIServiceBreaker.Execute(func() (any, error) {
		resp, err := a.httpClient.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("request failed: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
		}

		return resp.Body, nil
	})

	if err != nil {
		return nil, err
	}

	return result.(io.ReadCloser), nil
}

// parseResponse 解析非流式响应
func (a *OpenAIAdapter) parseResponse(body io.ReadCloser) (*LLMResponse, error) {
	var resp ChatCompletionResponse
	if err := json.NewDecoder(body).Decode(&resp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	choice := resp.Choices[0]

	// 转换工具调用
	var toolCalls []LLMToolCall
	if len(choice.Message.ToolCalls) > 0 {
		toolCalls = make([]LLMToolCall, len(choice.Message.ToolCalls))
		for i, tc := range choice.Message.ToolCalls {
			toolCalls[i] = LLMToolCall{
				ID:   tc.ID,
				Type: tc.Type,
			}
			toolCalls[i].Function.Name = tc.Function.Name
			toolCalls[i].Function.Arguments = tc.Function.Arguments
		}
	}

	return &LLMResponse{
		Content:      choice.Message.Content,
		ToolCalls:    toolCalls,
		FinishReason: choice.FinishReason,
		Model:        resp.Model,
		Created:      resp.Created,
		Usage: &LLMUsage{
			PromptTokens:     resp.Usage.PromptTokens,
			CompletionTokens: resp.Usage.CompletionTokens,
			TotalTokens:      resp.Usage.TotalTokens,
		},
	}, nil
}

// parseStreamResponse 解析流式响应到 channel
func (a *OpenAIAdapter) parseStreamResponse(body io.ReadCloser, ch chan<- *LLMStreamChunk) {
	scanner := bufio.NewScanner(body)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			ch <- &LLMStreamChunk{Done: true}
			return
		}

		var chunk ChatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) > 0 {
			choice := chunk.Choices[0]
			streamChunk := &LLMStreamChunk{
				Delta:        choice.Delta.Content,
				FinishReason: choice.FinishReason,
				Done:         choice.FinishReason != "",
			}

			// 处理工具调用
			if len(choice.Delta.ToolCalls) > 0 {
				tc := choice.Delta.ToolCalls[0]
				streamChunk.ToolCallDelta = &LLMToolCallDelta{
					Index:     tc.Index,
					ID:        tc.ID,
					Name:      tc.Function.Name,
					Arguments: tc.Function.Arguments,
				}
			}

			ch <- streamChunk
		}
	}

	if err := scanner.Err(); err != nil {
		ch <- &LLMStreamChunk{Error: err, Done: true}
	}
}

// parseStreamResponseWithWriter 解析流式响应并写入 writer
func (a *OpenAIAdapter) parseStreamResponseWithWriter(body io.ReadCloser, writer io.Writer) (*LLMResponse, error) {
	scanner := bufio.NewScanner(body)
	const maxScannerBuffer = 1024 * 1024 // 1MB
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	var fullContent strings.Builder
	var toolCalls []LLMToolCall
	toolCallsMap := make(map[int]*LLMToolCall) // 用于累积工具调用参数
	var finishReason string

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk ChatCompletionChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) > 0 {
			choice := chunk.Choices[0]

			// 收集内容
			if choice.Delta.Content != "" {
				fullContent.WriteString(choice.Delta.Content)

				// 转发到 writer（SSE 格式）
				chunkJSON, _ := json.Marshal(chunk)
				fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON))
				if flusher, ok := writer.(http.Flusher); ok {
					flusher.Flush()
				}
			}

			// 收集工具调用
			if len(choice.Delta.ToolCalls) > 0 {
				for _, tc := range choice.Delta.ToolCalls {
					idx := tc.Index
					if toolCallsMap[idx] == nil {
						toolCallsMap[idx] = &LLMToolCall{
							ID:   tc.ID,
							Type: tc.Type,
						}
						toolCallsMap[idx].Function.Name = tc.Function.Name
					}
					// 累积参数
					toolCallsMap[idx].Function.Arguments += tc.Function.Arguments
				}
			}

			if choice.FinishReason != "" {
				finishReason = choice.FinishReason
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stream: %w", err)
	}

	// 转换工具调用
	for i := 0; i < len(toolCallsMap); i++ {
		if tc := toolCallsMap[i]; tc != nil {
			toolCalls = append(toolCalls, *tc)
		}
	}

	return &LLMResponse{
		Content:      fullContent.String(),
		ToolCalls:    toolCalls,
		FinishReason: finishReason,
		Model:        a.config.Model,
	}, nil
}
