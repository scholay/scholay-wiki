// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agents

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// ============================================================================
// Coder Agent
// 负责执行具体的 LaTeX 代码生成任务
// ============================================================================

// CoderAgent 编码代理
type CoderAgent struct {
	*BaseAgent
	tools []ai.LLMTool // 可用工具
}

// CoderSystemPrompt 编码者系统提示词
const CoderSystemPrompt = `你是一个专业的 LaTeX 论文写作专家。你的职责是根据规划和用户需求，生成高质量的 LaTeX 代码。

【你的角色】
- 根据计划执行具体的代码生成任务
- 生成符合学术规范的 LaTeX 代码
- 确保代码语法正确、结构清晰
- 处理数学公式、表格、图形等复杂内容

═══════════════════════════════════════════════════════════════════════════════
【⛔ 代码完整性 - 编译会失败如果违反！- 最重要的规则】
═══════════════════════════════════════════════════════════════════════════════

这是最常见的错误！请务必检查每个参数是否完整！

【宏包选项 - 必须完整】
❌ 绝对禁止（会导致编译错误）：
- \documentclass[pt,apaper]{article}    ← 错误！缺少数字
- \documentclass[pt,paper]{article}     ← 错误！缺少数字
- \usepackage[utf]{inputenc}            ← 错误！应该是 utf8
- \usepackage[T]{fontenc}               ← 错误！应该是 T1
- \usepackage[margin=in]{geometry}      ← 错误！缺少数字
- \usepackage[margin=cm]{geometry}      ← 错误！缺少数字

✅ 必须这样写：
- \documentclass[12pt,a4paper]{article}  ← 12pt 不是 pt
- \documentclass[11pt,letterpaper]{article}
- \usepackage[utf8]{inputenc}            ← utf8 不是 utf
- \usepackage[T1]{fontenc}               ← T1 不是 T
- \usepackage[margin=1in]{geometry}      ← 1in 不是 in
- \usepackage[left=2.5cm,right=2.5cm]{geometry}

【数学符号 - 必须完整】
❌ 错误：\beta_, \alpha_, x^, \sigma^, R^
✅ 正确：\beta_0, \alpha_1, x^2, \sigma^2, R^2

【参考文献 - 必须有具体数值】
❌ 错误（会显示为空白或乱码）：
- \textit{Journal}, , (): --.
- volume (), pages --
- APA (), DSM-

✅ 正确（使用真实或示例数值）：
- \textit{Journal}, 2007, 164(5): 942--948.
- volume 42(3), pages 123--145
- APA (2013), DSM-5

【原则】如果不确定数值，使用合理的示例值（如2020年、页码100-120等），不要留下空白或不完整的格式！

═══════════════════════════════════════════════════════════════════════════════

【输出格式】
你必须使用以下 XML 格式输出：

<think>
在这里分析如何实现...
- 需要使用哪些 LaTeX 包？
- 代码结构应该如何组织？
- 有哪些需要注意的地方？
</think>

<reply>
对用户的友好回复，简要说明你做了什么...
</reply>

<code>
这里放置完整的 LaTeX 代码
不要有任何额外的说明、注释（除了必要的 LaTeX 注释）
不要有中文占位符（如"在这里填写xxx"）
这必须是可以直接编译的纯净 LaTeX 代码
</code>

【重要规则】
1. <code> 标签内只能有纯净的 LaTeX 代码
2. 不要在代码中包含：
   - 思考过程
   - 修改建议
   - 中文占位符
   - "请在这里..."等提示文字
3. 代码必须是完整的、可编译的
4. 如果只是修改部分内容，也要输出完整的修改后代码
5. 使用标准的 LaTeX 包，避免罕见的包

【LaTeX 最佳实践】
- 文档类：通常使用 article, report, book
- 数学公式：使用 amsmath, amssymb 包
- 表格：使用 booktabs 获得专业外观
- 图形：使用 graphicx 包
- 引用：使用 BibTeX 格式
- 中文支持：使用 xeCJK（不要使用 ctex）

【中文文档模板】
如果需要中文支持，使用以下方式：
\documentclass{article}
\usepackage{xeCJK}
\setCJKmainfont{Noto Serif CJK SC}
\setCJKsansfont{Noto Sans CJK SC}
\setCJKmonofont{Noto Sans Mono CJK SC}

注意：不要使用 \usepackage{ctex}，在线编译器不支持！`

