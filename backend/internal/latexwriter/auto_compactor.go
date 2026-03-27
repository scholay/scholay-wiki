// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// ============================================================================
// Auto Compactor
// 参考 OpenCode 的 autoCompact 设计，自动压缩对话上下文防止 token 溢出
// ============================================================================

// AutoCompactor 自动上下文压缩器
type AutoCompactor struct {
	// 配置
	threshold       float64      // 触发压缩的 token 使用率阈值（默认 0.85）
	minMessages     int          // 压缩前最少需要的消息数量（默认 6）
	keepRecentCount int          // 始终保留最近的消息数量（默认 4）
	maxRetries      int          // 压缩失败最大重试次数

	// LLM 提供商（用于生成摘要）
	provider ai.LLMProvider

	// 统计
	compactCount     int
	totalTokensSaved int64
}

// AutoCompactConfig 压缩器配置
type AutoCompactConfig struct {
	Threshold       float64 `json:"threshold"`         // 触发阈值（0-1）
	MinMessages     int     `json:"min_messages"`      // 最少消息数
	KeepRecentCount int     `json:"keep_recent_count"` // 保留最近消息数
	MaxRetries      int     `json:"max_retries"`       // 最大重试次数
}

// DefaultAutoCompactConfig 默认配置
var DefaultAutoCompactConfig = &AutoCompactConfig{
	Threshold:       0.85,
	MinMessages:     6,
	KeepRecentCount: 4,
	MaxRetries:      2,
}

// CompactResult 压缩结果
type CompactResult struct {
	Success          bool      `json:"success"`
	OriginalMessages int       `json:"original_messages"`
	CompactedMessages int      `json:"compacted_messages"`
	OriginalTokens   int       `json:"original_tokens"`
	CompactedTokens  int       `json:"compacted_tokens"`
	Summary          string    `json:"summary"`
	CompactedAt      time.Time `json:"compacted_at"`
}

// NewAutoCompactor 创建自动压缩器
func NewAutoCompactor(provider ai.LLMProvider, config *AutoCompactConfig) *AutoCompactor {
	if config == nil {
		config = DefaultAutoCompactConfig
	}

	return &AutoCompactor{
		threshold:       config.Threshold,
		minMessages:     config.MinMessages,
		keepRecentCount: config.KeepRecentCount,
		maxRetries:      config.MaxRetries,
		provider:        provider,
	}
}

// CheckAndCompact 检查是否需要压缩，如果需要则执行压缩
func (ac *AutoCompactor) CheckAndCompact(
	ctx context.Context,
	messages []ai.LLMMessage,
	maxContextTokens int,
) ([]ai.LLMMessage, *CompactResult, error) {
	// 1. 计算当前 token 使用量
	currentTokens := ac.estimateTokens(messages)
	usageRatio := float64(currentTokens) / float64(maxContextTokens)

	slog.Debug("token usage check", "current_tokens", currentTokens, "max_tokens", maxContextTokens, "usage_pct", usageRatio*100)

	// 2. 检查是否需要压缩
	if usageRatio < ac.threshold {
		// 未达到阈值，无需压缩
		return messages, nil, nil
	}

	// 3. 检查消息数量是否足够压缩
	if len(messages) < ac.minMessages {
		slog.Debug("not enough messages to compact", "message_count", len(messages), "min_required", ac.minMessages)
		return messages, nil, nil
	}

	slog.Info("compression threshold reached", "usage_pct", usageRatio*100, "threshold_pct", ac.threshold*100)

	// 4. 执行压缩
	compactedMessages, result, err := ac.compact(ctx, messages)
	if err != nil {
		return messages, nil, fmt.Errorf("compression failed: %w", err)
	}

	// 5. 更新统计
	ac.compactCount++
	ac.totalTokensSaved += int64(result.OriginalTokens - result.CompactedTokens)

	return compactedMessages, result, nil
}

