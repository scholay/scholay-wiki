// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"strings"
	"unicode"
)

// TokenCounter provides methods for counting tokens in messages
// This is a simplified implementation. For production, consider using tiktoken or similar libraries
type TokenCounter struct {
	maxContextTokens int
}

// NewTokenCounter creates a new token counter with a maximum context window
func NewTokenCounter(maxContextTokens int) *TokenCounter {
	return &TokenCounter{
		maxContextTokens: maxContextTokens,
	}
}

// EstimateTokenCount estimates the number of tokens in a text
// Simplified approximation: ~4 characters per token for English text
// For more accurate counting, integrate tiktoken or similar library
func (tc *TokenCounter) EstimateTokenCount(text string) int {
	if text == "" {
		return 0
	}

	// Count words as a more accurate baseline
	words := strings.FieldsFunc(text, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsPunct(r)
	})

	// Approximate: 1.3 tokens per word on average
	// Add some overhead for punctuation and special characters
	tokenCount := int(float64(len(words)) * 1.3)

	// Minimum 1 token for non-empty text
	if tokenCount == 0 && len(text) > 0 {
		tokenCount = 1
	}

	return tokenCount
}

// CountMessageTokens counts tokens for a single message including role
func (tc *TokenCounter) CountMessageTokens(message *ConversationMessage) int {
	// Count content tokens
	contentTokens := tc.EstimateTokenCount(message.Content)

	// Add overhead for message structure (role, formatting, etc.)
	// Typical overhead: ~4 tokens per message for formatting
	overhead := 4

	return contentTokens + overhead
}

// GetMessagesWithinTokenLimit returns messages that fit within the token limit
// Messages are processed from newest to oldest, maintaining context window
func (tc *TokenCounter) GetMessagesWithinTokenLimit(messages []ConversationMessage, tokenLimit int) []ConversationMessage {
	if len(messages) == 0 {
		return messages
	}

	var result []ConversationMessage
	totalTokens := 0

	// Process messages from newest to oldest
	for i := len(messages) - 1; i >= 0; i-- {
		message := messages[i]

		// Calculate or use cached token count
		if message.TokenCount == 0 {
			message.TokenCount = tc.CountMessageTokens(&message)
		}

		// Check if adding this message would exceed limit
		if totalTokens+message.TokenCount > tokenLimit {
			break
		}

		totalTokens += message.TokenCount
		// Prepend to maintain chronological order
		result = append([]ConversationMessage{message}, result...)
	}

	return result
}

// BuildContextWindow builds a context window from a message chain
// Applies token limiting while maintaining the most recent context
func (tc *TokenCounter) BuildContextWindow(chain []ConversationMessage) []ConversationMessage {
	return tc.GetMessagesWithinTokenLimit(chain, tc.maxContextTokens)
}

// ShouldTruncateContext determines if the context needs truncation
func (tc *TokenCounter) ShouldTruncateContext(messages []ConversationMessage) bool {
	totalTokens := 0
	for i := range messages {
		if messages[i].TokenCount == 0 {
			messages[i].TokenCount = tc.CountMessageTokens(&messages[i])
		}
		totalTokens += messages[i].TokenCount
	}
	return totalTokens > tc.maxContextTokens
}

// GetTotalTokens calculates total tokens for all messages
func (tc *TokenCounter) GetTotalTokens(messages []ConversationMessage) int {
	totalTokens := 0
	for i := range messages {
		if messages[i].TokenCount == 0 {
			messages[i].TokenCount = tc.CountMessageTokens(&messages[i])
		}
		totalTokens += messages[i].TokenCount
	}
	return totalTokens
}

// CalculateAndCacheTokens calculates token counts for messages and caches them
func (tc *TokenCounter) CalculateAndCacheTokens(messages []ConversationMessage) {
	for i := range messages {
		if messages[i].TokenCount == 0 {
			messages[i].TokenCount = tc.CountMessageTokens(&messages[i])
		}
	}
}