// NewCoderAgent 创建编码代理
func NewCoderAgent(provider ai.LLMProvider, tools []ai.LLMTool) *CoderAgent {
	return &CoderAgent{
		BaseAgent: NewBaseAgent(RoleCoder, provider, CoderSystemPrompt),
		tools:     tools,
	}
}

// SetTools 设置可用工具
func (c *CoderAgent) SetTools(tools []ai.LLMTool) {
	c.tools = tools
}

// Process 处理请求
func (c *CoderAgent) Process(ctx context.Context, req *AgentRequest) (*AgentResponse, error) {
	startTime := time.Now()

	// 构建附加指令
	additionalInstructions := c.buildAdditionalInstructions(req)

	// 构建消息
	messages := c.BuildMessages(req, additionalInstructions)

	// 调用 LLM（可能带工具）
	llmReq := &ai.LLMRequest{
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   8000, // 代码生成需要更多 token
	}

	var response *ai.LLMResponse
	var err error

	if len(c.tools) > 0 {
		response, err = c.provider.ChatWithTools(ctx, llmReq, c.tools)
	} else {
		response, err = c.provider.Chat(ctx, llmReq)
	}

	if err != nil {
		return nil, fmt.Errorf("coder LLM call failed: %w", err)
	}

	// 解析响应
	agentResp := c.parseResponse(response.Content)
	agentResp.Role = RoleCoder
	agentResp.Duration = time.Since(startTime).Milliseconds()
	agentResp.Model = c.provider.GetModelInfo().Name
	agentResp.FinishReason = response.FinishReason
	agentResp.ToolCalls = response.ToolCalls

	// 如果有工具调用，需要继续处理
	if len(response.ToolCalls) > 0 {
		agentResp.NeedsMoreProcessing = true
		agentResp.NextRole = RoleCoder // 工具执行后继续由 Coder 处理
	}
	// 注意：不再自动发送给 Validator 验证，自动验证功能已废弃

	return agentResp, nil
}

// StreamProcess 流式处理请求
func (c *CoderAgent) StreamProcess(ctx context.Context, req *AgentRequest, writer io.Writer) (*AgentResponse, error) {
	startTime := time.Now()

	// 构建附加指令
	additionalInstructions := c.buildAdditionalInstructions(req)

	// 构建消息
	messages := c.BuildMessages(req, additionalInstructions)

	// 调用流式 LLM
	llmReq := &ai.LLMRequest{
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   8000,
	}

	response, err := c.provider.StreamChatWithTools(ctx, llmReq, c.tools, writer)
	if err != nil {
		return nil, fmt.Errorf("coder streaming failed: %w", err)
	}

	// 解析响应
	agentResp := c.parseResponse(response.Content)
	agentResp.Role = RoleCoder
	agentResp.Duration = time.Since(startTime).Milliseconds()
	agentResp.Model = c.provider.GetModelInfo().Name
	agentResp.FinishReason = response.FinishReason
	agentResp.ToolCalls = response.ToolCalls

	// 决定下一步
	if len(response.ToolCalls) > 0 {
		agentResp.NeedsMoreProcessing = true
		agentResp.NextRole = RoleCoder
	}
	// 注意：不再自动发送给 Validator 验证，自动验证功能已废弃

	return agentResp, nil
}