// compact 执行压缩
func (ac *AutoCompactor) compact(ctx context.Context, messages []ai.LLMMessage) ([]ai.LLMMessage, *CompactResult, error) {
	result := &CompactResult{
		OriginalMessages: len(messages),
		OriginalTokens:   ac.estimateTokens(messages),
		CompactedAt:      time.Now(),
	}

	// 1. 分离系统消息和对话消息
	var systemMessage *ai.LLMMessage
	var conversationMessages []ai.LLMMessage

	for i, msg := range messages {
		if msg.Role == "system" && i == 0 {
			systemMessage = &messages[i]
		} else {
			conversationMessages = append(conversationMessages, msg)
		}
	}

	// 2. 计算需要压缩的消息范围
	// 保留最近的 keepRecentCount 条消息
	if len(conversationMessages) <= ac.keepRecentCount {
		// 消息太少，无法压缩
		result.Success = false
		return messages, result, nil
	}

	toCompress := conversationMessages[:len(conversationMessages)-ac.keepRecentCount]
	toKeep := conversationMessages[len(conversationMessages)-ac.keepRecentCount:]

	// 3. 生成摘要
	summary, err := ac.generateSummary(ctx, toCompress)
	if err != nil {
		return messages, result, fmt.Errorf("failed to generate summary: %w", err)
	}

	result.Summary = summary

	// 4. 构建压缩后的消息列表
	var compactedMessages []ai.LLMMessage

	// 添加系统消息
	if systemMessage != nil {
		compactedMessages = append(compactedMessages, *systemMessage)
	}

	// 添加摘要消息
	compactedMessages = append(compactedMessages, ai.LLMMessage{
		Role:    "system",
		Content: fmt.Sprintf("【对话历史摘要】\n以下是之前对话的摘要：\n\n%s\n\n---\n", summary),
	})

	// 添加保留的最近消息
	compactedMessages = append(compactedMessages, toKeep...)

	// 5. 更新结果
	result.Success = true
	result.CompactedMessages = len(compactedMessages)
	result.CompactedTokens = ac.estimateTokens(compactedMessages)

	slog.Info("compression complete",
		"original_messages", result.OriginalMessages, "compacted_messages", result.CompactedMessages,
		"original_tokens", result.OriginalTokens, "compacted_tokens", result.CompactedTokens)

	return compactedMessages, result, nil
}

// generateSummary 生成对话摘要
func (ac *AutoCompactor) generateSummary(ctx context.Context, messages []ai.LLMMessage) (string, error) {
	// 构建摘要提示词
	var conversationText strings.Builder
	for _, msg := range messages {
		role := msg.Role
		if role == "assistant" {
			role = "AI"
		} else if role == "user" {
			role = "用户"
		}

		content := ""
		if c, ok := msg.Content.(string); ok {
			content = c
		}

		// 截断过长的内容
		if len(content) > 1000 {
			content = content[:1000] + "...[内容已截断]"
		}

		conversationText.WriteString(fmt.Sprintf("%s: %s\n\n", role, content))
	}

	summaryPrompt := fmt.Sprintf(`请为以下对话生成一个简洁的摘要。
摘要应该：
1. 保留关键的用户请求和 AI 的重要决策
2. 记录已完成的任务和重要的代码修改
3. 保留任何重要的上下文信息（如文档结构、用户偏好等）
4. 使用简洁的语言，避免冗余

对话内容：
%s

请生成摘要（不超过 500 字）：`, conversationText.String())

	// 调用 LLM 生成摘要
	llmReq := &ai.LLMRequest{
		Messages: []ai.LLMMessage{
			{
				Role:    "user",
				Content: summaryPrompt,
			},
		},
		Temperature: 0.3, // 低温度以获得更一致的输出
		MaxTokens:   800,
	}

	response, err := ac.provider.Chat(ctx, llmReq)
	if err != nil {
		return "", fmt.Errorf("LLM call failed: %w", err)
	}

	return strings.TrimSpace(response.Content), nil
}

// estimateTokens 估算 token 数量
// 使用简单的启发式方法：中文约 2 字符/token，英文约 4 字符/token
func (ac *AutoCompactor) estimateTokens(messages []ai.LLMMessage) int {
	totalChars := 0

	for _, msg := range messages {
		// 角色名
		totalChars += len(msg.Role) + 4 // 加上格式化字符

		// 内容
		if content, ok := msg.Content.(string); ok {
			totalChars += len(content)
		}

		// 工具调用
		for _, tc := range msg.ToolCalls {
			totalChars += len(tc.Function.Name)
			totalChars += len(tc.Function.Arguments)
		}
	}

	// 估算：平均每 3 个字符约 1 个 token（中英文混合）
	return totalChars / 3
}

