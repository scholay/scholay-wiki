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

// MockLLMProvider 用于测试的 Mock LLM Provider
type MockLLMProvider struct {
	responses []*ai.LLMResponse
	callIndex int
}

func (m *MockLLMProvider) Chat(ctx context.Context, req *ai.LLMRequest) (*ai.LLMResponse, error) {
	if m.callIndex < len(m.responses) {
		resp := m.responses[m.callIndex]
		m.callIndex++
		return resp, nil
	}
	return &ai.LLMResponse{
		Content: "No more mock responses",
	}, nil
}

func (m *MockLLMProvider) StreamChat(ctx context.Context, req *ai.LLMRequest) (<-chan *ai.LLMStreamChunk, error) {
	ch := make(chan *ai.LLMStreamChunk, 1)
	go func() {
		defer close(ch)
		ch <- &ai.LLMStreamChunk{
			Content: "Mock stream response",
			Done:    true,
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
	return &ai.ModelInfo{
		Provider:         "mock",
		Name:             "mock-model",
		MaxContextTokens: 4096,
		MaxOutputTokens:  1024,
	}
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

// TestFunctionCallerProcessToolCalls 测试 FunctionCaller 处理工具调用
func TestFunctionCallerProcessToolCalls(t *testing.T) {
	// 创建 MCP Registry
	registry := mcp.NewRegistry()

	// 创建 FunctionCaller
	mockProvider := &MockLLMProvider{}
	fc := NewFunctionCaller(registry, mockProvider)

	// 测试空工具调用
	results, err := fc.ProcessToolCalls(context.Background(), nil)
	if err != nil {
		t.Errorf("Expected no error for nil tool calls, got: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("Expected 0 results for nil tool calls, got: %d", len(results))
	}

	// 测试空切片
	results, err = fc.ProcessToolCalls(context.Background(), []ai.LLMToolCall{})
	if err != nil {
		t.Errorf("Expected no error for empty tool calls, got: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("Expected 0 results for empty tool calls, got: %d", len(results))
	}
}

// TestFunctionCallerStats 测试 FunctionCaller 统计功能
func TestFunctionCallerStats(t *testing.T) {
	registry := mcp.NewRegistry()
	mockProvider := &MockLLMProvider{}
	fc := NewFunctionCaller(registry, mockProvider)

	stats := fc.GetStats()
	if stats.TotalCalls != 0 {
		t.Errorf("Expected 0 total calls initially, got: %d", stats.TotalCalls)
	}
	if stats.SuccessfulCalls != 0 {
		t.Errorf("Expected 0 successful calls initially, got: %d", stats.SuccessfulCalls)
	}
	if stats.FailedCalls != 0 {
		t.Errorf("Expected 0 failed calls initially, got: %d", stats.FailedCalls)
	}
}

// TestPermissionManager 测试权限管理器
func TestPermissionManager(t *testing.T) {
	pm := NewPermissionManager(nil)

	// 测试默认权限
	level := pm.GetPermission("test_tool", 0, "")
	if level != PermissionAsk {
		t.Errorf("Expected default permission to be 'ask', got: %s", level)
	}

	// 测试设置用户权限
	pm.SetUserPermission(1, "test_tool", PermissionAllow)
	level = pm.GetPermission("test_tool", 1, "")
	if level != PermissionAllow {
		t.Errorf("Expected user permission to be 'allow', got: %s", level)
	}

	// 测试设置会话权限
	pm.SetSessionPermission("session123", "test_tool", PermissionDeny)
	level = pm.GetPermission("test_tool", 1, "session123")
	if level != PermissionDeny {
		t.Errorf("Expected session permission to override user permission, got: %s", level)
	}

	// 测试清除会话权限
	pm.ClearSessionPermissions("session123")
	level = pm.GetPermission("test_tool", 1, "session123")
	if level != PermissionAllow {
		t.Errorf("Expected user permission after clearing session, got: %s", level)
	}
}

// TestAutoCompactConfig 测试自动压缩配置
func TestAutoCompactConfig(t *testing.T) {
	config := DefaultAutoCompactConfig()

	if config.Threshold != 0.85 {
		t.Errorf("Expected default threshold 0.85, got: %f", config.Threshold)
	}
	if config.MinMessagesToKeep != 4 {
		t.Errorf("Expected min messages 4, got: %d", config.MinMessagesToKeep)
	}
}

// TestEstimateTokens 测试 Token 估算
func TestEstimateTokens(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"", 0},
		{"hello", 2},                     // 约 1.25 tokens per word
		{"hello world", 4},               // 2 words
		{"The quick brown fox", 6},       // 4 words
		{"中文测试", 4},                       // 4 个中文字符，每个约 1 token
	}

	for _, tt := range tests {
		result := EstimateTokens(tt.input)
		// 允许 50% 的误差范围
		minExpected := int(float64(tt.expected) * 0.5)
		maxExpected := int(float64(tt.expected) * 1.5)
		if tt.expected > 0 && (result < minExpected || result > maxExpected) {
			t.Errorf("EstimateTokens(%q) = %d, expected around %d", tt.input, result, tt.expected)
		}
	}
}
