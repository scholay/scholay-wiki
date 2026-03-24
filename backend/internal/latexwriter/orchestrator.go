// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/latexwriter/agents"
	"scholar-backend/internal/mcp"
)

// ============================================================================
// Agent Orchestrator
// 协调多个 Agent 角色完成复杂任务
// ============================================================================

// AgentOrchestrator 代理编排器
type AgentOrchestrator struct {
	// Agents
	planner *agents.PlannerAgent
	coder   *agents.CoderAgent

	// 工具系统
	functionCaller *FunctionCaller
	mcpRegistry    *mcp.Registry

	// 上下文管理
	contextManager *EnhancedContextManager

	// 权限管理
	permissionManager *PermissionManager

	// 配置
	config *OrchestratorConfig
}

// OrchestratorConfig 编排器配置
type OrchestratorConfig struct {
	// 是否启用多 Agent 模式
	EnableMultiAgent bool `json:"enable_multi_agent"`

	// 最大迭代次数
	MaxIterations int `json:"max_iterations"`

	// 各 Agent 的模型配置
	PlannerModelID uint `json:"planner_model_id"`
	CoderModelID   uint `json:"coder_model_id"`

	// 上下文配置
	MaxContextTokens int `json:"max_context_tokens"`
}

// DefaultOrchestratorConfig 默认配置
var DefaultOrchestratorConfig = &OrchestratorConfig{
	EnableMultiAgent: true,
	MaxIterations:    10,
	MaxContextTokens: 128000,
}

// OrchestratorRequest 编排器请求
type OrchestratorRequest struct {
	UserID      uint   `json:"user_id"`
	DocumentID  uint   `json:"document_id"`
	SessionID   string `json:"session_id"`
	Prompt      string `json:"prompt"`
	Context     string `json:"context"`
	FullContent string `json:"full_content"`

	// 对话历史
	ConversationHistory []ai.LLMMessage `json:"conversation_history"`

	// 配置覆盖
	ModelID     uint    `json:"model_id"`
	Temperature float64 `json:"temperature"`
}

// OrchestratorResult 编排器结果
type OrchestratorResult struct {
	// 最终输出
	Think string `json:"think"`
	Reply string `json:"reply"`
	Code  string `json:"code"`

	// 执行计划
	Plan *agents.Plan `json:"plan,omitempty"`

	// 执行轨迹
	Trace []*agents.AgentResponse `json:"trace"`

	// 统计信息
	TotalDuration int64 `json:"total_duration_ms"`
	TotalTokens   int   `json:"total_tokens"`
	Iterations    int   `json:"iterations"`

	// 错误信息
	Error string `json:"error,omitempty"`
}

// NewAgentOrchestrator 创建代理编排器
func NewAgentOrchestrator(
	provider ai.LLMProvider,
	mcpRegistry *mcp.Registry,
	config *OrchestratorConfig,
) *AgentOrchestrator {
	if config == nil {
		config = DefaultOrchestratorConfig
	}

	// 创建权限管理器
	permissionManager := NewPermissionManager()

	// 创建 Function Caller
	functionCaller := NewFunctionCaller(mcpRegistry, permissionManager, provider)

	// 获取 LLM 工具
	tools := functionCaller.ConvertToLLMTools()

	// 创建各个 Agent
	planner := agents.NewPlannerAgent(provider)
	coder := agents.NewCoderAgent(provider, tools)

	// 创建上下文管理器
	contextManager := NewEnhancedContextManager(
		provider,
		config.MaxContextTokens,
		DefaultAutoCompactConfig,
	)

	return &AgentOrchestrator{
		planner:           planner,
		coder:             coder,
		functionCaller:    functionCaller,
		mcpRegistry:       mcpRegistry,
		contextManager:    contextManager,
		permissionManager: permissionManager,
		config:            config,
	}
}

// Execute 执行编排（非流式）
func (o *AgentOrchestrator) Execute(ctx context.Context, req *OrchestratorRequest) (*OrchestratorResult, error) {
	startTime := time.Now()

	result := &OrchestratorResult{
		Trace: make([]*agents.AgentResponse, 0),
	}

	log.Printf("[Orchestrator] Starting execution, multi-agent: %v\n", o.config.EnableMultiAgent)

	// 如果不启用多 Agent 模式，直接使用 Coder
	if !o.config.EnableMultiAgent {
		return o.executeSingleAgent(ctx, req, result)
	}

	// 多 Agent 模式
	return o.executeMultiAgent(ctx, req, result, startTime)
}

// StreamExecute 流式执行编排
func (o *AgentOrchestrator) StreamExecute(
	ctx context.Context,
	req *OrchestratorRequest,
	writer io.Writer,
) (*OrchestratorResult, error) {
	startTime := time.Now()

	result := &OrchestratorResult{
		Trace: make([]*agents.AgentResponse, 0),
	}

	log.Printf("[Orchestrator] Starting streaming execution\n")

	// 简化模式：直接使用 Coder 进行流式输出
	if !o.config.EnableMultiAgent {
		return o.streamSingleAgent(ctx, req, result, writer)
	}

	// 多 Agent 流式模式
	return o.streamMultiAgent(ctx, req, result, writer, startTime)
}

// executeSingleAgent 单 Agent 模式
func (o *AgentOrchestrator) executeSingleAgent(
	ctx context.Context,
	req *OrchestratorRequest,
	result *OrchestratorResult,
) (*OrchestratorResult, error) {
	startTime := time.Now()

	// 构建 Agent 请求
	agentReq := o.buildAgentRequest(req)

	// 直接调用 Coder
	coderResp, err := o.coder.Process(ctx, agentReq)
	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	result.Trace = append(result.Trace, coderResp)
	result.Think = coderResp.Think
	result.Reply = coderResp.Reply
	result.Code = coderResp.Code

	result.TotalDuration = time.Since(startTime).Milliseconds()
	return result, nil
}

