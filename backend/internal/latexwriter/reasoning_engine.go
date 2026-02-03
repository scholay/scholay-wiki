// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 推理引擎模块
// 实现多步推理、自我纠错、工具调用循环

package latexwriter

import (
	"context"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// ReasoningEngine 推理引擎
type ReasoningEngine struct {
	aiService      *ai.Service
	mcpRegistry    *mcp.Registry
	validator      *LatexValidator
	config         *AgentConfig
	contextEnhancer *ContextEnhancer
}

// NewReasoningEngine 创建推理引擎
func NewReasoningEngine(aiService *ai.Service, mcpRegistry *mcp.Registry, config *AgentConfig, maxContextTokens int) *ReasoningEngine {
	maxTokens := 128000
	if maxContextTokens > 0 {
		maxTokens = maxContextTokens
	}
	return &ReasoningEngine{
		aiService:       aiService,
		mcpRegistry:     mcpRegistry,
		validator:       NewLatexValidator(),
		config:          config,
		contextEnhancer: NewContextEnhancer(maxTokens),
	}
}

// ReasoningState 推理状态
type ReasoningState string

const (
	StateThinking   ReasoningState = "thinking"
	StateToolCall   ReasoningState = "tool_call"
	StateValidating ReasoningState = "validating"
	StateFixing     ReasoningState = "fixing"
	StateComplete   ReasoningState = "complete"
	StateError      ReasoningState = "error"
)

// ReasoningStep 推理步骤
type ReasoningStep struct {
	StepNumber  int            `json:"step_number"`
	State       ReasoningState `json:"state"`
	Thinking    string         `json:"thinking,omitempty"`
	ToolCalls   []ToolCall     `json:"tool_calls,omitempty"`
	ToolResults []ToolResult   `json:"tool_results,omitempty"`
	Output      string         `json:"output,omitempty"`
	Error       string         `json:"error,omitempty"`
	Duration    time.Duration  `json:"duration"`
}

// ToolCall 工具调用
type ToolCall struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// ToolResult 工具结果
type ToolResult struct {
	Name    string      `json:"name"`
	Success bool        `json:"success"`
	Result  interface{} `json:"result,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ReasoningResult 推理结果
type ReasoningResult struct {
	Success      bool            `json:"success"`
	FinalOutput  string          `json:"final_output"`
	Code         string          `json:"code,omitempty"`
	Steps        []ReasoningStep `json:"steps"`
	TotalSteps   int             `json:"total_steps"`
	TotalTime    time.Duration   `json:"total_time"`
	ValidationOK bool            `json:"validation_ok"`
}

// ReasoningRequest 推理请求
type ReasoningRequest struct {
	UserMessage  string
	FullContent  string
	SelectedText string
	History      []LatexChatMessage
	ModelLevel   thirdparty.ModelLevel
}

// ExecuteReasoning 执行多步推理
func (e *ReasoningEngine) ExecuteReasoning(ctx context.Context, req *ReasoningRequest, writer io.Writer) (*ReasoningResult, error) {
	startTime := time.Now()
	result := &ReasoningResult{
		Steps: []ReasoningStep{},
	}

	maxIterations := 10
	if e.config != nil {
		maxIterations = int(e.config.MaxIterations)
	}

	// 构建增强上下文（预留一半给生成）
	enhancedContext := e.contextEnhancer.BuildEnhancedContext(
		req.FullContent,
		req.SelectedText,
		req.UserMessage,
		req.History,
		e.contextEnhancer.maxTokens/2,
	)

	// 构建系统提示词
	systemPrompt := e.buildSystemPrompt()

	// 主推理循环
	currentOutput := ""
	iteration := 0

	for iteration < maxIterations {
		iteration++
		stepStart := time.Now()

		step := ReasoningStep{
			StepNumber: iteration,
			State:      StateThinking,
		}

		// 1. 调用 LLM 进行推理
		e.writeStatus(writer, fmt.Sprintf("🤔 推理中（步骤 %d/%d）...", iteration, maxIterations))

		messages := e.buildMessages(systemPrompt, enhancedContext, req.UserMessage, currentOutput)
		
		var responseBuilder strings.Builder
		err := e.aiService.StreamChatCompletionWithLevel(messages, &responseBuilder, req.ModelLevel)
		if err != nil {
			step.State = StateError
			step.Error = err.Error()
			result.Steps = append(result.Steps, step)
			result.Success = false
			return result, err
		}

		response := responseBuilder.String()
		step.Output = response

		// 2. 解析响应，检查是否有工具调用
		toolCalls := e.extractToolCalls(response)
		
		if len(toolCalls) > 0 {
			step.State = StateToolCall
			step.ToolCalls = toolCalls
			
			// 执行工具调用
			e.writeStatus(writer, fmt.Sprintf("🔧 调用 %d 个工具...", len(toolCalls)))
			
			for _, tc := range toolCalls {
				toolResult := e.executeToolCall(ctx, tc)
				step.ToolResults = append(step.ToolResults, toolResult)
				
				// 将工具结果添加到上下文
				currentOutput += fmt.Sprintf("\n\n[工具调用: %s]\n结果: %v\n", tc.Name, toolResult.Result)
			}
		}

		// 3. 提取代码并验证
		parsed := ParseAIResponse(response)
		if parsed.Code != "" {
			// 自动验证已禁用 - 用户通过对话或点击"让 AI 修复"按钮手动触发
			result.ValidationOK = true // 跳过验证
			result.Code = parsed.Code
		}

		step.Duration = time.Since(stepStart)
		result.Steps = append(result.Steps, step)

		// 4. 检查是否完成
		if e.isComplete(response, len(toolCalls)) {
			step.State = StateComplete
			break
		}

		// 更新当前输出
		currentOutput = response
	}

	// 收集最终输出
	if len(result.Steps) > 0 {
		lastStep := result.Steps[len(result.Steps)-1]
		result.FinalOutput = lastStep.Output
	}

	result.TotalSteps = len(result.Steps)
	result.TotalTime = time.Since(startTime)
	result.Success = true

	return result, nil
}

// buildSystemPrompt 构建系统提示词
func (e *ReasoningEngine) buildSystemPrompt() string {
	basePrompt := GetSystemPrompt("base")
	
	// 添加工具说明
	toolsPrompt := "\n\n【可用工具】\n你可以调用以下工具来完成任务：\n"
	
	if e.mcpRegistry != nil {
		tools := e.mcpRegistry.ListTools()
		for _, tool := range tools {
			toolsPrompt += fmt.Sprintf("- %s: %s\n", tool.Name, tool.Description)
		}
	}
	
	toolsPrompt += `
要调用工具，请使用以下格式：
<tool_call>
{"name": "工具名称", "arguments": {"参数1": "值1"}}
</tool_call>

工具调用后，会自动返回结果，你可以根据结果继续推理。
`

	// 添加自定义提示词
	if e.config != nil {
		if e.config.SystemPromptOverride != nil && *e.config.SystemPromptOverride != "" {
			basePrompt = *e.config.SystemPromptOverride
		} else if e.config.SystemPromptAppend != nil && *e.config.SystemPromptAppend != "" {
			basePrompt += "\n\n" + *e.config.SystemPromptAppend
		}
	}

	return basePrompt + toolsPrompt
}

// buildMessages 构建消息列表
func (e *ReasoningEngine) buildMessages(systemPrompt, context, userMessage, previousOutput string) []ai.ChatMessage {
	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
	}

	// 添加上下文
	if context != "" {
		messages = append(messages, ai.ChatMessage{
			Role:    "user",
			Content: "【当前文档上下文】\n" + context,
		})
	}

	// 添加之前的输出（如果是多轮推理）
	if previousOutput != "" {
		messages = append(messages, ai.ChatMessage{
			Role:    "assistant",
			Content: previousOutput,
		})
	}

	// 添加用户消息
	messages = append(messages, ai.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	return messages
}

// extractToolCalls 从响应中提取工具调用
func (e *ReasoningEngine) extractToolCalls(response string) []ToolCall {
	var calls []ToolCall
	
	// 匹配 <tool_call>...</tool_call>
	re := regexp.MustCompile(`(?s)<tool_call>\s*(\{.*?\})\s*</tool_call>`)
	matches := re.FindAllStringSubmatch(response, -1)
	
	for _, match := range matches {
		if len(match) > 1 {
			// 解析 JSON
			var tc struct {
				Name      string                 `json:"name"`
				Arguments map[string]interface{} `json:"arguments"`
			}
			// 简单的 JSON 解析（实际应该用 encoding/json）
			jsonStr := match[1]
			// 提取 name
			nameRe := regexp.MustCompile(`"name"\s*:\s*"([^"]+)"`)
			if nameMatch := nameRe.FindStringSubmatch(jsonStr); len(nameMatch) > 1 {
				tc.Name = nameMatch[1]
				tc.Arguments = make(map[string]interface{})
				calls = append(calls, ToolCall{
					Name:      tc.Name,
					Arguments: tc.Arguments,
				})
			}
		}
	}
	
	return calls
}

