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
// Anthropic Adapter
// 实现 LLMProvider 接口，支持 Anthropic Claude API
// ============================================================================

// AnthropicAdapter Anthropic Claude API 适配器
type AnthropicAdapter struct {
	config     *ProviderConfig
	httpClient *http.Client
	modelInfo  *ModelInfo
}

// NewAnthropicAdapter 创建 Anthropic 适配器
func NewAnthropicAdapter(config *ProviderConfig) (LLMProvider, error) {
	if config.BaseURL == "" {
		config.BaseURL = "https://api.anthropic.com"
	}
	if config.Model == "" {
		config.Model = "claude-3-opus-20240229"
	}

	// 创建 HTTP 客户端
	httpClient := &http.Client{
		Timeout: 5 * time.Minute,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	adapter := &AnthropicAdapter{
		config:     config,
		httpClient: httpClient,
		modelInfo:  inferAnthropicModelInfo(config.Model),
	}

	return adapter, nil
}

// inferAnthropicModelInfo 根据模型名称推断模型信息
func inferAnthropicModelInfo(modelName string) *ModelInfo {
	info := &ModelInfo{
		Name:          modelName,
		Provider:      "anthropic",
		SupportsTools: true,
		SupportsVision: true, // Claude 3 支持视觉
	}

	modelLower := strings.ToLower(modelName)

	switch {
	case strings.Contains(modelLower, "claude-3-5-sonnet"):
		info.MaxContextTokens = 200000
		info.MaxOutputTokens = 8192
	case strings.Contains(modelLower, "claude-3-opus"):
		info.MaxContextTokens = 200000
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "claude-3-sonnet"):
		info.MaxContextTokens = 200000
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "claude-3-haiku"):
		info.MaxContextTokens = 200000
		info.MaxOutputTokens = 4096
	case strings.Contains(modelLower, "claude-2"):
		info.MaxContextTokens = 100000
		info.MaxOutputTokens = 4096
		info.SupportsVision = false
	default:
		info.MaxContextTokens = 100000
		info.MaxOutputTokens = 4096
	}

	return info
}

// Chat 基础聊天（非流式）
func (a *AnthropicAdapter) Chat(ctx context.Context, req *LLMRequest) (*LLMResponse, error) {
	return a.ChatWithTools(ctx, req, nil)
}

// StreamChat 流式聊天
func (a *AnthropicAdapter) StreamChat(ctx context.Context, req *LLMRequest) (<-chan *LLMStreamChunk, error) {
	ch := make(chan *LLMStreamChunk, 100)

	go func() {
		defer close(ch)

		anthropicReq := a.buildAnthropicRequest(req, nil, true)
		
		respBody, err := a.doRequest(ctx, anthropicReq)
		if err != nil {
			ch <- &LLMStreamChunk{Error: err, Done: true}
			return
		}
		defer respBody.Close()

		a.parseStreamResponse(respBody, ch)
	}()

	return ch, nil
}

// ChatWithTools 带工具的聊天
func (a *AnthropicAdapter) ChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool) (*LLMResponse, error) {
	anthropicReq := a.buildAnthropicRequest(req, tools, false)

	respBody, err := a.doRequest(ctx, anthropicReq)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	return a.parseResponse(respBody)
}

// StreamChatWithTools 带工具的流式聊天
func (a *AnthropicAdapter) StreamChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool, writer io.Writer) (*LLMResponse, error) {
	anthropicReq := a.buildAnthropicRequest(req, tools, true)

	respBody, err := a.doRequest(ctx, anthropicReq)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	return a.parseStreamResponseWithWriter(respBody, writer)
}

// GetModelInfo 获取模型信息
func (a *AnthropicAdapter) GetModelInfo() *ModelInfo {
	return a.modelInfo
}

// GetProviderName 获取提供商名称
func (a *AnthropicAdapter) GetProviderName() string {
	return "anthropic"
}

// SupportsStreaming 是否支持流式输出
func (a *AnthropicAdapter) SupportsStreaming() bool {
	return true
}

// SupportsTools 是否支持工具调用
func (a *AnthropicAdapter) SupportsTools() bool {
	return a.modelInfo.SupportsTools
}

// ============================================================================
// 内部方法
// ============================================================================

// anthropicRequest Anthropic API 请求格式
type anthropicRequest struct {
	Model       string                   `json:"model"`
	Messages    []anthropicMessage       `json:"messages"`
	System      string                   `json:"system,omitempty"`
	MaxTokens   int                      `json:"max_tokens"`
	Temperature float64                  `json:"temperature,omitempty"`
	TopP        float64                  `json:"top_p,omitempty"`
	Stop        []string                 `json:"stop_sequences,omitempty"`
	Stream      bool                     `json:"stream"`
	Tools       []anthropicTool          `json:"tools,omitempty"`
	ToolChoice  *anthropicToolChoice     `json:"tool_choice,omitempty"`
}

// anthropicMessage Anthropic 消息格式
type anthropicMessage struct {
	Role    string      `json:"role"` // "user" 或 "assistant"
	Content any `json:"content"`
}

// anthropicTool Anthropic 工具定义
type anthropicTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

