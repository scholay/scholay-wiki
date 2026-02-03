// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// ============================================================================
// Validator Agent
// 负责验证 LaTeX 代码的正确性和质量
// ============================================================================

// ValidatorAgent 验证代理
type ValidatorAgent struct {
	*BaseAgent
	strictMode bool // 严格模式：发现任何错误都要求修复
}

// ValidatorSystemPrompt 验证者系统提示词
const ValidatorSystemPrompt = `你是一个专业的 LaTeX 代码验证专家。你的职责是检查 LaTeX 代码的语法正确性和质量。

【你的角色】
- 检查 LaTeX 语法错误
- 验证包的使用是否正确
- 检查环境是否正确配对
- 识别潜在的编译问题
- 评估代码质量

【输出格式】
你必须使用以下 XML 格式输出：

<think>
在这里分析代码...
- 检查了哪些方面？
- 发现了什么问题？
</think>

<validation>
{
  "valid": true/false,
  "errors": [
    {"code": "ERR001", "message": "错误描述", "line": 行号, "context": "相关代码"}
  ],
  "warnings": [
    {"code": "WARN001", "message": "警告描述", "line": 行号, "suggestion": "改进建议"}
  ],
  "suggestions": ["建议1", "建议2"]
}
</validation>

<reply>
对验证结果的总结...
</reply>

如果代码有错误需要修复，还要输出修复后的代码：

<code>
修复后的完整代码（如果有错误需要修复）
</code>

【常见错误类型】
- ERR001: 未闭合的环境（如 \begin{} 没有对应的 \end{}）
- ERR002: 未闭合的括号
- ERR003: 未定义的命令
- ERR004: 缺少必要的包
- ERR005: 不支持的包（如 ctex）
- ERR006: 中文字符但缺少中文支持
- ERR007: 数学公式语法错误
- ERR008: 表格格式错误
- ERR009: 参考文献格式错误
- ERR010: 特殊字符未转义

【警告类型】
- WARN001: 使用了过时的命令
- WARN002: 代码可读性问题
- WARN003: 最佳实践建议
- WARN004: 可能的性能问题

【严格检查项】
1. 所有 \begin{xxx} 必须有对应的 \end{xxx}
2. 所有 { } [ ] ( ) 必须正确配对
3. 数学环境中不能有空行
4. 中文内容必须有 xeCJK 支持
5. 不能使用 ctex 包（在线编译器不支持）`

// NewValidatorAgent 创建验证代理
func NewValidatorAgent(provider ai.LLMProvider, strictMode bool) *ValidatorAgent {
	return &ValidatorAgent{
		BaseAgent:  NewBaseAgent(RoleValidator, provider, ValidatorSystemPrompt),
		strictMode: strictMode,
	}
}

