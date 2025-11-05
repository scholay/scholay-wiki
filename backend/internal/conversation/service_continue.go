package conversation

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// ContinueConversation continues the conversation with context from previous messages
// It supports multi-turn dialogue with context length control and MCP tool calling
func (s *Service) ContinueConversation(conversationID uint, userQuery string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
	// Determine feature type based on model level
	var featureType string
	switch modelLevel {
	case thirdparty.ModelLevelLow:
		featureType = "ai_chat_normal" // Low uses normal chat
	case thirdparty.ModelLevelMid:
		featureType = "ai_chat_mid"
	case thirdparty.ModelLevelHigh:
		featureType = "ai_chat_high"
	default:
		return fmt.Errorf("invalid model level: %s", modelLevel)
	}

	// Atomically check and increment quota at the beginning
	// This ensures quota is enforced even before the API call starts
	if err := s.subscriptionService.CheckAndIncrementQuota(userID, featureType); err != nil {
		// Return user-friendly error message
		return fmt.Errorf("配额不足：%s", err.Error())
	}
	// Step 1: Get messages for this conversation (permission already checked in handler)
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get messages: %w", err)
	}

	// Step 2: Build context from recent messages (limit to last 5 rounds = 10 messages)
	contextMessages := s.buildContextMessages(messages, 5)

	// Step 3: Add current user query
	contextMessages = append(contextMessages, ai.ChatMessage{
		Role:    "user",
		Content: userQuery,
	})

	// Step 4: Create MCP server for tool calling
	mcpServer := mcp.NewMCPServer(s.scholarManager)
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(mcpTools)

	// Step 5: Add system message for tool usage
	systemMessage := ai.ChatMessage{
		Role: "system",
		Content: `你是一位专业的学术研究助手。你可以使用 search_papers 工具来搜索学术论文。

当用户需要搜索新的论文时，使用 search_papers 工具。
否则，基于对话历史和已有的论文信息回答用户的问题。

重要：调用 search_papers 时，请设置 limit 参数为 40，以返回更多相关论文。

请用中文回答，使用 Markdown 格式。`,
	}
	messagesWithSystem := append([]ai.ChatMessage{systemMessage}, contextMessages...)

	// Step 6: Call AI with tools to get response or tool calls
	// Use low-level model for tool calling to save cost (tool selection doesn't need advanced reasoning)
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(messagesWithSystem, aiTools, "auto", thirdparty.ModelLevelLow)
	if err != nil {
		return fmt.Errorf("AI tool call failed: %w", err)
	}

	// Step 7: Check if AI wants to use tools
	var allPapers []map[string]interface{}
	var totalCount int
	hasToolCalls := false

	if len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		hasToolCalls = true
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			if toolCall.Function.Name == "search_papers" {
				// Parse tool arguments
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
					continue
				}

				// Call MCP tool
				toolRequest := mcp.ToolRequest{
					Name:      toolCall.Function.Name,
					Arguments: args,
				}

				papers, total, err := s.executeMCPToolCall(mcpServer, toolRequest)
				if err != nil {
					fmt.Fprintf(writer, "data: [ERROR] %s\n\n", err.Error())
					if flusher, ok := writer.(interface{ Flush() }); ok {
						flusher.Flush()
					}
					continue
				}

				allPapers = append(allPapers, papers...)
				if total > totalCount {
					totalCount = total
				}
			}
		}

		// Send papers to frontend if any were found
		if len(allPapers) > 0 {
			papersData := map[string]interface{}{
				"papers": allPapers,
				"total":  totalCount,
			}
			papersJSON, _ := json.Marshal(papersData)
			fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
		}
	}

	// Step 8: Generate final AI response
	var finalMessages []ai.ChatMessage
	if hasToolCalls && len(allPapers) > 0 {
		// If we searched for papers, generate analysis including the new papers
		papersForPrompt := ai.FormatPapersForPrompt(allPapers)
		analysisPrompt := fmt.Sprintf(`用户问题：%s

新找到的论文：
%s

请作为资深学术研究专家，基于对话历史和新找到的论文，深入回答用户的问题。

回答要求：
1. 针对性：直接回答用户的具体问题，不要泛泛而谈
2. 深度：提供深入的分析和见解，引用论文中的具体数据和结论
3. 批判性：保持客观，既要指出研究的贡献，也要指出局限性
4. 结构化：使用清晰的 Markdown 格式组织内容
5. **引用规范（非常重要）**：当提到具体论文内容时，必须使用格式：【引用编号：引用的具体内容】

   正确示例：
   - 【引用1：该模型在BERT基准测试中取得了92.3%%的F1分数】显示了其优越性能。
   - 实验结果表明，【引用2：处理速度提升了3倍，内存占用减少了50%%】。

   **回答中至少使用5-10个引用标记**，确保有具体论文支撑。

在回答的最后，提供3-5个延伸思考问题，格式如下：
[FOLLOW_UP_QUESTIONS]
1. 问题文本1
2. 问题文本2
3. 问题文本3
[/FOLLOW_UP_QUESTIONS]

这些问题应该：
- 基于用户当前关注点的自然延伸
- 具有探索性和前瞻性
- 涵盖不同角度（技术、应用、伦理等）
- 能够引发深入讨论

请用 Markdown 格式输出完整的回答。`, userQuery, papersForPrompt)

		finalMessages = []ai.ChatMessage{
			{
				Role:    "system",
				Content: "你是一位专业的学术研究助手，擅长分析和总结学术论文。",
			},
			{
				Role:    "user",
				Content: analysisPrompt,
			},
		}
	} else {
		// No tool calls or no papers found, use conversation context
		finalMessages = messagesWithSystem
	}

	// Step 9: Save user message first (if we found papers)
	if len(allPapers) > 0 {
		// Convert papers to JSON for storage
		papersJSON, _ := json.Marshal(allPapers)
		var papersForDB []map[string]interface{}
		json.Unmarshal(papersJSON, &papersForDB)

		userMessage := &ConversationMessage{
			ConversationID:      conversationID,
			Role:                MessageRoleUser,
			Content:             userQuery,
			SearchQuery:         userQuery,
			SearchResults:       papersForDB,
			SearchResultsTotal:  totalCount,
		}

		if err := s.repo.CreateMessage(userMessage); err != nil {
			fmt.Printf("Warning: failed to save user message with papers: %v\n", err)
		}
	} else {
		// If no papers found, still save user message
		userMessage := &ConversationMessage{
			ConversationID: conversationID,
			Role:           MessageRoleUser,
			Content:        userQuery,
		}

		if err := s.repo.CreateMessage(userMessage); err != nil {
			fmt.Printf("Warning: failed to save user message: %v\n", err)
		}
	}

	// Step 10: Stream AI response and collect content using specified model level
	fullContent, err := s.aiService.StreamChatCompletionAndCollectWithLevel(finalMessages, writer, modelLevel)
	if err != nil {
		return err
	}

	// Note: Usage was already incremented at the beginning with CheckAndIncrementQuota

	// Step 11: Save assistant message to conversation
	assistantMessage := &ConversationMessage{
		ConversationID: conversationID,
		Role:           MessageRoleAssistant,
		Content:        fullContent,
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		fmt.Printf("Warning: failed to save assistant message: %v\n", err)
	}

	return nil
}

