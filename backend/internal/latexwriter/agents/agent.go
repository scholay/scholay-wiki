// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agents

import (
	"context"
	"io"

	"scholar-backend/internal/ai"
)

// ============================================================================
// Agent 基础接口和类型定义
// ============================================================================

// AgentRole 代理角色
type AgentRole string

const (
	RolePlanner   AgentRole = "planner"   // 规划者：分析需求，制定计划
	RoleCoder     AgentRole = "coder"     // 编码者：执行具体的代码生成任务
	RoleValidator AgentRole = "validator" // 验证者：检查输出质量和正确性
	RoleReviewer  AgentRole = "reviewer"  // 审核者：最终审核和优化
)

// Agent 代理接口
type Agent interface {
	// GetRole 获取代理角色
	GetRole() AgentRole

	// GetSystemPrompt 获取系统提示词
	GetSystemPrompt() string

	// Process 处理请求
	Process(ctx context.Context, req *AgentRequest) (*AgentResponse, error)

	// StreamProcess 流式处理请求
	StreamProcess(ctx context.Context, req *AgentRequest, writer io.Writer) (*AgentResponse, error)
}

// AgentRequest 代理请求
type AgentRequest struct {
	// 基础信息
	UserID     uint   `json:"user_id"`
	DocumentID uint   `json:"document_id"`
	SessionID  string `json:"session_id"`

	// 用户输入
	Prompt      string `json:"prompt"`       // 用户原始请求
	Context     string `json:"context"`      // 选中的代码上下文
	FullContent string `json:"full_content"` // 完整文档内容

	// 对话历史
	Messages []ai.LLMMessage `json:"messages"`

	// 上一个 Agent 的输出（用于链式处理）
	PreviousOutput *AgentResponse `json:"previous_output,omitempty"`

	// 配置
	ModelID     uint    `json:"model_id"`
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"max_tokens"`
}

// AgentResponse 代理响应
type AgentResponse struct {
	// 角色信息
	Role    AgentRole `json:"role"`
	AgentID string    `json:"agent_id"`

	// 响应内容
	Think   string `json:"think"`   // 思考过程
	Reply   string `json:"reply"`   // 用户可见的回复
	Code    string `json:"code"`    // 生成的代码
	Plan    *Plan  `json:"plan,omitempty"` // 执行计划（Planner）

	// 验证结果（Validator）
	ValidationResult *ValidationResult `json:"validation_result,omitempty"`

	// 工具调用
	ToolCalls []ai.LLMToolCall `json:"tool_calls,omitempty"`

	// 元信息
	Tokens     int    `json:"tokens"`
	Duration   int64  `json:"duration_ms"`
	Model      string `json:"model"`
	FinishReason string `json:"finish_reason"`

	// 是否需要继续处理
	NeedsMoreProcessing bool   `json:"needs_more_processing"`
	NextRole            AgentRole `json:"next_role,omitempty"`
	
	// 错误信息
	Error string `json:"error,omitempty"`
}

// Plan 执行计划
type Plan struct {
	Summary string      `json:"summary"` // 计划摘要
	Steps   []PlanStep  `json:"steps"`   // 具体步骤
}

// PlanStep 计划步骤
type PlanStep struct {
	Index       int      `json:"index"`
	Action      string   `json:"action"`      // 动作类型
	Description string   `json:"description"` // 描述
	Tools       []string `json:"tools,omitempty"` // 可能使用的工具
	Completed   bool     `json:"completed"`
	Output      string   `json:"output,omitempty"`
}

// ValidationResult 验证结果
type ValidationResult struct {
	Valid      bool               `json:"valid"`
	Errors     []ValidationError  `json:"errors,omitempty"`
	Warnings   []ValidationWarning `json:"warnings,omitempty"`
	Suggestions []string          `json:"suggestions,omitempty"`
}

// ValidationError 验证错误
type ValidationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
	Context string `json:"context,omitempty"`
}

// ValidationWarning 验证警告
type ValidationWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Suggestion string `json:"suggestion,omitempty"`
}

// ============================================================================
// Agent 基类
// ============================================================================

// BaseAgent Agent 基类
type BaseAgent struct {
	role        AgentRole
	provider    ai.LLMProvider
	systemPrompt string
}

// NewBaseAgent 创建基础代理
func NewBaseAgent(role AgentRole, provider ai.LLMProvider, systemPrompt string) *BaseAgent {
	return &BaseAgent{
		role:         role,
		provider:     provider,
		systemPrompt: systemPrompt,
	}
}

// GetRole 获取角色
func (a *BaseAgent) GetRole() AgentRole {
	return a.role
}

// GetSystemPrompt 获取系统提示词
func (a *BaseAgent) GetSystemPrompt() string {
	return a.systemPrompt
}

// GetProvider 获取 LLM 提供商
func (a *BaseAgent) GetProvider() ai.LLMProvider {
	return a.provider
}

// BuildMessages 构建消息列表
func (a *BaseAgent) BuildMessages(req *AgentRequest, additionalInstructions string) []ai.LLMMessage {
	messages := []ai.LLMMessage{
		{
			Role:    "system",
			Content: a.systemPrompt,
		},
	}

	// 添加历史消息
	messages = append(messages, req.Messages...)

	// 构建当前用户消息
	var userContent string

	// 添加上一个 Agent 的输出
	if req.PreviousOutput != nil {
		userContent += "【上一步处理结果】\n"
		if req.PreviousOutput.Plan != nil {
			userContent += "执行计划: " + req.PreviousOutput.Plan.Summary + "\n"
		}
		if req.PreviousOutput.Code != "" {
			userContent += "生成的代码:\n```latex\n" + req.PreviousOutput.Code + "\n```\n"
		}
		if req.PreviousOutput.Reply != "" {
			userContent += "AI 回复: " + req.PreviousOutput.Reply + "\n"
		}
		userContent += "\n"
	}

	// 添加代码上下文
	if req.Context != "" {
		userContent += "【选中的代码】\n```latex\n" + req.Context + "\n```\n\n"
	}

	// 添加完整文档（如果有且没有选中内容）
	if req.FullContent != "" && req.Context == "" {
		maxLen := 5000
		content := req.FullContent
		if len(content) > maxLen {
			content = content[:maxLen] + "\n...[已截断]..."
		}
		userContent += "【当前文档】\n```latex\n" + content + "\n```\n\n"
	}

	// 添加额外指令
	if additionalInstructions != "" {
		userContent += "【特殊指令】\n" + additionalInstructions + "\n\n"
	}

	// 添加用户请求
	userContent += "【用户请求】\n" + req.Prompt

	messages = append(messages, ai.LLMMessage{
		Role:    "user",
		Content: userContent,
	})

	return messages
}
