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

	// Update conversation's model level
	conversation, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation not found: %w", err)
	}
	if conversation.ModelLevel != string(modelLevel) {
		conversation.ModelLevel = string(modelLevel)
		if err := s.repo.UpdateConversation(conversation); err != nil {
			fmt.Printf("Warning: failed to update conversation model level: %v\n", err)
		}
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

	// Step 5: Add system message for tool usage from database template
	mcpSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("continue_conversation_mcp_system", nil)
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		fmt.Printf("[WARN] Failed to get MCP system prompt template for continue conversation, using fallback: %v\n", err)
		mcpSystemPrompt = `你是一位专业的学术研究助手，专门帮助用户搜索和分析高质量的学术论文。

**核心任务**:
- 这是一个高级学术论文搜索系统，用户的每个查询都是为了找到相关的高质量学术论文
- 你必须且只能使用 search_papers_advanced 工具来搜索论文（绝对不要使用 search_papers 工具）
- search_papers_advanced 工具支持多关键词搜索（OR运算）、质量筛选和排序
- 当用户提出新的研究问题或需要查找论文时，使用工具搜索相关论文
- 如果用户只是对已有论文提问或讨论，可以基于对话历史回答

**重要规则**:
⚠️ 永远不要使用 search_papers 工具（这是旧版本，功能有限）
✅ 始终使用 search_papers_advanced 工具（这是新版本，支持多关键词和高级筛选）

**关键词提取策略**:
1. 从用户查询中提取 2-5 个相关的学术关键词
2. 将中文概念转换为对应的英文学术术语
3. 包括同义词和相关术语以提高召回率
4. 示例：
   - "大语言模型的算力需求" → ["large language models", "computational requirements", "GPU training", "model scaling", "compute resources"]
   - "向量搜索算法" → ["vector search", "similarity search", "nearest neighbor", "embedding retrieval", "approximate nearest neighbor"]
   - "Transformer架构" → ["Transformer architecture", "attention mechanism", "self-attention", "BERT", "GPT"]

**工具调用规则**:
1. 对于新的研究查询，必须使用 search_papers_advanced 工具（不要使用 search_papers）
2. 设置合理的参数：
   - keywords: 提取的多个关键词（2-5个）
   - year_from/year_to: 根据查询调整，默认近5年
   - min_citations: 根据领域热度调整（热门领域50+，新兴领域10+）
   - sort_by: 默认 "citationCount:desc" 获取高影响力论文
   - fields_of_study: 如果查询明确涉及特定领域，添加相应筛选
   - limit: 设置为 50-100 以获得充分的结果

**质量控制**:
- 优先返回高引用、近期发表的论文
- 确保论文与查询高度相关
- 通过多关键词组合提高搜索精准度

请用中文回答，使用 Markdown 格式。`
	}

	systemMessage := ai.ChatMessage{
		Role:    "system",
		Content: mcpSystemPrompt,
	}
	messagesWithSystem := append([]ai.ChatMessage{systemMessage}, contextMessages...)

	// Step 6: Call AI with tools to get response or tool calls
	// Use low-level model for tool calling to save cost (tool selection doesn't need advanced reasoning)
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(messagesWithSystem, aiTools, "auto", thirdparty.ModelLevelLow)
	if err != nil {
		fmt.Printf("[ERROR] AI tool call failed: %v\n", err)
		// Send error event to frontend instead of returning error
		fmt.Fprintf(writer, "data: [ERROR] AI工具调用失败: %s\n\n", err.Error())
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}
		// Set toolCallResponse to nil and continue without tool calls
		toolCallResponse = nil
	}

	// Step 7: Check if AI wants to use tools
	var allPapers []map[string]interface{}
	var totalCount int
	hasToolCalls := false

	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		hasToolCalls = true
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			fmt.Printf("[DEBUG] Continue conversation - Tool call: %s\n", toolCall.Function.Name)

			// Support both search_papers and search_papers_advanced
			if toolCall.Function.Name == "search_papers" || toolCall.Function.Name == "search_papers_advanced" {
				// Parse tool arguments
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
					fmt.Printf("[ERROR] Failed to parse tool arguments: %v\n", err)
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
	}

	// Limit papers to top 50 for all purposes (display, storage, analysis)
	const maxPapersLimit = 50
	limitedPapers := allPapers
	if len(limitedPapers) > maxPapersLimit {
		fmt.Printf("[DEBUG] Limiting papers from %d to %d for all purposes\n", len(allPapers), maxPapersLimit)
		limitedPapers = limitedPapers[:maxPapersLimit]
	}

	// Send papers to frontend if any were found
	if len(limitedPapers) > 0 {
		papersData := map[string]interface{}{
			"papers": limitedPapers,
			"total":  totalCount,  // Still show the real total count
		}
		papersJSON, _ := json.Marshal(papersData)
		fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}
	}

	// Step 8: Generate final AI response
	var finalMessages []ai.ChatMessage
	if hasToolCalls && len(limitedPapers) > 0 {

		// If we searched for papers, generate analysis including the new papers
		// Use up to 30 papers with shorter abstracts for analysis (same as AdvancedSearchAndAnalyze)
		papersForPrompt := ai.FormatPapersForPromptWithLimit(limitedPapers, 30, 200)

		// Get analysis system prompt from database
		analysisSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("continue_conversation_analysis_system", nil)
		if err != nil {
			fmt.Printf("[WARN] Failed to get analysis system prompt template for continue conversation, using fallback: %v\n", err)
			analysisSystemPrompt = "你是一位专业的学术研究助手，擅长分析和总结学术论文。"
		}

		// Get analysis prompt from database
		analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("continue_conversation_analysis", map[string]string{
			"query":  userQuery,
			"papers": papersForPrompt,
		})
		if err != nil {
			// Fallback to hardcoded prompt if template not found
			fmt.Printf("[WARN] Failed to get analysis prompt template for continue conversation, using fallback: %v\n", err)
			analysisPrompt = fmt.Sprintf(`用户查询：%s

找到的论文：
%s

请作为资深学术研究专家，基于对话历史和新找到的论文，对用户的查询进行深入、全面的分析。你的分析应该包括：

## 1. 研究领域概览（200-300字）
- 这些论文所属的主要研究领域和细分方向
- 该领域当前的研究热点和发展趋势
- 这些论文在整个领域中的定位和意义

## 2. 核心研究方法与创新点（按论文分析，每篇100-150字）
- 每篇论文采用的核心研究方法和技术路线
- 相比前人工作的创新之处（方法创新、应用创新、理论创新）
- 技术实现的关键突破点和独特优势
- 实验设计的亮点和数据支撑的充分性

## 3. 研究发现与学术贡献（深度分析）
- 各论文的核心发现和主要结论
- 对现有理论或认知的突破或修正
- 实证数据和实验结果的说服力
- 研究结果的普适性和局限性
- 不同论文之间的相互印证或矛盾之处

## 4. 实际应用价值与影响
- 研究成果的实际应用场景和商业价值
- 对产业发展或社会问题的潜在影响
- 技术转化的可行性和实施难度
- 已产生的实际应用案例（如有）

## 5. 研究脉络与发展演进
- 论文之间的引用关系和研究传承
- 研究思路的演进轨迹和方法论发展
- 从早期到近期研究的进步和突破
- 研究范式的转变和新兴方向

## 6. 批判性思考与研究展望
- 现有研究的局限性和不足之处
- 尚未解决的核心问题和研究空白
- 未来可能的研究方向和突破点
- 跨学科融合的可能性

## 7. 与历史对话的关联（如果有历史对话）
- 新论文如何补充或扩展之前讨论的内容
- 与之前提到的研究的关联和对比
- 对之前问题的进一步解答

重要提示：
1. **引用格式（非常重要）**：当提到具体论文的观点、数据或结论时，必须使用以下格式：
   【引用编号：引用的具体内容】

   正确示例：
   - 【引用1：深度学习模型在ImageNet数据集上达到了95%%的准确率】表明该方法效果显著。
   - 研究表明，【引用3：Transformer架构相比CNN减少了40%%的训练时间】。

   错误示例（不要这样做）：
   - 论文1指出深度学习效果很好 [1]  ❌
   - 根据研究[3]，效果提升明显 ❌

   **每个段落至少使用3-5个引用标记**，确保分析有具体的论文支撑。

2. 分析要深入且有洞察力，避免表面化和泛泛而谈
3. 多引用论文中的具体数据、实验结果和关键结论（使用【引用n：内容】格式）
4. 保持客观和批判性思维，指出优点的同时也要指出不足


请用 Markdown 格式输出完整的回答。`, userQuery, papersForPrompt)
		}

		finalMessages = []ai.ChatMessage{
			{
				Role:    "system",
				Content: analysisSystemPrompt,
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
		// Use the already limited papers for storage (consistency with display)
		const maxPapersToStore = 50
		papersToStore := limitedPapers  // Use limitedPapers instead of allPapers
		if len(papersToStore) > maxPapersToStore {
			fmt.Printf("[DEBUG] Limiting papers for storage from %d to %d\n", len(allPapers), maxPapersToStore)
			papersToStore = papersToStore[:maxPapersToStore]
		}

		// Convert papers to JSON for storage
		papersJSON, _ := json.Marshal(papersToStore)
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

	// Apply context truncation to ensure we stay within 128K limit
	const max128K = 128000 * 4 // Roughly 128K tokens * 4 chars per token
	finalMessages = ai.TruncateContextForLimit(finalMessages, max128K)

	// Step 10: Stream AI response and collect content using specified model level
	fullContent, err := s.aiService.StreamChatCompletionAndCollectWithLevel(finalMessages, writer, modelLevel)
	if err != nil {
		return err
	}

	// Step 11: Generate follow-up questions using low model (independent AI call, non-streaming)
	// Only generate if we had tool calls and found papers (i.e., this is a paper-related query)
	var followUpQuestions string
	if hasToolCalls && len(allPapers) > 0 {
		fmt.Printf("[DEBUG] Generating follow-up questions with low model for continue conversation\n")
		followUpQuestions, err = s.generateFollowUpQuestions(userQuery, fullContent)
		if err != nil {
			// Log error but don't fail - follow-up questions are optional
			fmt.Printf("[WARN] Failed to generate follow-up questions: %v\n", err)
		} else if followUpQuestions != "" {
			// Send follow-up questions as a special SSE event (non-streaming, all at once)
			fmt.Fprintf(writer, "data: [FOLLOW_UP_QUESTIONS]%s\n\n", followUpQuestions)
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
		}
	}

	// Note: Usage was already incremented at the beginning with CheckAndIncrementQuota

	// Step 12: Clear old follow-up questions from previous messages in this conversation
	if err := s.repo.ClearOldFollowUpQuestions(conversationID); err != nil {
		fmt.Printf("[WARN] Failed to clear old follow-up questions: %v\n", err)
	}

	// Save assistant message to conversation with follow-up questions in separate field
	assistantMessage := &ConversationMessage{
		ConversationID:    conversationID,
		Role:              MessageRoleAssistant,
		Content:           fullContent,
		FollowUpQuestions: followUpQuestions, // Save in separate field, not in content
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
		isLastMessage := (i == len(messages)-1)

		// Build message content
		var content string
		if msg.Role == MessageRoleUser {
			content = msg.Content

			// Add search results summary if available
			if len(msg.SearchResults) > 0 {
				// For older messages, use fewer papers; for recent messages, keep more
				maxPapersInContext := 5
				if isLastMessage || i >= len(messages)-2 {
					maxPapersInContext = 10 // Keep more papers for recent messages
				}
				papersSummary := s.summarizePapers(msg.SearchResults, maxPapersInContext)
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
