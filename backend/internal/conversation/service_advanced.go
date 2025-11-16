package conversation

import (
	"encoding/json"
	"fmt"
	"io"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/thirdparty"
)

// AdvancedSearchAndAnalyze performs AI-powered search using MCP tools and streams results
// It checks quota and uses appropriate model level based on user's subscription
// It also supports conversation context for follow-up searches
func (s *Service) AdvancedSearchAndAnalyze(conversationID uint, query string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
	// Determine feature type based on model level
	var featureType string
	switch modelLevel {
	case thirdparty.ModelLevelLow:
		featureType = "advanced_search_low"
	case thirdparty.ModelLevelMid:
		featureType = "advanced_search_mid"
	case thirdparty.ModelLevelHigh:
		featureType = "advanced_search_high"
	default:
		return fmt.Errorf("invalid model level: %s", modelLevel)
	}

	// Increment usage (quota check already done in handler before SSE started)
	// Use atomic increment to ensure thread safety
	if err := s.subscriptionService.IncrementUsage(userID, featureType); err != nil {
		return fmt.Errorf("failed to increment usage: %w", err)
	}

	// Create MCP server with manager
	// Manager will automatically get API key and base URL from backend config
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 1: Build context from conversation history (last 5 rounds)
	fmt.Printf("[DEBUG] Getting conversation messages for conversation ID: %d\n", conversationID)
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get conversation messages: %w", err)
	}
	fmt.Printf("[DEBUG] Got %d messages for conversation %d\n", len(messages), conversationID)
	contextMessages := s.buildContextMessages(messages, 5)
	fmt.Printf("[DEBUG] Built context with %d messages\n", len(contextMessages))

	// Step 2: Get available MCP tools
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(mcpTools)

	// Step 3: Create messages with system prompt from template
	// Get MCP system prompt template
	mcpSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_mcp_system", nil)
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		fmt.Printf("[WARN] Failed to get MCP system prompt template, using fallback: %v\n", err)
		mcpSystemPrompt = `你是一位专业的学术研究助手，专门帮助用户搜索和分析高质量的学术论文。

**核心任务**:
- 这是一个高级学术论文搜索系统，用户的每个查询都是为了找到相关的高质量学术论文
- 你必须且只能使用 search_papers_advanced 工具来搜索论文（绝对不要使用 search_papers 工具）
- search_papers_advanced 工具支持多关键词搜索（OR运算）、质量筛选和排序
- 不要直接回答问题或解释概念，而是搜索相关论文

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
1. 对于所有用户查询，必须使用 search_papers_advanced 工具（不要使用 search_papers）
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

请务必调用 search_papers_advanced 工具，不要直接回答！`
	}

	systemMessage := ai.ChatMessage{
		Role:    "system",
		Content: mcpSystemPrompt,
	}

	// Add current user query
	contextMessages = append(contextMessages, ai.ChatMessage{
		Role:    "user",
		Content: query,
	})

	// Prepend system message
	initialMessages := append([]ai.ChatMessage{systemMessage}, contextMessages...)

	// Step 4: Call AI with tools to get tool calls
	// Use low-level model for tool calling to save cost (tool selection doesn't need advanced reasoning)
	fmt.Printf("[DEBUG] Calling AI with tools, initial messages count: %d, tools count: %d\n", len(initialMessages), len(aiTools))
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(initialMessages, aiTools, "auto", thirdparty.ModelLevelLow)
	if err != nil {
		fmt.Printf("[ERROR] AI tool call failed: %v\n", err)
		// Send error event to frontend instead of returning error
		fmt.Fprintf(writer, "data: [ERROR] AI工具调用失败: %s\n\n", err.Error())
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}
		// Still try fallback search below
		toolCallResponse = nil
	}

	// Step 5: Execute tool calls and collect results
	var allPapers []map[string]interface{}
	var totalCount int

	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		fmt.Printf("[DEBUG] Found %d tool calls\n", len(toolCallResponse.Choices[0].Message.ToolCalls))
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			fmt.Printf("[DEBUG] Tool call name: %s\n", toolCall.Function.Name)
			fmt.Printf("[DEBUG] Tool call arguments: %s\n", toolCall.Function.Arguments)

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

	// If no papers found, try a simple direct search
	if len(allPapers) == 0 {
		fmt.Printf("[DEBUG] No papers from tool calls, doing direct search\n")
		papers, total, err := s.mcpSearch(query, mcpServer)
		if err != nil {
			return fmt.Errorf("search failed: %w", err)
		}
		allPapers = papers
		totalCount = total
	}

	// Limit papers to top 50 for frontend display and AI analysis
	const maxPapersToShow = 50
	displayPapers := allPapers
	if len(displayPapers) > maxPapersToShow {
		fmt.Printf("[DEBUG] Limiting papers from %d to %d for display and analysis\n", len(allPapers), maxPapersToShow)
		displayPapers = displayPapers[:maxPapersToShow]
	}

	// Step 6: Send papers to frontend (only top 50)
	papersData := map[string]interface{}{
		"papers": displayPapers,
		"total":  totalCount,  // Still show the real total count
	}
	papersJSON, _ := json.Marshal(papersData)
	fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}

	// Save papers to the user message in database (only top 50)
	if err := s.repo.UpdateMessageSearchResults(conversationID, query, displayPapers, totalCount); err != nil {
		fmt.Printf("Warning: failed to save search results to message: %v\n", err)
	}

	// Step 7: Generate AI analysis of the papers and save to database
	fmt.Printf("[DEBUG] Formatting %d papers for AI analysis\n", len(displayPapers))
	// Use more papers for analysis (up to 30) with shorter abstracts
	papersForPrompt := ai.FormatPapersForPromptWithLimit(displayPapers, 30, 200)
	fmt.Printf("[DEBUG] Formatted papers, length: %d characters\n", len(papersForPrompt))

	// Get analysis prompt templates
	analysisSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis_system", nil)
	if err != nil {
		fmt.Printf("[WARN] Failed to get analysis system prompt template, using fallback: %v\n", err)
		analysisSystemPrompt = "你是一位专业的学术研究助手，擅长分析和总结学术论文。"
	}

	analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis", map[string]string{
		"query":  query,
		"papers": papersForPrompt,
	})
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		fmt.Printf("[WARN] Failed to get analysis prompt template, using fallback: %v\n", err)
		analysisPrompt = fmt.Sprintf(`用户查询：%s

找到的论文：
%s

请作为资深学术研究专家，对这些论文进行深入、全面的分析。你的分析应该包括：

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

请用 Markdown 格式输出完整的分析报告。`, query, papersForPrompt)
	}

	analysisMessages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: analysisSystemPrompt,
		},
		{
			Role:    "user",
			Content: analysisPrompt,
		},
	}

	// Apply context truncation to ensure we stay within 128K limit
	const max128K = 128000 * 4 // Roughly 128K tokens * 4 chars per token
	analysisMessages = ai.TruncateContextForLimit(analysisMessages, max128K)

	fmt.Printf("[DEBUG] About to call StreamChatCompletionAndCollectWithLevel, modelLevel: %s, messages count: %d, prompt length: %d\n",
		modelLevel, len(analysisMessages), len(analysisPrompt))

	// Stream AI response and collect full content using specified model level
	fullContent, err := s.aiService.StreamChatCompletionAndCollectWithLevel(analysisMessages, writer, modelLevel)
	if err != nil {
		// 生成友好的错误消息
		friendlyError := "网络异常，请稍后重试。如果问题持续，请联系管理员。"
		fmt.Printf("[ERROR] AI analysis failed: %v\n", err)

		// 将错误消息保存为 assistant 消息，以便历史记录中显示
		errorMessage := &ConversationMessage{
			ConversationID:    conversationID,
			Role:              MessageRoleAssistant,
			Content:           friendlyError,
			FollowUpQuestions: "",
		}

		if saveErr := s.repo.CreateMessage(errorMessage); saveErr != nil {
			fmt.Printf("[WARN] Failed to save error message: %v\n", saveErr)
		}

		// 通过流式接口发送错误消息
		fmt.Fprintf(writer, "data: %s\n\n", friendlyError)
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		return fmt.Errorf("AI analysis failed: %w", err)
	}

	// Note: Usage was already incremented at the beginning

	// Step 8: Clear old follow-up questions from previous messages in this conversation
	if err := s.repo.ClearOldFollowUpQuestions(conversationID); err != nil {
		fmt.Printf("[WARN] Failed to clear old follow-up questions: %v\n", err)
	}

	// Save assistant message to conversation
	// Follow-up questions will be generated on-demand via separate endpoint
	assistantMessage := &ConversationMessage{
		ConversationID:    conversationID,
		Role:              MessageRoleAssistant,
		Content:           fullContent,
		FollowUpQuestions: "", // Will be generated on-demand
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to save assistant message: %v\n", err)
	}

	return nil
}

