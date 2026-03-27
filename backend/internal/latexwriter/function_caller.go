// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
)

// ============================================================================
// Function Caller
// 真正的 Function Calling 实现，负责解析 LLM 返回的工具调用并执行
// ============================================================================

// FunctionCaller 函数调用执行器
type FunctionCaller struct {
	registry   *mcp.Registry        // MCP 工具注册表
	permission *PermissionManager   // 权限管理器
	provider   ai.LLMProvider       // LLM 提供商（用于工具后续对话）

	// 执行统计
	stats *ExecutionStats
	mu    sync.RWMutex
}

// ExecutionStats 执行统计
type ExecutionStats struct {
	TotalCalls     int64
	SuccessCalls   int64
	FailedCalls    int64
	TotalDuration  time.Duration
	ToolCallCounts map[string]int64
}

// ToolCallRequest 工具调用请求
type ToolCallRequest struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

// ToolCallResult 工具调用结果
type ToolCallResult struct {
	ToolCallID   string      `json:"tool_call_id"`
	Name         string      `json:"name"`
	Success      bool        `json:"success"`
	Content      string      `json:"content"`
	Error        string      `json:"error,omitempty"`
	Duration     time.Duration `json:"duration"`
	NeedsApproval bool       `json:"needs_approval,omitempty"` // 是否需要用户批准
}

// FunctionCallLoop 函数调用循环配置
type FunctionCallLoop struct {
	MaxIterations       int           // 最大迭代次数（防止无限循环）
	ToolExecutionTimeout time.Duration // 单个工具执行超时
	EnableParallel      bool          // 是否启用并行执行
}

// DefaultFunctionCallLoop 默认配置
var DefaultFunctionCallLoop = &FunctionCallLoop{
	MaxIterations:        10,
	ToolExecutionTimeout: 30 * time.Second,
	EnableParallel:       true,
}

// NewFunctionCaller 创建函数调用执行器
func NewFunctionCaller(registry *mcp.Registry, permission *PermissionManager, provider ai.LLMProvider) *FunctionCaller {
	return &FunctionCaller{
		registry:   registry,
		permission: permission,
		provider:   provider,
		stats: &ExecutionStats{
			ToolCallCounts: make(map[string]int64),
		},
	}
}

// ProcessToolCalls 处理 LLM 返回的工具调用
// 这是核心方法，解析 tool_calls 并执行
func (fc *FunctionCaller) ProcessToolCalls(ctx context.Context, toolCalls []ai.LLMToolCall) ([]*ToolCallResult, error) {
	if len(toolCalls) == 0 {
		return nil, nil
	}

	slog.Info("processing tool calls", "count", len(toolCalls))

	results := make([]*ToolCallResult, len(toolCalls))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, tc := range toolCalls {
		wg.Add(1)
		go func(idx int, call ai.LLMToolCall) {
			defer wg.Done()

			result := fc.executeToolCall(ctx, call)
			
			mu.Lock()
			results[idx] = result
			mu.Unlock()
		}(i, tc)
	}

	wg.Wait()
	return results, nil
}

// executeToolCall 执行单个工具调用
func (fc *FunctionCaller) executeToolCall(ctx context.Context, call ai.LLMToolCall) *ToolCallResult {
	startTime := time.Now()
	toolName := call.Function.Name

	result := &ToolCallResult{
		ToolCallID: call.ID,
		Name:       toolName,
	}

	// 1. 检查权限
	if fc.permission != nil {
		permission := fc.permission.GetPermission(toolName)
		switch permission {
		case PermissionDeny:
			result.Success = false
			result.Error = "Tool execution denied by permission policy"
			result.Duration = time.Since(startTime)
			return result
		case PermissionAsk:
			result.NeedsApproval = true
			result.Success = false
			result.Error = "Tool execution requires user approval"
			result.Duration = time.Since(startTime)
			return result
		}
	}

	// 2. 解析参数
	var args map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &args); err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to parse arguments: %v", err)
		result.Duration = time.Since(startTime)
		fc.recordFailure(toolName)
		return result
	}

	// 3. 查找工具
	tool, exists := fc.registry.GetTool(toolName)
	if !exists || tool == nil {
		result.Success = false
		result.Error = fmt.Sprintf("Tool not found: %s", toolName)
		result.Duration = time.Since(startTime)
		fc.recordFailure(toolName)
		return result
	}

	// 4. 执行工具
	slog.Debug("executing tool", "tool_name", toolName, "args", args)
	
	execResult, err := fc.registry.CallTool(ctx, toolName, args)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Tool execution failed: %v", err)
		result.Duration = time.Since(startTime)
		fc.recordFailure(toolName)
		return result
	}

	// 5. 序列化结果
	resultJSON, err := json.Marshal(execResult)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("Failed to serialize result: %v", err)
		result.Duration = time.Since(startTime)
		fc.recordFailure(toolName)
		return result
	}

	result.Success = true
	result.Content = string(resultJSON)
	result.Duration = time.Since(startTime)
	fc.recordSuccess(toolName, result.Duration)

	slog.Info("tool execution completed", "tool_name", toolName, "duration", result.Duration)
	return result
}