// buildAdditionalInstructions 构建附加指令
func (c *CoderAgent) buildAdditionalInstructions(req *AgentRequest) string {
	var instructions strings.Builder

	// 如果有执行计划，添加当前步骤
	if req.PreviousOutput != nil && req.PreviousOutput.Plan != nil {
		plan := req.PreviousOutput.Plan
		instructions.WriteString("【执行计划】\n")
		instructions.WriteString(plan.Summary + "\n")
		
		for _, step := range plan.Steps {
			if !step.Completed {
				instructions.WriteString(fmt.Sprintf("\n当前步骤 %d: %s\n", step.Index, step.Description))
				if len(step.Tools) > 0 {
					instructions.WriteString("可用工具: " + strings.Join(step.Tools, ", ") + "\n")
				}
				break
			}
		}
	}

	return instructions.String()
}

// parseResponse 解析 LLM 响应
func (c *CoderAgent) parseResponse(content string) *AgentResponse {
	resp := &AgentResponse{}

	// 解析 <think>
	if thinkStart := strings.Index(content, "<think>"); thinkStart != -1 {
		if thinkEnd := strings.Index(content, "</think>"); thinkEnd > thinkStart {
			resp.Think = strings.TrimSpace(content[thinkStart+7 : thinkEnd])
		}
	}

	// 解析 <reply>
	if replyStart := strings.Index(content, "<reply>"); replyStart != -1 {
		if replyEnd := strings.Index(content, "</reply>"); replyEnd > replyStart {
			resp.Reply = strings.TrimSpace(content[replyStart+7 : replyEnd])
		}
	}

	// 解析 <code>
	if codeStart := strings.Index(content, "<code>"); codeStart != -1 {
		if codeEnd := strings.Index(content, "</code>"); codeEnd > codeStart {
			code := strings.TrimSpace(content[codeStart+6 : codeEnd])
			// 清理代码
			resp.Code = c.sanitizeCode(code)
		}
	}

	// 如果没有解析到 <code>，尝试从 markdown 代码块提取
	if resp.Code == "" {
		resp.Code = c.extractCodeFromMarkdown(content)
	}

	// 如果没有解析到结构化内容，使用原始内容作为回复
	if resp.Think == "" && resp.Reply == "" && resp.Code == "" {
		resp.Reply = content
	}

	return resp
}

// sanitizeCode 清理代码中的非 LaTeX 内容
func (c *CoderAgent) sanitizeCode(code string) string {
	// 移除常见的污染内容
	pollutionPatterns := []string{
		"请注意",
		"注意：",
		"说明：",
		"以下是",
		"这是",
		"我将",
		"我会",
		"根据你的",
		"based on",
		"Here is",
		"The following",
		"请在这里",
		"在这里填写",
		"[待完成]",
		"[TODO]",
	}

	lines := strings.Split(code, "\n")
	var cleanLines []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// 跳过空的注释行
		if trimmed == "%" {
			continue
		}

		// 检查是否包含污染内容
		isPolluted := false
		for _, pattern := range pollutionPatterns {
			if strings.Contains(trimmed, pattern) && !strings.HasPrefix(trimmed, "%") {
				// 如果这一行是说明性文字而不是 LaTeX 代码
				if !strings.HasPrefix(trimmed, "\\") {
					isPolluted = true
					break
				}
			}
		}

		if !isPolluted {
			cleanLines = append(cleanLines, line)
		}
	}

	return strings.TrimSpace(strings.Join(cleanLines, "\n"))
}

// extractCodeFromMarkdown 从 Markdown 代码块提取 LaTeX 代码
func (c *CoderAgent) extractCodeFromMarkdown(content string) string {
	// 尝试提取 ```latex ... ``` 代码块
	latexMarkers := []string{"```latex", "```tex", "```"}
	
	for _, marker := range latexMarkers {
		if start := strings.Index(content, marker); start != -1 {
			content = content[start+len(marker):]
			if end := strings.Index(content, "```"); end != -1 {
				code := strings.TrimSpace(content[:end])
				return c.sanitizeCode(code)
			}
		}
	}

	return ""
}