// generateFollowUpQuestions generates follow-up questions based on the analysis
// Uses low model for cost efficiency and returns all questions at once (non-streaming)
func (s *Service) generateFollowUpQuestions(query string, analysisContent string) (string, error) {
	// Get follow-up questions prompt from database
	followUpSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("follow_up_questions_system", nil)
	if err != nil {
		fmt.Printf("[WARN] Failed to get follow-up questions system prompt, using fallback: %v\n", err)
		followUpSystemPrompt = "你是一位专业的学术研究助手，擅长基于研究分析提出有深度的延伸问题。"
	}

	followUpPrompt, _, err := s.aiService.GetAndRenderPrompt("follow_up_questions", map[string]string{
		"query":    query,
		"analysis": analysisContent,
	})
	if err != nil {
		// Fallback to hardcoded prompt
		fmt.Printf("[WARN] Failed to get follow-up questions prompt, using fallback: %v\n", err)
		followUpPrompt = fmt.Sprintf(`用户查询：%s

已完成的分析：
%s

基于上述分析，请提供3-5个发散性的后续研究问题，格式如下：
[FOLLOW_UP_QUESTIONS]
1. 问题文本1
2. 问题文本2
3. 问题文本3
[/FOLLOW_UP_QUESTIONS]

这些问题应该：
- 基于当前研究的自然延伸
- 具有一定的探索性和前瞻性
- 涵盖不同角度（技术深化、应用拓展、跨领域融合、伦理思考等）
- 能够引发深入讨论
- 每个问题都应该简洁明了，一句话即可

请直接输出问题列表，不要有其他内容。`, query, analysisContent)
	}

	followUpMessages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: followUpSystemPrompt,
		},
		{
			Role:    "user",
			Content: followUpPrompt,
		},
	}

	// Use low model for follow-up questions generation (cost-efficient, non-streaming)
	followUpContent, err := s.aiService.ChatCompletionWithLevel(followUpMessages, thirdparty.ModelLevelLow)
	if err != nil {
		return "", err
	}

	return followUpContent, nil
}