// Process 处理请求
func (v *ValidatorAgent) Process(ctx context.Context, req *AgentRequest) (*AgentResponse, error) {
	startTime := time.Now()

	// 获取要验证的代码
	codeToValidate := v.getCodeToValidate(req)
	if codeToValidate == "" {
		return &AgentResponse{
			Role:    RoleValidator,
			Reply:   "没有需要验证的代码",
			Duration: time.Since(startTime).Milliseconds(),
		}, nil
	}

	// 1. 先进行程序化验证（快速检查）
	programmaticResult := v.programmaticValidation(codeToValidate)

	// 如果程序化验证通过且不是严格模式，可以跳过 AI 验证
	if programmaticResult.Valid && !v.strictMode {
		return &AgentResponse{
			Role:             RoleValidator,
			Reply:            "代码验证通过！语法正确，结构完整。",
			ValidationResult: programmaticResult,
			Duration:         time.Since(startTime).Milliseconds(),
		}, nil
	}

	// 2. 使用 AI 进行深度验证
	messages := v.buildValidationMessages(codeToValidate, programmaticResult)

	llmReq := &ai.LLMRequest{
		Messages:    messages,
		Temperature: 0.3, // 低温度以获得更一致的验证结果
		MaxTokens:   4000,
	}

	response, err := v.provider.Chat(ctx, llmReq)
	if err != nil {
		// AI 验证失败，返回程序化验证结果
		return &AgentResponse{
			Role:             RoleValidator,
			Reply:            "AI 验证不可用，使用程序化验证结果",
			ValidationResult: programmaticResult,
			Duration:         time.Since(startTime).Milliseconds(),
		}, nil
	}

	// 解析响应
	agentResp := v.parseResponse(response.Content)
	agentResp.Role = RoleValidator
	agentResp.Duration = time.Since(startTime).Milliseconds()
	agentResp.Model = v.provider.GetModelInfo().Name
	agentResp.FinishReason = response.FinishReason

	// 合并程序化验证结果
	if agentResp.ValidationResult == nil {
		agentResp.ValidationResult = programmaticResult
	} else {
		v.mergeValidationResults(agentResp.ValidationResult, programmaticResult)
	}

	// 决定下一步
	if agentResp.ValidationResult != nil && !agentResp.ValidationResult.Valid && agentResp.Code != "" {
		// 有修复的代码，需要再次验证
		agentResp.NeedsMoreProcessing = true
		agentResp.NextRole = RoleValidator
	}

	return agentResp, nil
}

// StreamProcess 流式处理请求
func (v *ValidatorAgent) StreamProcess(ctx context.Context, req *AgentRequest, writer io.Writer) (*AgentResponse, error) {
	// 验证通常不需要流式输出，使用非流式处理
	return v.Process(ctx, req)
}

// getCodeToValidate 获取需要验证的代码
func (v *ValidatorAgent) getCodeToValidate(req *AgentRequest) string {
	// 优先使用上一个 Agent 的输出代码
	if req.PreviousOutput != nil && req.PreviousOutput.Code != "" {
		return req.PreviousOutput.Code
	}

	// 其次使用选中的代码
	if req.Context != "" {
		return req.Context
	}

	// 最后使用完整文档
	return req.FullContent
}

// buildValidationMessages 构建验证消息
func (v *ValidatorAgent) buildValidationMessages(code string, programmaticResult *ValidationResult) []ai.LLMMessage {
	messages := []ai.LLMMessage{
		{
			Role:    "system",
			Content: ValidatorSystemPrompt,
		},
	}

	var userContent strings.Builder
	userContent.WriteString("请验证以下 LaTeX 代码：\n\n```latex\n")
	userContent.WriteString(code)
	userContent.WriteString("\n```\n\n")

	// 添加程序化验证结果作为参考
	if len(programmaticResult.Errors) > 0 || len(programmaticResult.Warnings) > 0 {
		userContent.WriteString("【程序化验证已发现的问题】\n")
		for _, err := range programmaticResult.Errors {
			userContent.WriteString(fmt.Sprintf("- 错误: %s (行 %d)\n", err.Message, err.Line))
		}
		for _, warn := range programmaticResult.Warnings {
			userContent.WriteString(fmt.Sprintf("- 警告: %s (行 %d)\n", warn.Message, warn.Line))
		}
		userContent.WriteString("\n请验证这些问题并检查是否有其他问题。\n")
	}

	messages = append(messages, ai.LLMMessage{
		Role:    "user",
		Content: userContent.String(),
	})

	return messages
}

// programmaticValidation 程序化验证
func (v *ValidatorAgent) programmaticValidation(code string) *ValidationResult {
	result := &ValidationResult{
		Valid: true,
	}

	lines := strings.Split(code, "\n")

	// 检查环境配对
	v.checkEnvironmentPairs(lines, result)

	// 检查括号配对
	v.checkBracketPairs(code, result)

	// 检查包的使用
	v.checkPackageUsage(code, result)

	// 检查中文支持
	v.checkChineseSupport(code, result)

	// 检查特殊字符
	v.checkSpecialCharacters(code, result)

	// 更新验证状态
	result.Valid = len(result.Errors) == 0

	return result
}

