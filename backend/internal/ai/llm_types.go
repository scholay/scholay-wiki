// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"context"
	"fmt"
	"io"
)

// LLMProvider 统一的 LLM 提供商接口
type LLMProvider interface {
	Chat(ctx context.Context, req *LLMRequest) (*LLMResponse, error)
	StreamChat(ctx context.Context, req *LLMRequest) (<-chan *LLMStreamChunk, error)
	ChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool) (*LLMResponse, error)
	StreamChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool, writer io.Writer) (*LLMResponse, error)
	GetModelInfo() *ModelInfo
	GetProviderName() string
	SupportsStreaming() bool
	SupportsTools() bool
}

// LLMRequest LLM 请求
type LLMRequest struct {
	Messages         []LLMMessage `json:"messages"`
	Temperature      float64      `json:"temperature,omitempty"`
	MaxTokens        int          `json:"max_tokens,omitempty"`
	TopP             float64      `json:"top_p,omitempty"`
	StopSequences    []string     `json:"stop,omitempty"`
	PresencePenalty  float64      `json:"presence_penalty,omitempty"`
	FrequencyPenalty float64      `json:"frequency_penalty,omitempty"`
	ToolChoice       string       `json:"tool_choice,omitempty"`
}

// LLMMessage 对话消息
type LLMMessage struct {
	Role       string        `json:"role"`
	Content    interface{}   `json:"content"`
	Name       string        `json:"name,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
	ToolCalls  []LLMToolCall `json:"tool_calls,omitempty"`
}

// LLMResponse LLM 响应
type LLMResponse struct {
	Content      string        `json:"content"`
	ToolCalls    []LLMToolCall `json:"tool_calls,omitempty"`
	FinishReason string        `json:"finish_reason"`
	Usage        *LLMUsage    `json:"usage,omitempty"`
	Model        string        `json:"model"`
	Created      int64         `json:"created"`
}

// LLMStreamChunk 流式响应块
type LLMStreamChunk struct {
	Delta         string            `json:"delta"`
	Content       string            `json:"content,omitempty"`
	ToolCallDelta *LLMToolCallDelta `json:"tool_call_delta,omitempty"`
	Done          bool              `json:"done"`
	FinishReason  string            `json:"finish_reason,omitempty"`
	Error         error             `json:"error,omitempty"`
}

// LLMToolCallDelta 工具调用增量
type LLMToolCallDelta struct {
	Index     int    `json:"index"`
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

// LLMTool 工具定义
type LLMTool struct {
	Type     string      `json:"type"`
	Function LLMFunction `json:"function"`
}

// LLMFunction 函数定义
type LLMFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// LLMToolCall 工具调用
type LLMToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// LLMUsage 使用量统计
type LLMUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ModelInfo 模型信息
type ModelInfo struct {
	Name             string `json:"name"`
	Provider         string `json:"provider"`
	MaxContextTokens int    `json:"max_context_tokens"`
	MaxOutputTokens  int    `json:"max_output_tokens"`
	SupportsTools    bool   `json:"supports_tools"`
	SupportsVision   bool   `json:"supports_vision"`
}

// ProviderConfig LLM 提供商配置
type ProviderConfig struct {
	Provider     string            `json:"provider"`
	BaseURL      string            `json:"base_url"`
	APIKey       string            `json:"api_key"`
	Model        string            `json:"model"`
	Organization string            `json:"organization,omitempty"`
	APIVersion   string            `json:"api_version,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
}

// ProviderType 提供商类型
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderAzure     ProviderType = "azure"
	ProviderCustom    ProviderType = "custom"
)

// ProviderFactory Provider 工厂
type ProviderFactory struct {
	providers map[ProviderType]func(config *ProviderConfig) (LLMProvider, error)
}

// NewProviderFactory 创建 Provider 工厂
func NewProviderFactory() *ProviderFactory {
	factory := &ProviderFactory{
		providers: make(map[ProviderType]func(config *ProviderConfig) (LLMProvider, error)),
	}
	factory.RegisterProvider(ProviderOpenAI, NewOpenAIAdapter)
	factory.RegisterProvider(ProviderAnthropic, NewAnthropicAdapter)
	factory.RegisterProvider(ProviderCustom, NewOpenAIAdapter)
	return factory
}

func (f *ProviderFactory) RegisterProvider(providerType ProviderType, creator func(config *ProviderConfig) (LLMProvider, error)) {
	f.providers[providerType] = creator
}

func (f *ProviderFactory) CreateProvider(config *ProviderConfig) (LLMProvider, error) {
	providerType := ProviderType(config.Provider)
	creator, ok := f.providers[providerType]
	if !ok {
		creator = f.providers[ProviderOpenAI]
		if creator == nil {
			return nil, fmt.Errorf("unsupported provider: %s", config.Provider)
		}
	}
	return creator(config)
}

// DefaultProviderFactory 默认工厂实例
var DefaultProviderFactory = NewProviderFactory()

// CreateProviderFromConfig 使用默认工厂创建提供商
func CreateProviderFromConfig(config *ProviderConfig) (LLMProvider, error) {
	return DefaultProviderFactory.CreateProvider(config)
}

// ConvertToLLMMessages 将 ChatMessage 转换为 LLMMessage
func ConvertToLLMMessages(messages []ChatMessage) []LLMMessage {
	result := make([]LLMMessage, len(messages))
	for i, msg := range messages {
		result[i] = LLMMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}
	return result
}

// ConvertFromLLMMessages 将 LLMMessage 转换为 ChatMessage
func ConvertFromLLMMessages(messages []LLMMessage) []ChatMessage {
	result := make([]ChatMessage, len(messages))
	for i, msg := range messages {
		result[i] = ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}
	return result
}

// ConvertMCPToolsToLLMTools 将 MCP 工具转换为 LLM 工具格式
func ConvertMCPToolsToLLMTools(mcpTools []Tool) []LLMTool {
	tools := make([]LLMTool, len(mcpTools))
	for i, mcpTool := range mcpTools {
		tools[i] = LLMTool{
			Type: "function",
			Function: LLMFunction{
				Name:        mcpTool.Function.Name,
				Description: mcpTool.Function.Description,
				Parameters:  mcpTool.Function.Parameters,
			},
		}
	}
	return tools
}

// ConvertLLMToolCallsToToolCalls 将 LLM 工具调用转换为旧格式
func ConvertLLMToolCallsToToolCalls(llmCalls []LLMToolCall) []ToolCall {
	result := make([]ToolCall, len(llmCalls))
	for i, call := range llmCalls {
		result[i] = ToolCall{
			ID:   call.ID,
			Type: call.Type,
		}
		result[i].Function.Name = call.Function.Name
		result[i].Function.Arguments = call.Function.Arguments
	}
	return result
}