// executeMCPToolCall executes a single MCP tool call and returns papers
func (s *Service) executeMCPToolCall(mcpServer *mcp.MCPServer, toolRequest mcp.ToolRequest) ([]map[string]interface{}, int, error) {
	result, err := mcpServer.CallTool(toolRequest)
	if err != nil {
		return nil, 0, err
	}

	// Parse the MCP response
	if len(result.Content) == 0 {
		return []map[string]interface{}{}, 0, nil
	}

	// The MCP server returns JSON in the text field
	var searchResponse semanticscholar.SearchResponse
	if err := json.Unmarshal([]byte(result.Content[0]["text"].(string)), &searchResponse); err != nil {
		return nil, 0, fmt.Errorf("failed to parse search results: %w", err)
	}

	// Convert papers to map format
	papers := make([]map[string]interface{}, 0, len(searchResponse.Data))
	for _, paper := range searchResponse.Data {
		paperMap := map[string]interface{}{
			"paperId":         paper.PaperID,
			"title":           paper.Title,
			"abstract":        paper.Abstract,
			"year":            paper.Year,
			"citationCount":   paper.CitationCount,
			"url":             paper.URL,
			"venue":           paper.Venue,
			"publicationDate": paper.PublicationDate,
		}

		// Convert authors
		var authors []map[string]interface{}
		for _, author := range paper.Authors {
			authors = append(authors, map[string]interface{}{
				"authorId": author.AuthorID,
				"name":     author.Name,
			})
		}
		paperMap["authors"] = authors

		papers = append(papers, paperMap)
	}

	return papers, searchResponse.Total, nil
}