// checkEnvironmentPairs 检查环境配对
func (v *ValidatorAgent) checkEnvironmentPairs(lines []string, result *ValidationResult) {
	envStack := make([]struct {
		name string
		line int
	}, 0)

	beginRegex := regexp.MustCompile(`\\begin\{([^}]+)\}`)
	endRegex := regexp.MustCompile(`\\end\{([^}]+)\}`)

	for i, line := range lines {
		lineNum := i + 1

		// 查找 \begin
		for _, match := range beginRegex.FindAllStringSubmatch(line, -1) {
			envStack = append(envStack, struct {
				name string
				line int
			}{match[1], lineNum})
		}

		// 查找 \end
		for _, match := range endRegex.FindAllStringSubmatch(line, -1) {
			envName := match[1]
			if len(envStack) == 0 {
				result.Errors = append(result.Errors, ValidationError{
					Code:    "ERR001",
					Message: fmt.Sprintf("\\end{%s} 没有对应的 \\begin{%s}", envName, envName),
					Line:    lineNum,
				})
				continue
			}

			// 弹出栈顶
			top := envStack[len(envStack)-1]
			envStack = envStack[:len(envStack)-1]

			if top.name != envName {
				result.Errors = append(result.Errors, ValidationError{
					Code:    "ERR001",
					Message: fmt.Sprintf("环境不匹配: \\begin{%s} (行 %d) 与 \\end{%s} (行 %d)", top.name, top.line, envName, lineNum),
					Line:    lineNum,
				})
			}
		}
	}

	// 检查未闭合的环境
	for _, env := range envStack {
		result.Errors = append(result.Errors, ValidationError{
			Code:    "ERR001",
			Message: fmt.Sprintf("\\begin{%s} (行 %d) 没有对应的 \\end{%s}", env.name, env.line, env.name),
			Line:    env.line,
		})
	}
}

// checkBracketPairs 检查括号配对
func (v *ValidatorAgent) checkBracketPairs(code string, result *ValidationResult) {
	// 简化检查：只计算括号数量
	curlyOpen := strings.Count(code, "{")
	curlyClose := strings.Count(code, "}")

	if curlyOpen != curlyClose {
		result.Errors = append(result.Errors, ValidationError{
			Code:    "ERR002",
			Message: fmt.Sprintf("花括号不匹配: { 出现 %d 次, } 出现 %d 次", curlyOpen, curlyClose),
		})
	}
}

// checkPackageUsage 检查包的使用
func (v *ValidatorAgent) checkPackageUsage(code string, result *ValidationResult) {
	// 检查是否使用了 ctex（不支持）
	if strings.Contains(code, "\\usepackage{ctex}") ||
		strings.Contains(code, "\\usepackage[") && strings.Contains(code, "ctex") {
		result.Errors = append(result.Errors, ValidationError{
			Code:    "ERR005",
			Message: "ctex 宏包在在线编译器中不可用，请使用 xeCJK 替代",
			Context: "将 \\usepackage{ctex} 替换为 \\usepackage{xeCJK}",
		})
	}

	// 检查是否使用了 inputenc（XeTeX 不需要）
	if strings.Contains(code, "\\usepackage[utf8]{inputenc}") {
		result.Warnings = append(result.Warnings, ValidationWarning{
			Code:       "WARN001",
			Message:    "使用 XeTeX 编译时不需要 inputenc 包",
			Suggestion: "可以移除 \\usepackage[utf8]{inputenc}",
		})
	}
}

// checkChineseSupport 检查中文支持
func (v *ValidatorAgent) checkChineseSupport(code string, result *ValidationResult) {
	// 检查是否包含中文字符
	hasChineseContent := false
	for _, r := range code {
		if r >= 0x4e00 && r <= 0x9fff {
			hasChineseContent = true
			break
		}
	}

	if !hasChineseContent {
		return
	}

	// 检查是否有中文支持
	hasXeCJK := strings.Contains(code, "\\usepackage{xeCJK}")
	hasCTeX := strings.Contains(code, "\\usepackage{ctex}")

	if !hasXeCJK && !hasCTeX {
		result.Errors = append(result.Errors, ValidationError{
			Code:    "ERR006",
			Message: "文档包含中文内容，但未加载中文支持宏包",
			Context: "请添加 \\usepackage{xeCJK}",
		})
	}
}

