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

// ============================================================================
// LLM Provider 抽象层
// 统一不同 AI 提供商的接口，支持真正的 Function Calling
// ============================================================================

// LLMProvider 统一的 LLM 提供商接口
// 所有 AI 提供商适配器都需要实现此接口
type LLMProvider interface {
	// Chat 基础聊天（非流式）
	Chat(ctx context.Context, req *LLMRequest) (*LLMResponse, error)

	// StreamChat 流式聊天
	// 返回一个 channel 用于接收流式数据块
	StreamChat(ctx context.Context, req *LLMRequest) (<-chan *LLMStreamChunk, error)

	// ChatWithTools 带工具的聊天（Function Calling）
	// 这是真正的 Function Calling 实现
	ChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool) (*LLMResponse, error)

	// StreamChatWithTools 带工具的流式聊天
	// 支持在流式输出中处理工具调用
	StreamChatWithTools(ctx context.Context, req *LLMRequest, tools []LLMTool, writer io.Writer) (*LLMResponse, error)

	// GetModelInfo 获取模型信息
	GetModelInfo() *ModelInfo

	// GetProviderName 获取提供商名称
	GetProviderName() string

	// SupportsStreaming 是否支持流式输出
	SupportsStreaming() bool

	// SupportsTools 是否支持工具调用
	SupportsTools() bool
}

// LLMRequest LLM 请求
type LLMRequest struct {
	// 对话消息
	Messages []LLMMessage `json:"messages"`

	// 模型参数
	Temperature float64 `json:"temperature,omitempty"` // 默认 0.7
	MaxTokens   int     `json:"max_tokens,omitempty"`  // 最大输出 token

	// 可选配置
	TopP            float64  `json:"top_p,omitempty"`
	StopSequences   []string `json:"stop,omitempty"`
	PresencePenalty float64  `json:"presence_penalty,omitempty"`
	FrequencyPenalty float64 `json:"frequency_penalty,omitempty"`

	// 工具相关
	ToolChoice string `json:"tool_choice,omitempty"` // "auto", "none", "required", 或具体工具名
}

// LLMMessage 对话消息
type LLMMessage struct {
	Role       string               `json:"role"`                  // system, user, assistant, tool
	Content    any          `json:"content"`               // 可以是 string 或复杂内容
	Name       string               `json:"name,omitempty"`        // 工具名称（当 role=tool 时使用）
	ToolCallID string               `json:"tool_call_id,omitempty"` // 工具调用 ID
	ToolCalls  []LLMToolCall        `json:"tool_calls,omitempty"`  // AI 返回的工具调用
}

// LLMResponse LLM 响应
type LLMResponse struct {
	// 响应内容
	Content string `json:"content"`

	// 工具调用（如果有）
	ToolCalls []LLMToolCall `json:"tool_calls,omitempty"`

	// 完成原因
	FinishReason string `json:"finish_reason"` // "stop", "tool_calls", "length", "content_filter"

	// 使用量统计
	Usage *LLMUsage `json:"usage,omitempty"`

	// 元信息
	Model   string `json:"model"`
	Created int64  `json:"created"`
}

// LLMStreamChunk 流式响应块
type LLMStreamChunk struct {
	// 增量内容
	Delta string `json:"delta"`

	// 工具调用增量（如果有）
	ToolCallDelta *LLMToolCallDelta `json:"tool_call_delta,omitempty"`

	// 是否完成
	Done bool `json:"done"`

	// 完成原因（最后一个块才有）
	FinishReason string `json:"finish_reason,omitempty"`

	// 错误（如果发生）
	Error error `json:"error,omitempty"`
}

// LLMToolCallDelta 工具调用增量
type LLMToolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Name     string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"` // 增量参数（JSON 片段）
}

// LLMTool 工具定义（用于 Function Calling）
type LLMTool struct {
	Type     string       `json:"type"` // 始终为 "function"
	Function LLMFunction  `json:"function"`
}

// LLMFunction 函数定义
type LLMFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema
}

// LLMToolCall 工具调用
type LLMToolCall struct {
	ID       string `json:"id"`   // 调用 ID
	Type     string `json:"type"` // "function"
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"` // JSON 字符串
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
	Name            string `json:"name"`
	Provider        string `json:"provider"`
	MaxContextTokens int   `json:"max_context_tokens"`
	MaxOutputTokens  int   `json:"max_output_tokens"`
	SupportsTools    bool  `json:"supports_tools"`
	SupportsVision   bool  `json:"supports_vision"`
}

// ============================================================================
// Provider 配置
// ============================================================================

// ProviderConfig LLM 提供商配置
type ProviderConfig struct {
	Provider string `json:"provider"` // "openai", "anthropic", "azure", "custom"
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
	Model    string `json:"model"`

	// 可选配置
	Organization string            `json:"organization,omitempty"` // OpenAI 组织 ID
	APIVersion   string            `json:"api_version,omitempty"`  // Azure API 版本
	Headers      map[string]string `json:"headers,omitempty"`      // 额外请求头
}

// ============================================================================
// Provider Factory
// ============================================================================

// ProviderType 提供商类型
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderAzure     ProviderType = "azure"
	ProviderCustom    ProviderType = "custom" // 兼容 OpenAI API 的自定义服务
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

	// 注册默认提供商
	factory.RegisterProvider(ProviderOpenAI, NewOpenAIAdapter)
	factory.RegisterProvider(ProviderAnthropic, NewAnthropicAdapter)
	factory.RegisterProvider(ProviderCustom, NewOpenAIAdapter) // 自定义服务使用 OpenAI 适配器

	return factory
}

// RegisterProvider 注册提供商
func (f *ProviderFactory) RegisterProvider(providerType ProviderType, creator func(config *ProviderConfig) (LLMProvider, error)) {
	f.providers[providerType] = creator
}

// CreateProvider 创建提供商实例
func (f *ProviderFactory) CreateProvider(config *ProviderConfig) (LLMProvider, error) {
	providerType := ProviderType(config.Provider)
	creator, ok := f.providers[providerType]
	if !ok {
		// 默认尝试使用 OpenAI 适配器（大多数服务兼容 OpenAI API）
		creator = f.providers[ProviderOpenAI]
		if creator == nil {
			return nil, fmt.Errorf("unsupported provider: %s", config.Provider)
		}
	}
	return creator(config)
}

// ============================================================================
// 辅助函数
// ============================================================================

// ConvertToLLMMessages 将旧的 ChatMessage 转换为 LLMMessage
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

// ConvertFromLLMMessages 将 LLMMessage 转换为旧的 ChatMessage
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

// DefaultProviderFactory 默认工厂实例
var DefaultProviderFactory = NewProviderFactory()

// CreateProviderFromConfig 使用默认工厂创建提供商
func CreateProviderFromConfig(config *ProviderConfig) (LLMProvider, error) {
	return DefaultProviderFactory.CreateProvider(config)
}
