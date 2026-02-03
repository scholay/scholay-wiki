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
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// ============================================================================
// Planner Agent
// 负责分析用户需求，制定执行计划
// ============================================================================

// PlannerAgent 规划代理
type PlannerAgent struct {
	*BaseAgent
}

// PlannerSystemPrompt 规划者系统提示词
const PlannerSystemPrompt = `你是一个专业的 LaTeX 论文写作规划专家。你的职责是分析用户的需求，并制定详细的执行计划。

【你的角色】
- 分析用户的写作需求和意图
- 评估任务的复杂度和所需步骤
- 制定清晰、可执行的计划
- 识别可能需要的工具和资源

【输出格式】
你必须使用以下 XML 格式输出：

<think>
在这里分析用户的需求...
- 用户想要做什么？
- 这个任务需要哪些步骤？
- 有什么潜在的挑战？
</think>

<plan>
{
  "summary": "计划的一句话摘要",
  "steps": [
    {
      "index": 1,
      "action": "动作类型",
      "description": "具体描述",
      "tools": ["可能用到的工具"]
    }
  ],
  "complexity": "simple|medium|complex",
  "estimated_tokens": 数字
}
</plan>

<reply>
对用户的友好回复，解释你将如何帮助他们...
</reply>

【动作类型】
可用的动作类型包括：
- "write_section": 撰写某个章节
- "edit_content": 修改现有内容
- "add_formula": 添加数学公式
- "add_table": 添加表格
- "add_figure": 添加图表
- "format_code": 格式化代码
- "fix_error": 修复错误
- "translate": 翻译内容
- "review": 审核内容
- "search_literature": 搜索文献
- "add_citation": 添加引用

【注意事项】
1. 只做规划，不要直接生成代码
2. 计划要具体、可执行
3. 考虑任务的依赖关系
4. 如果任务很简单（如小的修改），也要输出简单的计划`

// NewPlannerAgent 创建规划代理
func NewPlannerAgent(provider ai.LLMProvider) *PlannerAgent {
	return &PlannerAgent{
		BaseAgent: NewBaseAgent(RolePlanner, provider, PlannerSystemPrompt),
	}
}

// Process 处理请求
func (p *PlannerAgent) Process(ctx context.Context, req *AgentRequest) (*AgentResponse, error) {
	startTime := time.Now()

	// 构建消息
	messages := p.BuildMessages(req, "请分析这个请求并制定执行计划。")

	// 调用 LLM
	llmReq := &ai.LLMRequest{
		Messages:    messages,
		Temperature: 0.5, // 较低的温度以获得更一致的规划
		MaxTokens:   2000,
	}

	response, err := p.provider.Chat(ctx, llmReq)
	if err != nil {
		return nil, fmt.Errorf("planner LLM call failed: %w", err)
	}

	// 解析响应
	agentResp := p.parseResponse(response.Content)
	agentResp.Role = RolePlanner
	agentResp.Duration = time.Since(startTime).Milliseconds()
	agentResp.Model = p.provider.GetModelInfo().Name
	agentResp.FinishReason = response.FinishReason

	// 决定下一步
	if agentResp.Plan != nil && len(agentResp.Plan.Steps) > 0 {
		agentResp.NeedsMoreProcessing = true
		agentResp.NextRole = RoleCoder
	}

	return agentResp, nil
}

// StreamProcess 流式处理请求
func (p *PlannerAgent) StreamProcess(ctx context.Context, req *AgentRequest, writer io.Writer) (*AgentResponse, error) {
	startTime := time.Now()

	// 构建消息
	messages := p.BuildMessages(req, "请分析这个请求并制定执行计划。")

	// 调用流式 LLM
	llmReq := &ai.LLMRequest{
		Messages:    messages,
		Temperature: 0.5,
		MaxTokens:   2000,
	}

	response, err := p.provider.StreamChatWithTools(ctx, llmReq, nil, writer)
	if err != nil {
		return nil, fmt.Errorf("planner streaming failed: %w", err)
	}

	// 解析响应
	agentResp := p.parseResponse(response.Content)
	agentResp.Role = RolePlanner
	agentResp.Duration = time.Since(startTime).Milliseconds()
	agentResp.Model = p.provider.GetModelInfo().Name
	agentResp.FinishReason = response.FinishReason

	// 决定下一步
	if agentResp.Plan != nil && len(agentResp.Plan.Steps) > 0 {
		agentResp.NeedsMoreProcessing = true
		agentResp.NextRole = RoleCoder
	}

	return agentResp, nil
}

// parseResponse 解析 LLM 响应
func (p *PlannerAgent) parseResponse(content string) *AgentResponse {
	resp := &AgentResponse{}

	// 解析 <think>
	if thinkStart := strings.Index(content, "<think>"); thinkStart != -1 {
		if thinkEnd := strings.Index(content, "</think>"); thinkEnd > thinkStart {
			resp.Think = strings.TrimSpace(content[thinkStart+7 : thinkEnd])
		}
	}

	// 解析 <plan>
	if planStart := strings.Index(content, "<plan>"); planStart != -1 {
		if planEnd := strings.Index(content, "</plan>"); planEnd > planStart {
			planJSON := strings.TrimSpace(content[planStart+6 : planEnd])
			var plan Plan
			if err := json.Unmarshal([]byte(planJSON), &plan); err == nil {
				resp.Plan = &plan
			} else {
				// 尝试更宽松的解析
				resp.Plan = p.parsePlanFallback(planJSON)
			}
		}
	}

	// 解析 <reply>
	if replyStart := strings.Index(content, "<reply>"); replyStart != -1 {
		if replyEnd := strings.Index(content, "</reply>"); replyEnd > replyStart {
			resp.Reply = strings.TrimSpace(content[replyStart+7 : replyEnd])
		}
	}

	// 如果没有解析到结构化内容，使用原始内容
	if resp.Think == "" && resp.Plan == nil && resp.Reply == "" {
		resp.Reply = content
	}

	return resp
}

// parsePlanFallback 更宽松的计划解析
func (p *PlannerAgent) parsePlanFallback(planJSON string) *Plan {
	// 清理 JSON
	planJSON = strings.TrimSpace(planJSON)
	
	// 尝试修复常见的 JSON 问题
	planJSON = strings.ReplaceAll(planJSON, "'", "\"")
	
	var plan Plan
	if err := json.Unmarshal([]byte(planJSON), &plan); err != nil {
		// 创建一个简单的计划
		return &Plan{
			Summary: "执行用户请求",
			Steps: []PlanStep{
				{
					Index:       1,
					Action:      "process",
					Description: "处理用户请求",
				},
			},
		}
	}
	
	return &plan
}
