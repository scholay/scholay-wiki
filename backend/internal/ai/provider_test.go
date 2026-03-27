// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"testing"
)

// TestLLMMessage 测试消息结构
func TestLLMMessage(t *testing.T) {
	msg := LLMMessage{
		Role:    "user",
		Content: "Hello, world!",
	}

	if msg.Role != "user" {
		t.Errorf("Expected role 'user', got %s", msg.Role)
	}
	if msg.Content != "Hello, world!" {
		t.Errorf("Expected content 'Hello, world!', got %s", msg.Content)
	}
}

// TestLLMRequest 测试请求结构
func TestLLMRequest(t *testing.T) {
	req := &LLMRequest{
		Model: "gpt-4",
		Messages: []LLMMessage{
			{Role: "system", Content: "You are helpful"},
			{Role: "user", Content: "Hi"},
		},
		Temperature: 0.7,
		MaxTokens:   1000,
		Stream:      true,
	}

	if req.Model != "gpt-4" {
		t.Errorf("Expected model 'gpt-4', got %s", req.Model)
	}
	if len(req.Messages) != 2 {
		t.Errorf("Expected 2 messages, got %d", len(req.Messages))
	}
	if req.Temperature != 0.7 {
		t.Errorf("Expected temperature 0.7, got %f", req.Temperature)
	}
	if !req.Stream {
		t.Error("Expected stream true")
	}
}

// TestLLMResponse 测试响应结构
func TestLLMResponse(t *testing.T) {
	resp := &LLMResponse{
		Content:      "Hello!",
		FinishReason: "stop",
		Usage: &LLMUsage{
			PromptTokens:     10,
			CompletionTokens: 5,
			TotalTokens:      15,
		},
	}

	if resp.Content != "Hello!" {
		t.Errorf("Expected content 'Hello!', got %s", resp.Content)
	}
	if resp.FinishReason != "stop" {
		t.Errorf("Expected finish reason 'stop', got %s", resp.FinishReason)
	}
	if resp.Usage.TotalTokens != 15 {
		t.Errorf("Expected total tokens 15, got %d", resp.Usage.TotalTokens)
	}
}

// TestLLMTool 测试工具定义
func TestLLMTool(t *testing.T) {
	tool := LLMTool{
		Type: "function",
		Function: &LLMFunction{
			Name:        "validate_latex",
			Description: "Validate LaTeX syntax",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"code": map[string]any{
						"type":        "string",
						"description": "LaTeX code to validate",
					},
				},
				"required": []string{"code"},
			},
		},
	}

	if tool.Type != "function" {
		t.Errorf("Expected type 'function', got %s", tool.Type)
	}
	if tool.Function.Name != "validate_latex" {
		t.Errorf("Expected function name 'validate_latex', got %s", tool.Function.Name)
	}
}

// TestLLMToolCall 测试工具调用
func TestLLMToolCall(t *testing.T) {
	tc := LLMToolCall{
		ID:   "call_123",
		Type: "function",
		Function: &LLMFunctionCall{
			Name:      "validate_latex",
			Arguments: `{"code": "\\documentclass{article}"}`,
		},
	}

	if tc.ID != "call_123" {
		t.Errorf("Expected ID 'call_123', got %s", tc.ID)
	}
	if tc.Function.Name != "validate_latex" {
		t.Errorf("Expected function name 'validate_latex', got %s", tc.Function.Name)
	}
}

// TestLLMStreamChunk 测试流式块
func TestLLMStreamChunk(t *testing.T) {
	chunk := &LLMStreamChunk{
		Content:      "Hello",
		Done:         false,
		FinishReason: "",
	}

	if chunk.Content != "Hello" {
		t.Errorf("Expected content 'Hello', got %s", chunk.Content)
	}
	if chunk.Done {
		t.Error("Expected done to be false")
	}

	// 完成块
	doneChunk := &LLMStreamChunk{
		Content:      "",
		Done:         true,
		FinishReason: "stop",
	}

	if !doneChunk.Done {
		t.Error("Expected done to be true")
	}
	if doneChunk.FinishReason != "stop" {
		t.Errorf("Expected finish reason 'stop', got %s", doneChunk.FinishReason)
	}
}