// executeMultiAgent 多 Agent 模式
func (o *AgentOrchestrator) executeMultiAgent(
	ctx context.Context,
	req *OrchestratorRequest,
	result *OrchestratorResult,
	startTime time.Time,
) (*OrchestratorResult, error) {
	// 构建 Agent 请求
	agentReq := o.buildAgentRequest(req)

	// 1. Planner 分析需求
	log.Printf("[Orchestrator] Step 1: Planning\n")
	plannerResp, err := o.planner.Process(ctx, agentReq)
	if err != nil {
		result.Error = fmt.Sprintf("Planner failed: %v", err)
		return result, err
	}
	result.Trace = append(result.Trace, plannerResp)
	result.Plan = plannerResp.Plan

	// 2. Coder 执行计划
	log.Printf("[Orchestrator] Step 2: Coding\n")
	agentReq.PreviousOutput = plannerResp
	coderResp, err := o.coder.Process(ctx, agentReq)
	if err != nil {
		result.Error = fmt.Sprintf("Coder failed: %v", err)
		return result, err
	}
	result.Trace = append(result.Trace, coderResp)
	result.Think = coderResp.Think
	result.Reply = coderResp.Reply
	result.Code = coderResp.Code

	// 3. 处理工具调用（如果有）
	if len(coderResp.ToolCalls) > 0 {
		log.Printf("[Orchestrator] Processing %d tool calls\n", len(coderResp.ToolCalls))
		toolResults, err := o.functionCaller.ProcessToolCalls(ctx, coderResp.ToolCalls)
		if err != nil {
			log.Printf("[Orchestrator] Tool execution error: %v\n", err)
		} else {
			// 将工具结果添加到对话历史
			for _, tr := range toolResults {
				log.Printf("[Orchestrator] Tool %s: success=%v\n", tr.Name, tr.Success)
			}
		}
	}

	result.TotalDuration = time.Since(startTime).Milliseconds()
	result.Iterations = len(result.Trace)

	return result, nil
}

// streamSingleAgent 单 Agent 流式模式
func (o *AgentOrchestrator) streamSingleAgent(
	ctx context.Context,
	req *OrchestratorRequest,
	result *OrchestratorResult,
	writer io.Writer,
) (*OrchestratorResult, error) {
	startTime := time.Now()

	agentReq := o.buildAgentRequest(req)

	coderResp, err := o.coder.StreamProcess(ctx, agentReq, writer)
	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	result.Trace = append(result.Trace, coderResp)
	result.Think = coderResp.Think
	result.Reply = coderResp.Reply
	result.Code = coderResp.Code
	result.TotalDuration = time.Since(startTime).Milliseconds()

	return result, nil
}

// streamMultiAgent 多 Agent 流式模式
func (o *AgentOrchestrator) streamMultiAgent(
	ctx context.Context,
	req *OrchestratorRequest,
	result *OrchestratorResult,
	writer io.Writer,
	startTime time.Time,
) (*OrchestratorResult, error) {
	agentReq := o.buildAgentRequest(req)

	// 1. Planner（非流式，因为输出结构化数据）
	plannerResp, err := o.planner.Process(ctx, agentReq)
	if err != nil {
		result.Error = fmt.Sprintf("Planner failed: %v", err)
		return result, err
	}
	result.Trace = append(result.Trace, plannerResp)
	result.Plan = plannerResp.Plan

	// 输出规划信息
	if plannerResp.Reply != "" {
		writeStreamMessage(writer, "📋 **规划完成**\n\n"+plannerResp.Reply+"\n\n---\n\n")
	}

	// 2. Coder（流式）
	agentReq.PreviousOutput = plannerResp
	coderResp, err := o.coder.StreamProcess(ctx, agentReq, writer)
	if err != nil {
		result.Error = fmt.Sprintf("Coder failed: %v", err)
		return result, err
	}

	result.Trace = append(result.Trace, coderResp)
	result.Think = coderResp.Think
	result.Reply = coderResp.Reply
	result.Code = coderResp.Code

	result.TotalDuration = time.Since(startTime).Milliseconds()
	result.Iterations = len(result.Trace)

	return result, nil
}

// buildAgentRequest 构建 Agent 请求
func (o *AgentOrchestrator) buildAgentRequest(req *OrchestratorRequest) *agents.AgentRequest {
	return &agents.AgentRequest{
		UserID:      req.UserID,
		DocumentID:  req.DocumentID,
		SessionID:   req.SessionID,
		Prompt:      req.Prompt,
		Context:     req.Context,
		FullContent: req.FullContent,
		Messages:    req.ConversationHistory,
		ModelID:     req.ModelID,
		Temperature: req.Temperature,
	}
}

// writeStreamMessage 写入流式消息
func writeStreamMessage(writer io.Writer, message string) {
	// 转换为 SSE 格式
	for _, line := range strings.Split(message, "\n") {
		fmt.Fprintf(writer, "data: %s\n\n", line)
	}
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
}

// GetFunctionCaller 获取函数调用器
func (o *AgentOrchestrator) GetFunctionCaller() *FunctionCaller {
	return o.functionCaller
}

// GetPermissionManager 获取权限管理器
func (o *AgentOrchestrator) GetPermissionManager() *PermissionManager {
	return o.permissionManager
}