// anthropicToolChoice Anthropic 工具选择
type anthropicToolChoice struct {
	Type string `json:"type"` // "auto", "any", "tool"
	Name string `json:"name,omitempty"` // 当 type="tool" 时指定工具名
}

// anthropicResponse Anthropic API 响应格式
type anthropicResponse struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Role         string `json:"role"`
	Content      []anthropicContentBlock `json:"content"`
	Model        string `json:"model"`
	StopReason   string `json:"stop_reason"`
	StopSequence string `json:"stop_sequence,omitempty"`
	Usage        struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// anthropicContentBlock Anthropic 内容块
type anthropicContentBlock struct {
	Type      string      `json:"type"` // "text", "tool_use"
	Text      string      `json:"text,omitempty"`
	ID        string      `json:"id,omitempty"`   // 工具调用 ID
	Name      string      `json:"name,omitempty"` // 工具名
	Input     any `json:"input,omitempty"` // 工具参数
}

// anthropicStreamEvent Anthropic 流式事件
type anthropicStreamEvent struct {
	Type         string `json:"type"`
	Index        int    `json:"index,omitempty"`
	ContentBlock *anthropicContentBlock `json:"content_block,omitempty"`
	Delta        *anthropicDelta `json:"delta,omitempty"`
	Message      *anthropicResponse `json:"message,omitempty"`
	Usage        *struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
}

// anthropicDelta Anthropic 流式增量
type anthropicDelta struct {
	Type         string `json:"type"`
	Text         string `json:"text,omitempty"`
	PartialJSON  string `json:"partial_json,omitempty"`
	StopReason   string `json:"stop_reason,omitempty"`
}

// buildAnthropicRequest 构建 Anthropic API 请求
func (a *AnthropicAdapter) buildAnthropicRequest(req *LLMRequest, tools []LLMTool, stream bool) *anthropicRequest {
	// 提取 system 消息
	var systemPrompt string
	var messages []anthropicMessage

	for _, msg := range req.Messages {
		switch msg.Role {
		case "system":
			if content, ok := msg.Content.(string); ok {
				systemPrompt = content
			}
		case "user", "assistant":
			content := a.convertContent(msg)
			messages = append(messages, anthropicMessage{
				Role:    msg.Role,
				Content: content,
			})
		case "tool":
			// Anthropic 的工具结果通过 user 消息的 tool_result 类型返回
			messages = append(messages, anthropicMessage{
				Role: "user",
				Content: []map[string]any{
					{
						"type":        "tool_result",
						"tool_use_id": msg.ToolCallID,
						"content":     msg.Content,
					},
				},
			})
		}
	}

	anthropicReq := &anthropicRequest{
		Model:     a.config.Model,
		Messages:  messages,
		System:    systemPrompt,
		MaxTokens: a.modelInfo.MaxOutputTokens,
		Stream:    stream,
	}

	// 设置温度
	if req.Temperature > 0 {
		anthropicReq.Temperature = req.Temperature
	} else {
		anthropicReq.Temperature = 0.7
	}

	// 设置 max_tokens
	if req.MaxTokens > 0 {
		anthropicReq.MaxTokens = req.MaxTokens
	}

	// 设置可选参数
	if req.TopP > 0 {
		anthropicReq.TopP = req.TopP
	}
	if len(req.StopSequences) > 0 {
		anthropicReq.Stop = req.StopSequences
	}

	// 转换工具
	if len(tools) > 0 {
		anthropicReq.Tools = make([]anthropicTool, len(tools))
		for i, tool := range tools {
			anthropicReq.Tools[i] = anthropicTool{
				Name:        tool.Function.Name,
				Description: tool.Function.Description,
				InputSchema: tool.Function.Parameters,
			}
		}
		
		// 设置工具选择
		switch req.ToolChoice {
		case "none":
			// Anthropic 不发送 tool_choice 即可
		case "required", "any":
			anthropicReq.ToolChoice = &anthropicToolChoice{Type: "any"}
		default:
			anthropicReq.ToolChoice = &anthropicToolChoice{Type: "auto"}
		}
	}

	return anthropicReq
}

// convertContent 转换消息内容
func (a *AnthropicAdapter) convertContent(msg LLMMessage) any {
	// 如果是带工具调用的助手消息
	if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
		blocks := make([]map[string]any, 0)
		
		// 添加文本内容（如果有）
		if content, ok := msg.Content.(string); ok && content != "" {
			blocks = append(blocks, map[string]any{
				"type": "text",
				"text": content,
			})
		}
		
		// 添加工具调用
		for _, tc := range msg.ToolCalls {
			var input any
			json.Unmarshal([]byte(tc.Function.Arguments), &input)
			
			blocks = append(blocks, map[string]any{
				"type":  "tool_use",
				"id":    tc.ID,
				"name":  tc.Function.Name,
				"input": input,
			})
		}
		
		return blocks
	}

	// 简单文本内容
	if content, ok := msg.Content.(string); ok {
		return content
	}

	return msg.Content
}