// ExecuteFunctionCallLoop 执行完整的函数调用循环
// 这是主要的对外接口，实现多轮工具调用
func (fc *FunctionCaller) ExecuteFunctionCallLoop(
	ctx context.Context,
	initialMessages []ai.LLMMessage,
	tools []ai.LLMTool,
	config *FunctionCallLoop,
) (*ai.LLMResponse, []ai.LLMMessage, error) {
	if config == nil {
		config = DefaultFunctionCallLoop
	}

	messages := make([]ai.LLMMessage, len(initialMessages))
	copy(messages, initialMessages)

	slog.Info("starting function call loop", "tool_count", len(tools))

	for iteration := 0; iteration < config.MaxIterations; iteration++ {
		slog.Debug("function call loop iteration", "iteration", iteration+1, "max_iterations", config.MaxIterations)

		// 1. 调用 LLM
		llmReq := &ai.LLMRequest{
			Messages:    messages,
			Temperature: 0.7,
			ToolChoice:  "auto",
		}

		response, err := fc.provider.ChatWithTools(ctx, llmReq, tools)
		if err != nil {
			return nil, messages, fmt.Errorf("LLM call failed: %w", err)
		}

		// 2. 检查是否需要执行工具
		if len(response.ToolCalls) == 0 {
			// 没有工具调用，对话完成
			slog.Debug("no tool calls, conversation complete")
			return response, messages, nil
		}

		slog.Info("LLM requested tool calls", "count", len(response.ToolCalls))

		// 3. 添加助手消息（包含工具调用）
		assistantMsg := ai.LLMMessage{
			Role:      "assistant",
			Content:   response.Content,
			ToolCalls: response.ToolCalls,
		}
		messages = append(messages, assistantMsg)

		// 4. 执行工具调用
		results, err := fc.ProcessToolCalls(ctx, response.ToolCalls)
		if err != nil {
			return nil, messages, fmt.Errorf("Tool execution failed: %w", err)
		}

		// 5. 添加工具结果消息
		for _, result := range results {
			toolMsg := ai.LLMMessage{
				Role:       "tool",
				Name:       result.Name,
				Content:    result.Content,
				ToolCallID: result.ToolCallID,
			}
			if !result.Success {
				toolMsg.Content = fmt.Sprintf("Error: %s", result.Error)
			}
			messages = append(messages, toolMsg)
		}

		// 检查是否有需要用户批准的调用
		for _, result := range results {
			if result.NeedsApproval {
				// 返回当前状态，等待用户批准
				return response, messages, fmt.Errorf("tool %s requires user approval", result.Name)
			}
		}
	}

	return nil, messages, fmt.Errorf("max iterations (%d) reached", config.MaxIterations)
}

// ConvertToLLMTools 将 MCP 工具转换为 LLM 工具格式
func (fc *FunctionCaller) ConvertToLLMTools() []ai.LLMTool {
	mcpTools := fc.registry.ListTools()
	tools := make([]ai.LLMTool, len(mcpTools))

	for i, tool := range mcpTools {
		tools[i] = ai.LLMTool{
			Type: "function",
			Function: ai.LLMFunction{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.InputSchema,
			},
		}
	}

	return tools
}

