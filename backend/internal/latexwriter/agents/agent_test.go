// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agents

import (
	"context"
	"strings"
	"testing"

	"scholar-backend/internal/ai"
)

// MockLLMProvider 用于测试的 Mock LLM Provider
type MockLLMProvider struct {
	responses    []*ai.LLMResponse
	callIndex    int
	modelInfo    *ai.ModelInfo
}

func NewMockProvider() *MockLLMProvider {
	return &MockLLMProvider{
		responses: make([]*ai.LLMResponse, 0),
		modelInfo: &ai.ModelInfo{
			Provider:         "mock",
			Name:             "mock-model",
			MaxContextTokens: 4096,
			MaxOutputTokens:  1024,
		},
	}
}

func (m *MockLLMProvider) AddResponse(content string) {
	m.responses = append(m.responses, &ai.LLMResponse{
		Content: content,
	})
}

func (m *MockLLMProvider) Chat(ctx context.Context, req *ai.LLMRequest) (*ai.LLMResponse, error) {
	if m.callIndex < len(m.responses) {
		resp := m.responses[m.callIndex]
		m.callIndex++
		return resp, nil
	}
	return &ai.LLMResponse{Content: "Default mock response"}, nil
}

func (m *MockLLMProvider) StreamChat(ctx context.Context, req *ai.LLMRequest) (<-chan *ai.LLMStreamChunk, error) {
	ch := make(chan *ai.LLMStreamChunk, 1)
	go func() {
		defer close(ch)
		if m.callIndex < len(m.responses) {
			ch <- &ai.LLMStreamChunk{
				Content: m.responses[m.callIndex].Content,
				Done:    true,
			}
			m.callIndex++
		} else {
			ch <- &ai.LLMStreamChunk{Content: "Default mock stream", Done: true}
		}
	}()
	return ch, nil
}

func (m *MockLLMProvider) ChatWithTools(ctx context.Context, req *ai.LLMRequest, tools []ai.LLMTool) (*ai.LLMResponse, error) {
	return m.Chat(ctx, req)
}

func (m *MockLLMProvider) StreamChatWithTools(ctx context.Context, req *ai.LLMRequest, tools []ai.LLMTool, writer interface{}) (*ai.LLMResponse, error) {
	return m.Chat(ctx, req)
}

func (m *MockLLMProvider) GetModelInfo() *ai.ModelInfo {
	return m.modelInfo
}

func (m *MockLLMProvider) GetProviderName() string {
	return "mock"
}

func (m *MockLLMProvider) SupportsStreaming() bool {
	return true
}

func (m *MockLLMProvider) SupportsTools() bool {
	return true
}

// TestPlannerAgent 测试规划 Agent
func TestPlannerAgent(t *testing.T) {
	provider := NewMockProvider()
	provider.AddResponse(`<plan>
<goal>生成一个 LaTeX 文档</goal>
<steps>
<step index="1">分析用户需求</step>
<step index="2">创建文档结构</step>
<step index="3">编写内容</step>
</steps>
</plan>`)

	planner := NewPlannerAgent(provider)

	// 测试基本属性
	if planner.GetRole() != RolePlanner {
		t.Errorf("Expected role %s, got %s", RolePlanner, planner.GetRole())
	}
	if planner.GetName() != "PlannerAgent" {
		t.Errorf("Expected name PlannerAgent, got %s", planner.GetName())
	}

	// 测试执行
	req := &AgentRequest{
		UserPrompt: "帮我写一篇关于机器学习的论文",
	}
	resp, err := planner.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("Planner execution failed: %v", err)
	}
	if resp.Plan == nil {
		t.Error("Expected plan to be generated")
	}
	if resp.Plan != nil && len(resp.Plan.Steps) != 3 {
		t.Errorf("Expected 3 plan steps, got %d", len(resp.Plan.Steps))
	}
}

// TestCoderAgent 测试编码 Agent
func TestCoderAgent(t *testing.T) {
	provider := NewMockProvider()
	provider.AddResponse(`<code>
\documentclass{article}
\begin{document}
Hello, World!
\end{document}
</code>`)

	coder := NewCoderAgent(provider)

	// 测试基本属性
	if coder.GetRole() != RoleCoder {
		t.Errorf("Expected role %s, got %s", RoleCoder, coder.GetRole())
	}

	// 测试执行
	req := &AgentRequest{
		UserPrompt: "创建一个简单的 LaTeX 文档",
	}
	resp, err := coder.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("Coder execution failed: %v", err)
	}
	if resp.GeneratedCode == "" {
		t.Error("Expected code to be generated")
	}
	if !strings.Contains(resp.GeneratedCode, "\\documentclass") {
		t.Error("Expected generated code to contain \\documentclass")
	}
}

