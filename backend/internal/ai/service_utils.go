// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"fmt"
	"strings"
)

// ConvertMCPToolsToOpenAIFormat converts protocol-agnostic tool definitions
// to OpenAI function calling format.
func ConvertMCPToolsToOpenAIFormat(mcpTools []MCPToolDef) []Tool {
	tools := make([]Tool, 0, len(mcpTools))

	for _, mcpTool := range mcpTools {
		tool := Tool{
			Type: "function",
			Function: ToolFunction{
				Name:        mcpTool.Name,
				Description: mcpTool.Description,
				Parameters:  mcpTool.InputSchema,
			},
		}
		tools = append(tools, tool)
	}

	return tools
}

// FormatPapersForPrompt formats papers list for prompt with flexible limits
func FormatPapersForPrompt(papers []map[string]any) string {
	return FormatPapersForPromptWithLimit(papers, 20, 300)
}

// FormatPapersForPromptWithLimit formats papers with custom limits
func FormatPapersForPromptWithLimit(papers []map[string]any, maxPapers int, maxAbstractLen int) string {
	var builder strings.Builder

	for i, paper := range papers {
		if i >= maxPapers {
			break
		}

		builder.WriteString(fmt.Sprintf("\n### %d. ", i+1))

		// Title
		if title, ok := paper["title"].(string); ok {
			builder.WriteString(title)
		}
		builder.WriteString("\n")

		// Authors (limit to first 3 for brevity)
		if authors, ok := paper["authors"].([]any); ok && len(authors) > 0 {
			builder.WriteString("**作者**: ")
			authorNames := make([]string, 0, len(authors))
			maxAuthors := 3
			for j, author := range authors {
				if j >= maxAuthors {
					authorNames = append(authorNames, "等")
					break
				}
				if authorMap, ok := author.(map[string]any); ok {
					if name, ok := authorMap["name"].(string); ok {
						authorNames = append(authorNames, name)
					}
				}
			}
			builder.WriteString(strings.Join(authorNames, ", "))
			builder.WriteString("\n")
		}

		// Year and venue
		if year, ok := paper["year"].(float64); ok {
			builder.WriteString(fmt.Sprintf("**年份**: %.0f  ", year))
		}
		if venue, ok := paper["venue"].(string); ok && venue != "" {
			builder.WriteString(fmt.Sprintf("**期刊/会议**: %s  ", venue))
		}
		if citationCount, ok := paper["citationCount"].(float64); ok {
			builder.WriteString(fmt.Sprintf("**引用次数**: %.0f", citationCount))
		}
		builder.WriteString("\n")

		// Abstract
		if abstract, ok := paper["abstract"].(string); ok && abstract != "" {
			// Limit abstract length
			if len(abstract) > maxAbstractLen {
				abstract = abstract[:maxAbstractLen] + "..."
			}
			builder.WriteString(fmt.Sprintf("**摘要**: %s\n", abstract))
		}

		builder.WriteString("\n")
	}

	return builder.String()
}

// TruncateContextForLimit truncates context messages to fit within token limit
// Priority: Keep system messages, current query, and current papers; truncate old messages
func TruncateContextForLimit(messages []ChatMessage, maxChars int) []ChatMessage {
	maxContextChars := maxChars - 20000 // Reserve space for response

	// Helper function to get content length
	getContentLength := func(content MessageContent) int {
		if content == nil {
			return 0
		}
		// Handle string content
		if strContent, ok := content.(string); ok {
			return len(strContent)
		}
		// Estimate length for other types (rough estimate)
		return 100
	}

	// Helper function to get content as string for checking
	getContentString := func(content MessageContent) string {
		if strContent, ok := content.(string); ok {
			return strContent
		}
		return ""
	}

	// Calculate total length
	totalChars := 0
	for _, msg := range messages {
		totalChars += getContentLength(msg.Content)
	}

	// If within limit, return as is
	if totalChars <= maxContextChars {
		return messages
	}

	// Strategy: Keep first (system) and last messages, truncate middle
	var result []ChatMessage

	// Always keep system message if exists
	startIdx := 0
	if len(messages) > 0 && messages[0].Role == "system" {
		result = append(result, messages[0])
		startIdx = 1
		maxContextChars -= getContentLength(messages[0].Content)
	}

	// Keep last few messages (current conversation)
	keepLast := 2 // Keep last 2 messages (user query + current context)
	if len(messages)-startIdx > keepLast {
		// Add truncation notice
		result = append(result, ChatMessage{
			Role:    "assistant",
			Content: "[之前的对话历史已被截断以节省空间]",
		})

		// Add last messages
		for i := len(messages) - keepLast; i < len(messages); i++ {
			msg := messages[i]
			contentStr := getContentString(msg.Content)

			// If message contains papers, truncate them
			if strings.Contains(contentStr, "### 1.") && len(contentStr) > 10000 {
				// This is likely a paper list, truncate it
				truncated := contentStr[:5000] + "\n\n[...论文列表已截断...]"
				msg.Content = truncated
			}
			result = append(result, msg)
		}
	} else {
		// Keep all if not many messages
		result = append(result, messages[startIdx:]...)
	}

	return result
}
