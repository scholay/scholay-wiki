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
	config := DefaultOrchestratorConfig()

	if config.MaxIterations != 5 {
		t.Errorf("Expected MaxIterations 5, got %d", config.MaxIterations)
	}
	if config.EnablePlanning != false {
		t.Errorf("Expected EnablePlanning false by default")
	}
	if config.AutoFix != true {
		t.Errorf("Expected AutoFix true by default")
	}
	if config.MaxAutoFixAttempts != 3 {
		t.Errorf("Expected MaxAutoFixAttempts 3, got %d", config.MaxAutoFixAttempts)
	}
}

// TestOrchestratorCreation 测试创建 Orchestrator
func TestOrchestratorCreation(t *testing.T) {
	provider := &MockLLMProvider{}
	registry := mcp.NewRegistry()
	config := DefaultOrchestratorConfig()

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
	if orchestrator.validator == nil {
		t.Error("Expected validator to be initialized")
	}
	if orchestrator.functionCaller == nil {
		t.Error("Expected functionCaller to be initialized")
	}
}

// TestOrchestratorRequest 测试请求结构
func TestOrchestratorRequest(t *testing.T) {
	req := &OrchestratorRequest{
		UserPrompt:          "Test prompt",
		CurrentCode:         "\\documentclass{article}",
		ConversationHistory: []ai.LLMMessage{},
		DocumentContext:     "Test context",
		ModelID:             1,
	}

	if req.UserPrompt != "Test prompt" {
		t.Errorf("Expected UserPrompt 'Test prompt', got %s", req.UserPrompt)
	}
	if req.ModelID != 1 {
		t.Errorf("Expected ModelID 1, got %d", req.ModelID)
	}
}

// TestOrchestratorResult 测试结果结构
func TestOrchestratorResult(t *testing.T) {
	result := &OrchestratorResult{
		Success:       true,
		GeneratedCode: "\\documentclass{article}",
		Reply:         "Here is your document",
		ThinkProcess:  "Analyzing request...",
		ToolCalls:     []ToolCallRecord{},
		Iterations:    2,
	}

	if !result.Success {
		t.Error("Expected Success true")
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
	config := DefaultOrchestratorConfig()
	config.EnablePlanning = false // 单 Agent 模式

	orchestrator := NewAgentOrchestrator(provider, registry, config)

	req := &OrchestratorRequest{
		UserPrompt: "创建一个简单的文档",
	}

	result, err := orchestrator.Execute(context.Background(), req)
	if err != nil {
		t.Fatalf("Orchestrator execution failed: %v", err)
	}
	if result == nil {
		t.Fatal("Expected non-nil result")
	}
	if result.GeneratedCode == "" {
		t.Error("Expected generated code")
	}
}

// TestToolCallRecord 测试工具调用记录
func TestToolCallRecord(t *testing.T) {
	record := ToolCallRecord{
		ID:        "test-1",
		ToolName:  "validate_latex",
		Arguments: map[string]interface{}{"code": "test"},
		Result:    "valid",
		Success:   true,
		Duration:  100,
	}

	if record.ID != "test-1" {
		t.Errorf("Expected ID 'test-1', got %s", record.ID)
	}
	if record.Duration != 100 {
		t.Errorf("Expected Duration 100, got %d", record.Duration)
	}
}