// TestModelInfo 测试模型信息
func TestModelInfo(t *testing.T) {
	info := &ModelInfo{
		Provider:         "openai",
		Name:             "gpt-4o",
		MaxContextTokens: 128000,
		MaxOutputTokens:  16384,
		SupportsTools:    true,
		SupportsStreaming: true,
	}

	if info.Provider != "openai" {
		t.Errorf("Expected provider 'openai', got %s", info.Provider)
	}
	if info.MaxContextTokens != 128000 {
		t.Errorf("Expected max context 128000, got %d", info.MaxContextTokens)
	}
	if !info.SupportsTools {
		t.Error("Expected tools support")
	}
}

// TestProviderFactory 测试提供商工厂
func TestProviderFactory(t *testing.T) {
	factory := NewProviderFactory()

	if factory == nil {
		t.Fatal("Expected non-nil factory")
	}

	// 测试 OpenAI provider
	openaiProvider := factory.CreateProvider("openai", "gpt-4o", "https://api.openai.com/v1", "test-key")
	if openaiProvider == nil {
		t.Error("Expected non-nil OpenAI provider")
	}
	if openaiProvider.GetProviderName() != "openai" {
		t.Errorf("Expected provider name 'openai', got %s", openaiProvider.GetProviderName())
	}

	// 测试 Anthropic provider
	anthropicProvider := factory.CreateProvider("anthropic", "claude-3-5-sonnet", "https://api.anthropic.com", "test-key")
	if anthropicProvider == nil {
		t.Error("Expected non-nil Anthropic provider")
	}
	if anthropicProvider.GetProviderName() != "anthropic" {
		t.Errorf("Expected provider name 'anthropic', got %s", anthropicProvider.GetProviderName())
	}

	// 测试默认 provider（OpenAI 兼容）
	defaultProvider := factory.CreateProvider("custom", "custom-model", "https://api.example.com/v1", "test-key")
	if defaultProvider == nil {
		t.Error("Expected non-nil default provider")
	}
	// 默认使用 OpenAI 适配器
	if defaultProvider.GetProviderName() != "openai" {
		t.Errorf("Expected default to use openai adapter, got %s", defaultProvider.GetProviderName())
	}
}

// TestChatMessageConversion 测试消息转换
func TestChatMessageConversion(t *testing.T) {
	// ChatMessage -> LLMMessage
	chatMsg := ChatMessage{
		Role:    "user",
		Content: "Hello",
	}
	llmMsg := ChatMessageToLLMMessage(chatMsg)
	if llmMsg.Role != "user" {
		t.Errorf("Expected role 'user', got %s", llmMsg.Role)
	}
	if llmMsg.Content != "Hello" {
		t.Errorf("Expected content 'Hello', got %s", llmMsg.Content)
	}

	// LLMMessage -> ChatMessage
	llmMsg2 := LLMMessage{
		Role:    "assistant",
		Content: "Hi there!",
	}
	chatMsg2 := LLMMessageToChatMessage(llmMsg2)
	if chatMsg2.Role != "assistant" {
		t.Errorf("Expected role 'assistant', got %s", chatMsg2.Role)
	}
	if chatMsg2.Content != "Hi there!" {
		t.Errorf("Expected content 'Hi there!', got %s", chatMsg2.Content)
	}
}

// TestChatMessagesConversion 测试批量消息转换
func TestChatMessagesConversion(t *testing.T) {
	chatMsgs := []ChatMessage{
		{Role: "system", Content: "You are helpful"},
		{Role: "user", Content: "Hi"},
		{Role: "assistant", Content: "Hello!"},
	}

	llmMsgs := ChatMessagesToLLMMessages(chatMsgs)
	if len(llmMsgs) != 3 {
		t.Errorf("Expected 3 messages, got %d", len(llmMsgs))
	}

	llmMsgs2 := []LLMMessage{
		{Role: "user", Content: "Test"},
		{Role: "assistant", Content: "Response"},
	}

	chatMsgs2 := LLMMessagesToChatMessages(llmMsgs2)
	if len(chatMsgs2) != 2 {
		t.Errorf("Expected 2 messages, got %d", len(chatMsgs2))
	}
}