// buildContextMessages builds context from recent conversation messages
// It limits the number of rounds and summarizes paper information to control token count
func (s *Service) buildContextMessages(messages []ConversationMessage, maxRounds int) []ai.ChatMessage {
	var contextMessages []ai.ChatMessage

	// Calculate how many messages to include (maxRounds * 2 for user + assistant pairs)
	startIdx := 0
	if len(messages) > maxRounds*2 {
		startIdx = len(messages) - maxRounds*2
	}

	for i := startIdx; i < len(messages); i++ {
		msg := messages[i]

		// Build message content
		var content string
		if msg.Role == MessageRoleUser {
			content = msg.Content

			// Add search results summary if available
			if len(msg.SearchResults) > 0 {
				papersSummary := s.summarizePapers(msg.SearchResults, 10) // Max 10 papers in context
				content += fmt.Sprintf("\n\n[搜索结果摘要：找到 %d 篇论文]\n%s", msg.SearchResultsTotal, papersSummary)
			}
		} else {
			// For assistant messages, truncate if too long (keep first 1000 chars)
			content = msg.Content
			if len(content) > 1000 {
				content = content[:1000] + "..."
			}
		}

		contextMessages = append(contextMessages, ai.ChatMessage{
			Role:    string(msg.Role),
			Content: content,
		})
	}

	return contextMessages
}

// summarizePapers creates a brief summary of papers for context
func (s *Service) summarizePapers(papers []map[string]interface{}, maxPapers int) string {
	var summaries []string

	count := len(papers)
	if count > maxPapers {
		count = maxPapers
	}

	for i := 0; i < count; i++ {
		paper := papers[i]
		title, _ := paper["title"].(string)
		abstract, _ := paper["abstract"].(string)

		// Truncate abstract to first 200 characters
		if len(abstract) > 200 {
			abstract = abstract[:200] + "..."
		}

		summary := fmt.Sprintf("%d. %s\n   摘要：%s", i+1, title, abstract)
		summaries = append(summaries, summary)
	}

	return strings.Join(summaries, "\n\n")
}