// TestValidatorAgent 测试验证 Agent
func TestValidatorAgent(t *testing.T) {
	provider := NewMockProvider()
	provider.AddResponse(`<validation>
<valid>true</valid>
<score>95</score>
<errors></errors>
<warnings>
<warning>Consider adding more descriptive comments</warning>
</warnings>
</validation>`)

	validator := NewValidatorAgent(provider, false)

	// 测试基本属性
	if validator.GetRole() != RoleValidator {
		t.Errorf("Expected role %s, got %s", RoleValidator, validator.GetRole())
	}

	// 测试执行
	req := &AgentRequest{
		CurrentCode: `\documentclass{article}
\begin{document}
Hello, World!
\end{document}`,
	}
	resp, err := validator.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("Validator execution failed: %v", err)
	}
	if resp.Validation == nil {
		t.Error("Expected validation result")
	}
	if resp.Validation != nil && !resp.Validation.IsValid {
		t.Error("Expected validation to pass")
	}
}

// TestValidatorProgrammaticChecks 测试验证器的程序化检查
func TestValidatorProgrammaticChecks(t *testing.T) {
	provider := NewMockProvider()
	validator := NewValidatorAgent(provider, false)

	tests := []struct {
		name     string
		code     string
		hasError bool
		errType  string
	}{
		{
			name:     "Balanced environments",
			code:     "\\begin{document}\\end{document}",
			hasError: false,
		},
		{
			name:     "Unbalanced environment",
			code:     "\\begin{document}\\begin{itemize}\\end{document}",
			hasError: true,
			errType:  "environment",
		},
		{
			name:     "Balanced brackets",
			code:     "\\frac{1}{2}",
			hasError: false,
		},
		{
			name:     "Unbalanced brackets",
			code:     "\\frac{1{2}",
			hasError: true,
			errType:  "bracket",
		},
		{
			name:     "Contains ctex (forbidden)",
			code:     "\\usepackage{ctex}",
			hasError: true,
			errType:  "package",
		},
		{
			name:     "Chinese without xeCJK",
			code:     "这是中文",
			hasError: true,
			errType:  "chinese",
		},
		{
			name:     "Chinese with xeCJK",
			code:     "\\usepackage{xeCJK}\n这是中文",
			hasError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.programmaticValidation(tt.code)
			if tt.hasError && len(result.Errors) == 0 {
				t.Errorf("Expected errors for %s, got none", tt.name)
			}
			if !tt.hasError && len(result.Errors) > 0 {
				t.Errorf("Expected no errors for %s, got: %v", tt.name, result.Errors)
			}
		})
	}
}

// TestAgentRequest 测试请求结构
func TestAgentRequest(t *testing.T) {
	req := &AgentRequest{
		UserPrompt:          "Test prompt",
		CurrentCode:         "\\documentclass{article}",
		ConversationHistory: []ai.LLMMessage{{Role: "user", Content: "Hello"}},
		Plan:                &Plan{Goal: "Test goal"},
	}

	if req.UserPrompt != "Test prompt" {
		t.Errorf("Expected UserPrompt 'Test prompt', got %s", req.UserPrompt)
	}
	if len(req.ConversationHistory) != 1 {
		t.Errorf("Expected 1 history message, got %d", len(req.ConversationHistory))
	}
}

// TestAgentResponse 测试响应结构
func TestAgentResponse(t *testing.T) {
	resp := &AgentResponse{
		Content:       "Test content",
		GeneratedCode: "\\documentclass{article}",
		Plan: &Plan{
			Goal: "Test goal",
			Steps: []*PlanStep{
				{Index: 1, Description: "Step 1"},
			},
		},
		Validation: &ValidationResult{
			IsValid: true,
			Score:   90,
		},
	}

	if resp.Content != "Test content" {
		t.Errorf("Expected Content 'Test content', got %s", resp.Content)
	}
	if resp.Plan == nil || resp.Plan.Goal != "Test goal" {
		t.Error("Expected Plan with goal 'Test goal'")
	}
	if resp.Validation == nil || !resp.Validation.IsValid {
		t.Error("Expected valid Validation")
	}
}