// mcpSearch performs search using MCP server
func (s *Service) mcpSearch(query string, mcpServer *mcp.MCPServer) ([]map[string]interface{}, int, error) {
	// Use MCP tool to search papers
	toolRequest := mcp.ToolRequest{
		Name: "search_papers",
		Arguments: map[string]interface{}{
			"query":  query,
			"limit":  20,
			"offset": 0,
		},
	}

	return s.executeMCPToolCall(mcpServer, toolRequest)
}

// GetFollowUpQuestions generates and returns follow-up questions for a message
// This is a separate endpoint to avoid including questions in the streaming response
// messageID can be either user message ID or assistant message ID
func (s *Service) GetFollowUpQuestions(conversationID uint, messageID uint, userID uint) (string, error) {
	// Verify conversation belongs to user
	_, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return "", fmt.Errorf("conversation not found: %w", err)
	}

	// Get all messages to find the right user and assistant message pair
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return "", fmt.Errorf("failed to get conversation messages: %w", err)
	}

	// Find the message by ID
	var targetMessage *ConversationMessage
	var targetIndex int
	for i, msg := range messages {
		if msg.ID == messageID {
			targetMessage = &messages[i]
			targetIndex = i
			break
		}
	}

	if targetMessage == nil {
		return "", fmt.Errorf("message not found")
	}

	var userMessage *ConversationMessage
	var assistantMessage *ConversationMessage

	// Determine which is the user message and which is the assistant message
	if targetMessage.Role == MessageRoleUser {
		// If target is user message, find the next assistant message
		userMessage = targetMessage
		for i := targetIndex + 1; i < len(messages); i++ {
			if messages[i].Role == MessageRoleAssistant {
				assistantMessage = &messages[i]
				break
			}
		}
	} else if targetMessage.Role == MessageRoleAssistant {
		// If target is assistant message, find the previous user message
		assistantMessage = targetMessage
		for i := targetIndex - 1; i >= 0; i-- {
			if messages[i].Role == MessageRoleUser {
				userMessage = &messages[i]
				break
			}
		}
	} else {
		return "", fmt.Errorf("invalid message role")
	}

	if userMessage == nil || assistantMessage == nil {
		return "", fmt.Errorf("could not find message pair")
	}

	// Check if follow-up questions already exist in assistant message
	if assistantMessage.FollowUpQuestions != "" {
		fmt.Printf("[DEBUG] Returning cached follow-up questions for assistant message %d\n", assistantMessage.ID)
		return assistantMessage.FollowUpQuestions, nil
	}

	// Get search query from user message
	searchQuery := userMessage.SearchQuery
	if searchQuery == "" {
		searchQuery = userMessage.Content
	}

	if searchQuery == "" {
		return "", fmt.Errorf("no search query found")
	}

	// Generate follow-up questions based on user query and assistant response
	fmt.Printf("[DEBUG] Generating follow-up questions for user query: %s, assistant message ID: %d\n", searchQuery, assistantMessage.ID)
	followUpQuestions, err := s.generateFollowUpQuestions(searchQuery, assistantMessage.Content)
	if err != nil {
		fmt.Printf("[ERROR] Failed to generate follow-up questions: %v\n", err)
		// 返回友好的错误提示，而不是空字符串
		// 这样前端可以显示有意义的错误信息
		return "", fmt.Errorf("网络异常，暂时无法生成延伸问题。请稍后重试")
	}

	// Save to database for caching (save to assistant message)
	if err := s.repo.UpdateMessageFollowUpQuestions(assistantMessage.ID, followUpQuestions); err != nil {
		fmt.Printf("[WARN] Failed to cache follow-up questions: %v\n", err)
		// Don't fail the request, just log the warning
	}

	return followUpQuestions, nil
}