// executeToolCall 执行工具调用
func (e *ReasoningEngine) executeToolCall(ctx context.Context, tc ToolCall) ToolResult {
	if e.mcpRegistry == nil {
		return ToolResult{
			Name:    tc.Name,
			Success: false,
			Error:   "MCP registry not available",
		}
	}

	result, err := e.mcpRegistry.CallTool(ctx, tc.Name, tc.Arguments)
	if err != nil {
		return ToolResult{
			Name:    tc.Name,
			Success: false,
			Error:   err.Error(),
		}
	}

	return ToolResult{
		Name:    tc.Name,
		Success: result.Success,
		Result:  result.Data,
		Error:   result.Error,
	}
}

// autoFixCode 自动修复代码
func (e *ReasoningEngine) autoFixCode(ctx context.Context, code string, validationResult *ValidationResult, modelLevel thirdparty.ModelLevel, writer io.Writer) string {
	maxRetries := 3
	currentCode := code

	for i := 0; i < maxRetries; i++ {
		if validationResult.Valid {
			return currentCode
		}

		// 构建修复提示
		errorReport := e.validator.FormatValidationResult(validationResult)
		fixMessages := []ai.ChatMessage{
			{
				Role: "system",
				Content: `你是 LaTeX 语法修复专家。用户会提供有语法问题的代码和验证报告。
请修复所有问题，只输出修复后的完整代码，使用 <code>...</code> 包裹。
不要解释，不要省略，输出完整的修复后代码。
特别注意：
1. 确保所有环境正确闭合
2. 不要使用中文字符（除非已配置中文支持）
3. 确保所有括号匹配`,
			},
			{
				Role:    "user",
				Content: fmt.Sprintf("验证报告：\n%s\n\n原始代码：\n```latex\n%s\n```\n\n请修复并输出完整代码。", errorReport, currentCode),
			},
		}

		var fixResponse strings.Builder
		err := e.aiService.StreamChatCompletionWithLevel(fixMessages, &fixResponse, modelLevel)
		if err != nil {
			break
		}

		// 提取修复后的代码
		parsed := ParseAIResponse(fixResponse.String())
		if parsed.Code != "" {
			currentCode = parsed.Code
			validationResult = e.validator.Validate(currentCode)
			
			if validationResult.Valid {
				e.writeStatus(writer, "✅ 代码修复成功！")
				return currentCode
			}
		}
	}

	return currentCode
}