// GetStats 获取压缩统计
func (ac *AutoCompactor) GetStats() map[string]any {
	return map[string]any{
		"compact_count":     ac.compactCount,
		"total_tokens_saved": ac.totalTokensSaved,
		"threshold":         ac.threshold,
		"min_messages":      ac.minMessages,
		"keep_recent_count": ac.keepRecentCount,
	}
}

// ============================================================================
// 上下文增强器
// 增强现有的 context_enhancer.go
// ============================================================================

// EnhancedContextManager 增强型上下文管理器
// 整合上下文构建和自动压缩
type EnhancedContextManager struct {
	compactor        *AutoCompactor
	maxContextTokens int
}

// NewEnhancedContextManager 创建增强型上下文管理器
func NewEnhancedContextManager(provider ai.LLMProvider, maxContextTokens int, config *AutoCompactConfig) *EnhancedContextManager {
	return &EnhancedContextManager{
		compactor:        NewAutoCompactor(provider, config),
		maxContextTokens: maxContextTokens,
	}
}

// PrepareContext 准备上下文（包含自动压缩）
func (cm *EnhancedContextManager) PrepareContext(
	ctx context.Context,
	systemPrompt string,
	conversationHistory []ai.LLMMessage,
	currentPrompt string,
	additionalContext string,
) ([]ai.LLMMessage, *CompactResult, error) {
	// 1. 构建完整消息列表
	var messages []ai.LLMMessage

	// 系统消息
	if systemPrompt != "" {
		messages = append(messages, ai.LLMMessage{
			Role:    "system",
			Content: systemPrompt,
		})
	}

	// 对话历史
	messages = append(messages, conversationHistory...)

	// 当前用户消息
	userContent := currentPrompt
	if additionalContext != "" {
		userContent = additionalContext + "\n\n" + currentPrompt
	}
	messages = append(messages, ai.LLMMessage{
		Role:    "user",
		Content: userContent,
	})

	// 2. 检查并执行压缩
	compactedMessages, result, err := cm.compactor.CheckAndCompact(ctx, messages, cm.maxContextTokens)
	if err != nil {
		// 压缩失败，使用原始消息但记录警告
		slog.Warn("compression failed", "err", err)
		return messages, nil, nil
	}

	return compactedMessages, result, nil
}

// TruncateToFit 截断消息以适应 token 限制
// 这是一个降级策略，当压缩也无法满足时使用
func (cm *EnhancedContextManager) TruncateToFit(messages []ai.LLMMessage) []ai.LLMMessage {
	currentTokens := cm.compactor.estimateTokens(messages)
	if currentTokens <= cm.maxContextTokens {
		return messages
	}

	// 策略：保留系统消息和最近的对话
	var result []ai.LLMMessage

	// 分离系统消息
	var systemMessages []ai.LLMMessage
	var otherMessages []ai.LLMMessage

	for _, msg := range messages {
		if msg.Role == "system" {
			systemMessages = append(systemMessages, msg)
		} else {
			otherMessages = append(otherMessages, msg)
		}
	}

	// 添加系统消息
	result = append(result, systemMessages...)
	systemTokens := cm.compactor.estimateTokens(systemMessages)

	// 计算剩余空间
	remainingTokens := cm.maxContextTokens - systemTokens

	// 从最新的消息开始添加
	for i := len(otherMessages) - 1; i >= 0 && remainingTokens > 0; i-- {
		msgTokens := cm.compactor.estimateTokens([]ai.LLMMessage{otherMessages[i]})
		if msgTokens <= remainingTokens {
			result = append([]ai.LLMMessage{otherMessages[i]}, result...)
			remainingTokens -= msgTokens
		}
	}

	slog.Info("truncated messages to fit context", "original_count", len(messages), "truncated_count", len(result))
	return result
}
