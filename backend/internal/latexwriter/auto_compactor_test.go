// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"strings"
	"testing"

	"scholar-backend/internal/ai"
)

// TestAutoCompactConfig 测试自动压缩配置
func TestAutoCompactConfigDefaults(t *testing.T) {
	config := DefaultAutoCompactConfig()

	if config.Threshold != 0.85 {
		t.Errorf("Expected Threshold 0.85, got %f", config.Threshold)
	}
	if config.MinMessagesToKeep != 4 {
		t.Errorf("Expected MinMessagesToKeep 4, got %d", config.MinMessagesToKeep)
	}
	if config.MaxSummaryTokens != 500 {
		t.Errorf("Expected MaxSummaryTokens 500, got %d", config.MaxSummaryTokens)
	}
}

// TestAutoCompactorCreation 测试创建 AutoCompactor
func TestAutoCompactorCreation(t *testing.T) {
	provider := &MockLLMProvider{}
	config := DefaultAutoCompactConfig()

	compactor := NewAutoCompactor(provider, config)

	if compactor == nil {
		t.Fatal("Expected non-nil compactor")
	}
	if compactor.threshold != config.Threshold {
		t.Errorf("Expected threshold %f, got %f", config.Threshold, compactor.threshold)
	}
}

// TestAutoCompactorNeedsCompaction 测试是否需要压缩
func TestAutoCompactorNeedsCompaction(t *testing.T) {
	provider := &MockLLMProvider{}
	config := DefaultAutoCompactConfig()
	config.Threshold = 0.8 // 80% 阈值

	compactor := NewAutoCompactor(provider, config)

	tests := []struct {
		name         string
		currentTokens int
		maxTokens    int
		expected     bool
	}{
		{"Below threshold", 700, 1000, false},
		{"At threshold", 800, 1000, true},
		{"Above threshold", 900, 1000, true},
		{"Zero max tokens", 500, 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := compactor.needsCompaction(tt.currentTokens, tt.maxTokens)
			if result != tt.expected {
				t.Errorf("needsCompaction(%d, %d) = %v, expected %v",
					tt.currentTokens, tt.maxTokens, result, tt.expected)
			}
		})
	}
}

// TestAutoCompactorNoCompactionNeeded 测试不需要压缩的情况
func TestAutoCompactorNoCompactionNeeded(t *testing.T) {
	provider := &MockLLMProvider{}
	config := DefaultAutoCompactConfig()

	compactor := NewAutoCompactor(provider, config)

	// 创建少量消息（不需要压缩）
	messages := []ai.LLMMessage{
		{Role: "user", Content: "Hello"},
		{Role: "assistant", Content: "Hi there!"},
	}

	result, compactResult, err := compactor.CheckAndCompact(context.Background(), messages, 10000)
	if err != nil {
		t.Fatalf("CheckAndCompact failed: %v", err)
	}

	if compactResult.WasCompacted {
		t.Error("Expected no compaction for small message list")
	}
	if len(result) != len(messages) {
		t.Errorf("Expected %d messages, got %d", len(messages), len(result))
	}
}

// TestContextManagerCreation 测试创建 EnhancedContextManager
func TestContextManagerCreation(t *testing.T) {
	provider := &MockLLMProvider{}
	config := DefaultAutoCompactConfig()

	cm := NewEnhancedContextManager(provider, 4096, config)

	if cm == nil {
		t.Fatal("Expected non-nil context manager")
	}
	if cm.maxContextTokens != 4096 {
		t.Errorf("Expected maxContextTokens 4096, got %d", cm.maxContextTokens)
	}
}

// TestContextManagerPrepareContext 测试准备上下文
func TestContextManagerPrepareContext(t *testing.T) {
	provider := &MockLLMProvider{}
	config := DefaultAutoCompactConfig()

	cm := NewEnhancedContextManager(provider, 4096, config)

	systemPrompt := "You are a LaTeX assistant."
	history := []ai.LLMMessage{
		{Role: "user", Content: "Hello"},
		{Role: "assistant", Content: "Hi!"},
	}
	currentPrompt := "Help me with LaTeX"
	additionalContext := "Current document: \\documentclass{article}"

	messages, compactResult, err := cm.PrepareContext(
		context.Background(),
		systemPrompt,
		history,
		currentPrompt,
		additionalContext,
	)
	if err != nil {
		t.Fatalf("PrepareContext failed: %v", err)
	}

	if len(messages) == 0 {
		t.Error("Expected non-empty messages")
	}

	// 检查系统消息
	if messages[0].Role != "system" {
		t.Errorf("Expected first message to be system, got %s", messages[0].Role)
	}

	// 检查系统消息包含系统提示词
	if !strings.Contains(messages[0].Content, systemPrompt) {
		t.Error("Expected system message to contain system prompt")
	}

	// 检查最后一条是用户消息
	lastMsg := messages[len(messages)-1]
	if lastMsg.Role != "user" {
		t.Errorf("Expected last message to be user, got %s", lastMsg.Role)
	}

	// 检查压缩结果
	if compactResult == nil {
		t.Error("Expected non-nil compact result")
	}
}

// TestTokenEstimation 测试 Token 估算
func TestTokenEstimation(t *testing.T) {
	tests := []struct {
		input    string
		minTokens int
		maxTokens int
	}{
		{"", 0, 0},
		{"hello", 1, 5},
		{"hello world", 2, 10},
		{"The quick brown fox jumps over the lazy dog", 5, 20},
		{"这是一段中文文本", 4, 16},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := EstimateTokens(tt.input)
			if result < tt.minTokens || result > tt.maxTokens {
				t.Errorf("EstimateTokens(%q) = %d, expected between %d and %d",
					tt.input, result, tt.minTokens, tt.maxTokens)
			}
		})
	}
}

// TestCompactResult 测试压缩结果结构
func TestCompactResult(t *testing.T) {
	result := &CompactResult{
		WasCompacted:      true,
		OriginalTokens:    1000,
		CompactedTokens:   500,
		MessagesBefore:    10,
		MessagesAfter:     5,
		SummaryGenerated:  "Summary of conversation...",
	}

	if !result.WasCompacted {
		t.Error("Expected WasCompacted true")
	}
	if result.OriginalTokens != 1000 {
		t.Errorf("Expected OriginalTokens 1000, got %d", result.OriginalTokens)
	}
	savedTokens := result.OriginalTokens - result.CompactedTokens
	if savedTokens != 500 {
		t.Errorf("Expected 500 saved tokens, got %d", savedTokens)
	}
}