// doRequest 发送 HTTP 请求
func (a *AnthropicAdapter) doRequest(ctx context.Context, req *anthropicRequest) (io.ReadCloser, error) {
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := strings.TrimSuffix(a.config.BaseURL, "/") + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", a.config.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	// 添加额外头
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
func (a *AnthropicAdapter) parseResponse(body io.ReadCloser) (*LLMResponse, error) {
	var resp anthropicResponse
	if err := json.NewDecoder(body).Decode(&resp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// 提取内容和工具调用
	var content strings.Builder
	var toolCalls []LLMToolCall

	for _, block := range resp.Content {
		switch block.Type {
		case "text":
			content.WriteString(block.Text)
		case "tool_use":
			inputJSON, _ := json.Marshal(block.Input)
			toolCalls = append(toolCalls, LLMToolCall{
				ID:   block.ID,
				Type: "function",
			})
			toolCalls[len(toolCalls)-1].Function.Name = block.Name
			toolCalls[len(toolCalls)-1].Function.Arguments = string(inputJSON)
		}
	}

	// 转换完成原因
	finishReason := "stop"
	switch resp.StopReason {
	case "tool_use":
		finishReason = "tool_calls"
	case "max_tokens":
		finishReason = "length"
	case "stop_sequence":
		finishReason = "stop"
	}

	return &LLMResponse{
		Content:      content.String(),
		ToolCalls:    toolCalls,
		FinishReason: finishReason,
		Model:        resp.Model,
		Usage: &LLMUsage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	}, nil
}

// parseStreamResponse 解析流式响应到 channel
func (a *AnthropicAdapter) parseStreamResponse(body io.ReadCloser, ch chan<- *LLMStreamChunk) {
	scanner := bufio.NewScanner(body)
	const maxScannerBuffer = 1024 * 1024
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	var currentToolCall *LLMToolCallDelta

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "" {
			continue
		}

		var event anthropicStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_start":
			if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
				currentToolCall = &LLMToolCallDelta{
					Index: event.Index,
					ID:    event.ContentBlock.ID,
					Name:  event.ContentBlock.Name,
				}
			}

		case "content_block_delta":
			if event.Delta != nil {
				switch event.Delta.Type {
				case "text_delta":
					ch <- &LLMStreamChunk{
						Delta: event.Delta.Text,
					}
				case "input_json_delta":
					if currentToolCall != nil {
						ch <- &LLMStreamChunk{
							ToolCallDelta: &LLMToolCallDelta{
								Index:     currentToolCall.Index,
								ID:        currentToolCall.ID,
								Name:      currentToolCall.Name,
								Arguments: event.Delta.PartialJSON,
							},
						}
					}
				}
			}

		case "content_block_stop":
			currentToolCall = nil

		case "message_stop":
			ch <- &LLMStreamChunk{Done: true}
			return

		case "message_delta":
			if event.Delta != nil && event.Delta.StopReason != "" {
				finishReason := "stop"
				switch event.Delta.StopReason {
				case "tool_use":
					finishReason = "tool_calls"
				case "max_tokens":
					finishReason = "length"
				}
				ch <- &LLMStreamChunk{
					Done:         true,
					FinishReason: finishReason,
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		ch <- &LLMStreamChunk{Error: err, Done: true}
	}
}

// parseStreamResponseWithWriter 解析流式响应并写入 writer
func (a *AnthropicAdapter) parseStreamResponseWithWriter(body io.ReadCloser, writer io.Writer) (*LLMResponse, error) {
	scanner := bufio.NewScanner(body)
	const maxScannerBuffer = 1024 * 1024
	scanner.Buffer(make([]byte, maxScannerBuffer), maxScannerBuffer)

	var fullContent strings.Builder
	var toolCalls []LLMToolCall
	toolCallsMap := make(map[int]*LLMToolCall)
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
		if data == "" {
			continue
		}

		var event anthropicStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_start":
			if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
				toolCallsMap[event.Index] = &LLMToolCall{
					ID:   event.ContentBlock.ID,
					Type: "function",
				}
				toolCallsMap[event.Index].Function.Name = event.ContentBlock.Name
			}

		case "content_block_delta":
			if event.Delta != nil {
				switch event.Delta.Type {
				case "text_delta":
					fullContent.WriteString(event.Delta.Text)
					
					// 转发到 writer（转换为 OpenAI SSE 格式以保持兼容性）
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
									Content: event.Delta.Text,
								},
							},
						},
					}
					chunkJSON, _ := json.Marshal(chunk)
					fmt.Fprintf(writer, "data: %s\n\n", string(chunkJSON))
					if flusher, ok := writer.(http.Flusher); ok {
						flusher.Flush()
					}

				case "input_json_delta":
					if tc := toolCallsMap[event.Index]; tc != nil {
						tc.Function.Arguments += event.Delta.PartialJSON
					}
				}
			}

		case "message_delta":
			if event.Delta != nil && event.Delta.StopReason != "" {
				switch event.Delta.StopReason {
				case "tool_use":
					finishReason = "tool_calls"
				case "max_tokens":
					finishReason = "length"
				default:
					finishReason = "stop"
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stream: %w", err)
	}

	// 收集工具调用
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