// isComplete 判断推理是否完成
func (e *ReasoningEngine) isComplete(response string, toolCallCount int) bool {
	// 如果没有工具调用且有代码输出，认为完成
	if toolCallCount == 0 {
		parsed := ParseAIResponse(response)
		if parsed.Code != "" || parsed.Reply != "" {
			return true
		}
	}
	
	// 检查是否有明确的结束标记
	if strings.Contains(response, "[任务完成]") ||
	   strings.Contains(response, "[DONE]") ||
	   strings.Contains(response, "</final>") {
		return true
	}
	
	return false
}

// writeStatus 写入状态信息
func (e *ReasoningEngine) writeStatus(writer io.Writer, status string) {
	if writer != nil {
		writer.Write([]byte(fmt.Sprintf("data: %s\n\n", status)))
	}
}

// SelfCorrectingLoop 自我纠错循环
type SelfCorrectingLoop struct {
	engine     *ReasoningEngine
	maxRetries int
}

// NewSelfCorrectingLoop 创建自我纠错循环
func NewSelfCorrectingLoop(engine *ReasoningEngine, maxRetries int) *SelfCorrectingLoop {
	if maxRetries <= 0 {
		maxRetries = 3
	}
	return &SelfCorrectingLoop{
		engine:     engine,
		maxRetries: maxRetries,
	}
}

// CorrectionResult 纠错结果
type CorrectionResult struct {
	Original    string   `json:"original"`
	Corrected   string   `json:"corrected"`
	Iterations  int      `json:"iterations"`
	Errors      []string `json:"errors"`
	IsValid     bool     `json:"is_valid"`
}

// Correct 执行自我纠错
func (l *SelfCorrectingLoop) Correct(ctx context.Context, code string, modelLevel thirdparty.ModelLevel) *CorrectionResult {
	result := &CorrectionResult{
		Original: code,
		Errors:   []string{},
	}

	currentCode := code
	
	for i := 0; i < l.maxRetries; i++ {
		result.Iterations = i + 1
		
		// 验证当前代码
		validation := l.engine.validator.Validate(currentCode)
		
		if validation.Valid {
			result.Corrected = currentCode
			result.IsValid = true
			return result
		}
		
		// 收集错误
		for _, err := range validation.Errors {
			result.Errors = append(result.Errors, fmt.Sprintf("第 %d 轮: %s (行 %d)", i+1, err.Message, err.Line))
		}
		
		// 尝试自动修复
		fixedCode := l.engine.autoFixCode(ctx, currentCode, validation, modelLevel, nil)
		if fixedCode == currentCode {
			// 无法修复，退出
			break
		}
		currentCode = fixedCode
	}

	result.Corrected = currentCode
	result.IsValid = l.engine.validator.Validate(currentCode).Valid
	return result
}