// GetToolsDescription 获取工具描述（用于在提示词中使用）
func (fc *FunctionCaller) GetToolsDescription() string {
	tools := fc.registry.ListTools()
	if len(tools) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("\n\n═══════════════════════════════════════════════════════════════════════════════\n")
	builder.WriteString("【可用工具】\n")
	builder.WriteString("以下工具可以被自动调用来帮助完成任务：\n")
	builder.WriteString("═══════════════════════════════════════════════════════════════════════════════\n\n")

	// 按分类组织
	categoryTools := make(map[mcp.ToolCategory][]mcp.ToolDefinition)
	for _, tool := range tools {
		categoryTools[tool.Category] = append(categoryTools[tool.Category], tool)
	}

	categoryNames := map[mcp.ToolCategory]string{
		mcp.CategoryLatex:    "LaTeX 工具",
		mcp.CategorySearch:   "搜索工具",
		mcp.CategoryBibtex:   "参考文献工具",
		mcp.CategoryFile:     "文件工具",
		mcp.CategoryConvert:  "格式转换工具",
		mcp.CategoryMath:     "数学工具",
		mcp.CategoryImage:    "图片工具",
		mcp.CategoryCode:     "代码工具",
		mcp.CategoryTemplate: "模板工具",
	}

	for category, catTools := range categoryTools {
		catName := categoryNames[category]
		if catName == "" {
			catName = string(category)
		}

		builder.WriteString(fmt.Sprintf("【%s】\n", catName))
		for _, tool := range catTools {
			builder.WriteString(fmt.Sprintf("  • %s: %s\n", tool.Name, tool.Description))
		}
		builder.WriteString("\n")
	}

	return builder.String()
}

// recordSuccess 记录成功调用
func (fc *FunctionCaller) recordSuccess(toolName string, duration time.Duration) {
	fc.mu.Lock()
	defer fc.mu.Unlock()

	fc.stats.TotalCalls++
	fc.stats.SuccessCalls++
	fc.stats.TotalDuration += duration
	fc.stats.ToolCallCounts[toolName]++
}

// recordFailure 记录失败调用
func (fc *FunctionCaller) recordFailure(toolName string) {
	fc.mu.Lock()
	defer fc.mu.Unlock()

	fc.stats.TotalCalls++
	fc.stats.FailedCalls++
}

// GetStats 获取执行统计
func (fc *FunctionCaller) GetStats() *ExecutionStats {
	fc.mu.RLock()
	defer fc.mu.RUnlock()

	// 返回副本
	statsCopy := &ExecutionStats{
		TotalCalls:     fc.stats.TotalCalls,
		SuccessCalls:   fc.stats.SuccessCalls,
		FailedCalls:    fc.stats.FailedCalls,
		TotalDuration:  fc.stats.TotalDuration,
		ToolCallCounts: make(map[string]int64),
	}
	for k, v := range fc.stats.ToolCallCounts {
		statsCopy.ToolCallCounts[k] = v
	}
	return statsCopy
}

// ============================================================================
// 辅助函数
// ============================================================================

// ParseToolCallsFromResponse 从 LLM 响应中解析工具调用
func ParseToolCallsFromResponse(response *ai.LLMResponse) []ToolCallRequest {
	if response == nil || len(response.ToolCalls) == 0 {
		return nil
	}

	requests := make([]ToolCallRequest, len(response.ToolCalls))
	for i, tc := range response.ToolCalls {
		var args map[string]any
		json.Unmarshal([]byte(tc.Function.Arguments), &args)

		requests[i] = ToolCallRequest{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: args,
		}
	}

	return requests
}

// FormatToolResultsForLLM 将工具结果格式化为 LLM 消息
func FormatToolResultsForLLM(results []*ToolCallResult) []ai.LLMMessage {
	messages := make([]ai.LLMMessage, len(results))
	for i, result := range results {
		content := result.Content
		if !result.Success {
			content = fmt.Sprintf("Error: %s", result.Error)
		}

		messages[i] = ai.LLMMessage{
			Role:       "tool",
			Name:       result.Name,
			Content:    content,
			ToolCallID: result.ToolCallID,
		}
	}
	return messages
}
