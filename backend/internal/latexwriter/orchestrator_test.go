// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"testing"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
)

// TestOrchestratorConfig 测试配置
func TestOrchestratorConfig(t *testing.T) {
	config := DefaultOrchestratorConfig

	if config.MaxIterations != 10 {
		t.Errorf("Expected MaxIterations 10, got %d", config.MaxIterations)
	}
	if config.EnableMultiAgent != true {
		t.Errorf("Expected EnableMultiAgent true by default")
	}
	if config.MaxContextTokens != 128000 {
		t.Errorf("Expected MaxContextTokens 128000, got %d", config.MaxContextTokens)
	}
}

// TestOrchestratorCreation 测试创建 Orchestrator
func TestOrchestratorCreation(t *testing.T) {
	provider := &MockLLMProvider{}
	registry := mcp.NewRegistry()
	config := DefaultOrchestratorConfig

	orchestrator := NewAgentOrchestrator(provider, registry, config)

	if orchestrator == nil {
		t.Fatal("Expected non-nil orchestrator")
	}
	if orchestrator.planner == nil {
		t.Error("Expected planner to be initialized")
	}
	if orchestrator.coder == nil {
		t.Error("Expected coder to be initialized")
	}
	if orchestrator.functionCaller == nil {
		t.Error("Expected functionCaller to be initialized")
	}
}

// TestOrchestratorRequest 测试请求结构
func TestOrchestratorRequest(t *testing.T) {
	req := &OrchestratorRequest{
		Prompt:              "Test prompt",
		FullContent:        "\\documentclass{article}",
		ConversationHistory: []ai.LLMMessage{},
		Context:            "Test context",
		ModelID:            1,
	}

	if req.Prompt != "Test prompt" {
		t.Errorf("Expected Prompt 'Test prompt', got %s", req.Prompt)
	}
	if req.ModelID != 1 {
		t.Errorf("Expected ModelID 1, got %d", req.ModelID)
	}
}

// TestOrchestratorResult 测试结果结构
func TestOrchestratorResult(t *testing.T) {
	result := &OrchestratorResult{
		Code:       "\\documentclass{article}",
		Reply:      "Here is your document",
		Think:      "Analyzing request...",
		Iterations: 2,
	}

	if result.Code == "" {
		t.Error("Expected non-empty Code")
	}
	if result.Iterations != 2 {
		t.Errorf("Expected 2 iterations, got %d", result.Iterations)
	}
}

// TestOrchestratorSingleAgentMode 测试单 Agent 模式
func TestOrchestratorSingleAgentMode(t *testing.T) {
	provider := &MockLLMProvider{
		responses: []*ai.LLMResponse{
			{
				Content: `<reply>这是一个简单的 LaTeX 文档</reply>
<code>
\documentclass{article}
\begin{document}
Hello, World!
\end{document}
</code>`,
			},
		},
	}
	registry := mcp.NewRegistry()
	config := &OrchestratorConfig{
		EnableMultiAgent: false, // 单 Agent 模式
		MaxIterations:    10,
		MaxContextTokens: 128000,
	}

	orchestrator := NewAgentOrchestrator(provider, registry, config)

	req := &OrchestratorRequest{
		Prompt: "创建一个简单的文档",
	}

	result, err := orchestrator.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("Orchestrator execution failed: %v", err)
	}
	if result == nil {
		t.Fatal("Expected non-nil result")
	}
	if result.Code == "" {
		t.Error("Expected generated code")
	}
}