// checkSpecialCharacters 检查特殊字符
func (v *ValidatorAgent) checkSpecialCharacters(code string, result *ValidationResult) {
	// 检查未转义的特殊字符（在非数学环境中）
	specialChars := []struct {
		char    string
		escaped string
	}{
		{"&", "\\&"},
		{"%", "\\%"},
		{"#", "\\#"},
		{"_", "\\_"},
	}

	// 简单检查：这个实现可以更精确
	for _, sc := range specialChars {
		// 计算原始字符和转义字符的数量
		rawCount := strings.Count(code, sc.char)
		escapedCount := strings.Count(code, sc.escaped)

		// 如果有很多未转义的字符，给出警告
		unescaped := rawCount - escapedCount
		if sc.char == "&" && unescaped > 10 {
			result.Warnings = append(result.Warnings, ValidationWarning{
				Code:       "WARN003",
				Message:    fmt.Sprintf("检测到较多的 %s 字符，请确保在表格外正确转义", sc.char),
				Suggestion: fmt.Sprintf("表格外的 %s 应该写成 %s", sc.char, sc.escaped),
			})
		}
	}
}

// mergeValidationResults 合并验证结果
func (v *ValidatorAgent) mergeValidationResults(target, source *ValidationResult) {
	// 合并错误（去重）
	existingErrors := make(map[string]bool)
	for _, err := range target.Errors {
		existingErrors[err.Code+":"+err.Message] = true
	}
	for _, err := range source.Errors {
		key := err.Code + ":" + err.Message
		if !existingErrors[key] {
			target.Errors = append(target.Errors, err)
		}
	}

	// 合并警告
	existingWarnings := make(map[string]bool)
	for _, warn := range target.Warnings {
		existingWarnings[warn.Code+":"+warn.Message] = true
	}
	for _, warn := range source.Warnings {
		key := warn.Code + ":" + warn.Message
		if !existingWarnings[key] {
			target.Warnings = append(target.Warnings, warn)
		}
	}

	// 更新 Valid 状态
	target.Valid = len(target.Errors) == 0
}

// parseResponse 解析 LLM 响应
func (v *ValidatorAgent) parseResponse(content string) *AgentResponse {
	resp := &AgentResponse{}

	// 解析 <think>
	if thinkStart := strings.Index(content, "<think>"); thinkStart != -1 {
		if thinkEnd := strings.Index(content, "</think>"); thinkEnd > thinkStart {
			resp.Think = strings.TrimSpace(content[thinkStart+7 : thinkEnd])
		}
	}

	// 解析 <validation>
	if valStart := strings.Index(content, "<validation>"); valStart != -1 {
		if valEnd := strings.Index(content, "</validation>"); valEnd > valStart {
			valJSON := strings.TrimSpace(content[valStart+12 : valEnd])
			var valResult ValidationResult
			if err := json.Unmarshal([]byte(valJSON), &valResult); err == nil {
				resp.ValidationResult = &valResult
			}
		}
	}

	// 解析 <reply>
	if replyStart := strings.Index(content, "<reply>"); replyStart != -1 {
		if replyEnd := strings.Index(content, "</reply>"); replyEnd > replyStart {
			resp.Reply = strings.TrimSpace(content[replyStart+7 : replyEnd])
		}
	}

	// 解析 <code>（修复后的代码）
	if codeStart := strings.Index(content, "<code>"); codeStart != -1 {
		if codeEnd := strings.Index(content, "</code>"); codeEnd > codeStart {
			resp.Code = strings.TrimSpace(content[codeStart+6 : codeEnd])
		}
	}

	return resp
}
