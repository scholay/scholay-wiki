// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/thirdparty"
)

// getParallelSearchSystemPrompt 生成并行搜索系统提示词（动态计算年份）
func getParallelSearchSystemPrompt() string {
	currentYear := time.Now().Year()
	yearFrom := currentYear - 5
	
	return fmt.Sprintf(`你是一名专业学术研究助手。你需要同时调用两个搜索工具来获取全面的论文结果：

1. search_papers_advanced: 用于获取高引用的经典论文（使用 bulk API，按引用数排序）
   - keywords: 英文学术关键词列表（3-5个关键词，每个关键词应该是独立的学术术语）
   - year_from: "%d"（最近5年起始）
   - year_to: "%d"（当前年份）
   - min_citations: 5（使用较低阈值以获取更多论文）
   - sort_by: "citationCount:desc"
   - fields_of_study: 若用户明确指定领域则填写

2. search_papers_relevance: 用于获取语义相关的最新论文（使用 search API，按相关性排序）
   - query: 英文关键词组合（用空格分隔，如 "hallucination mitigation large language models"，不要用完整句子）
   - year_from: "%d"（最近5年起始）
   - year_to: "%d"（当前年份）
   - fields_of_study: 若用户明确指定领域则填写

关键词生成规则：
- 无论用户使用什么语言，关键词必须是标准英文学术术语
- 关键词应该覆盖：核心概念、研究方法、应用领域
- 避免使用过于宽泛的词（如 "AI", "machine learning"）或过于具体的完整句子
- search_papers_relevance 的 query 应该是 3-6 个关键词的组合，不是完整句子

你必须同时调用这两个工具，不能只调用其中一个。
你的输出必须只包含工具调用，不能有任何解释或文字回答。`, yearFrom, currentYear, yearFrom, currentYear)
}

// ParallelSearchResult 并行搜索结果
type ParallelSearchResult struct {
	Papers     []map[string]interface{}
	TotalCount int
	BulkCount  int // bulk通道获取的论文数
	RelCount   int // relevance通道获取的论文数
}

// AdvancedSearchAndAnalyze 执行基于AI的智能分析（使用MCP工具）并流式返回结果
// 根据用户订阅使用相应的模型级别
// 支持对话上下文以便进行后续分析
// 注意：配额检查已废弃，现在使用货币系统进行扣费控制
func (s *Service) AdvancedSearchAndAnalyze(conversationID uint, query string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
	// Get the user message (it should already exist, created by AddMessage)
	// We need to find the latest user message with this query
	var userMessage *ConversationMessage
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get conversation messages: %w", err)
	}
	
	// Find the latest user message with matching query
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == MessageRoleUser && messages[i].SearchQuery == query {
			userMessage = &messages[i]
			break
		}
	}
	
	if userMessage == nil {
		return fmt.Errorf("user message not found")
	}
	
	userMessageID := userMessage.MessageID
	fmt.Printf("[DEBUG] Found user message with ID: %s\n", userMessageID)

	// Create MCP server with manager
	// Manager will automatically get API key and base URL from backend config
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 1: Build context from conversation history (last 5 rounds)
	// We already have messages from above, no need to fetch again
	fmt.Printf("[DEBUG] Got %d messages for conversation %d\n", len(messages), conversationID)
	contextMessages := s.buildContextMessages(messages, 5)
	fmt.Printf("[DEBUG] Built context with %d messages\n", len(contextMessages))

	// Step 2: Get available MCP tools
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(mcpTools)

	// Step 3: Create messages with system prompt
	// 使用动态生成的并行搜索系统提示词（年份根据当前时间计算）
	fmt.Printf("[PARALLEL-DEBUG] ========== 智能分析开始 ==========\n")
	fmt.Printf("[PARALLEL-DEBUG] 用户查询: %s\n", query)
	currentYear := time.Now().Year()
	fmt.Printf("[PARALLEL-DEBUG] 使用并行搜索系统提示词，年份范围: %d-%d\n", currentYear-5, currentYear)
	mcpSystemPrompt := getParallelSearchSystemPrompt()

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
		// Still try fallback search below, don't send error to frontend yet
		toolCallResponse = nil
	}

	// Step 5: Execute tool calls and collect results with enhanced filtering (并行搜索)
	var allPapers []map[string]interface{}

	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		fmt.Printf("[PARALLEL-DEBUG] 发现 %d 个工具调用\n", len(toolCallResponse.Choices[0].Message.ToolCalls))
		
		// 收集两种搜索的参数
		var bulkArgs, relevanceArgs map[string]interface{}
		
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			fmt.Printf("[PARALLEL-DEBUG] 工具调用: %s\n", toolCall.Function.Name)
			fmt.Printf("[PARALLEL-DEBUG] 工具参数: %s\n", toolCall.Function.Arguments)

			var args map[string]interface{}
			if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
				fmt.Printf("[PARALLEL-DEBUG] 解析工具参数失败: %v\n", err)
				continue
			}

			switch toolCall.Function.Name {
			case "search_papers_advanced", "search_papers":
				bulkArgs = args
				fmt.Printf("[PARALLEL-DEBUG] 收集到 bulk 通道参数\n")
			case "search_papers_relevance":
				relevanceArgs = args
				fmt.Printf("[PARALLEL-DEBUG] 收集到 relevance 通道参数\n")
			}
		}

		// 执行并行搜索
		parallelResult := s.parallelSearchPapers(mcpServer, query, bulkArgs, relevanceArgs)
		allPapers = parallelResult.Papers
		
		fmt.Printf("[PARALLEL-DEBUG] 并行搜索完成: bulk=%d篇, relevance=%d篇, 合并去重后=%d篇\n",
			parallelResult.BulkCount, parallelResult.RelCount, len(allPapers))
	}

	// If no papers found, try a simple direct search
	if len(allPapers) == 0 {
		fmt.Printf("[DEBUG] No papers from tool calls, doing direct search\n")
		papers, _, err := s.mcpSearch(query, mcpServer)
		if err != nil {
			fmt.Printf("[ERROR] Direct search failed: %v\n", err)
			// Send friendly error message
			friendlyError := "网络异常，请稍后重试。如果问题持续，请联系管理员。"
			
			// Save error message to database with parent_message_id
			errorMessage := &ConversationMessage{
				ConversationID:    conversationID,
				ParentMessageID:   &userMessageID,
				Role:              MessageRoleAssistant,
				Content:           friendlyError,
				FollowUpQuestions: "",
			}
			
			if saveErr := s.repo.CreateMessage(errorMessage); saveErr != nil {
				fmt.Printf("[WARN] Failed to save error message: %v\n", saveErr)
			}
			
			// Send error to frontend
			fmt.Fprintf(writer, "data: [ERROR] %s\n\n", friendlyError)
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
			
			return fmt.Errorf("search failed: %w", err)
		}
		// 对直接搜索结果也进行摘要过滤
		papers = FilterPapersWithAbstract(papers)
		allPapers = papers
	}

	// Limit papers to top 100 for frontend display and AI analysis
	const maxPapersToShow = 100
	displayPapers := allPapers
	if len(displayPapers) > maxPapersToShow {
		fmt.Printf("[DEBUG] Limiting papers from %d to %d for display and analysis\n", len(allPapers), maxPapersToShow)
		displayPapers = displayPapers[:maxPapersToShow]
	}

	// Step 6: Extract paper IDs and update user message
	paperIDs := make([]string, 0, len(displayPapers))
	for _, paper := range displayPapers {
		if paperID, ok := paper["paperId"].(string); ok && paperID != "" {
			paperIDs = append(paperIDs, paperID)
		}
	}

	// Save only paper IDs to database (optimized storage)
	// 保存实际筛选后的数量
	if err := s.repo.UpdateMessageSearchPaperIDs(userMessage.ID, paperIDs, len(paperIDs)); err != nil {
		fmt.Printf("Warning: failed to update user message with paper IDs: %v\n", err)
	}

	// Send only paper IDs to frontend (frontend will fetch details via batch API)
	// total 返回实际筛选后的数量，而不是 API 查找的总数
	papersData := map[string]interface{}{
		"paperIds": paperIDs,
		"total":    len(paperIDs), // 返回实际筛选后的数量
	}
	papersJSON, _ := json.Marshal(papersData)
	fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
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
		analysisSystemPrompt = "你是一名具有深厚研究背景的高级学术分析专家，能够对多篇论文进行深入解读、方法分析、研究发现抽象、理论联系与批判性整合，并以学术写作风格输出高质量分析报告。"
	}

	analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis", map[string]string{
		"query":  query,
		"papers": papersForPrompt,
	})
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		fmt.Printf("[WARN] Failed to get analysis prompt template, using fallback: %v\n", err)
		analysisPrompt = fmt.Sprintf(`用户查询：%s
找到的论文：%s

请作为一名具备跨领域知识的资深学术研究专家，对以上论文进行深度整合分析，并给出具有洞察力、逻辑严密、贴合用户问题的学术级解读。

你的输出必须遵守以下原则：

一、输出结构不固定
你不需要使用预定义的标题，也不需要每次遵循同样的段落结构。
你应根据用户的查询内容、论文主题性质、研究领域特点，自主决定分析的组织方式。
输出形式可以是：
	•	连贯的长文
	•	分层的分析段落
	•	自定义的小节
	•	或混合结构
但必须确保内容严谨、有逻辑、有深度。

二、分析范围必须覆盖以下六大方面（但无需按固定标题呈现）
你要在整份分析中自然体现以下内容，但你可以自由组织顺序、结构与表达方式：
	1.	研究领域背景、核心问题、发展趋势
	2.	各论文的方法、技术路线与创新点
	3.	论文的发现、结论与学术贡献
	4.	实际应用价值、实践意义、产业影响
	5.	研究脉络、方法演进、论文之间的逻辑关系
	6.	批判性观点、研究不足与未来方向
这些内容要以“自然流畅、连贯而不刻意分段”的方式融入分析。

三、引用格式必须严格使用以下形式
【引用编号：具体内容】
所有论述性内容必须通过引用论文中的数据、方法、结论或关键描述进行支撑。
每一部分分析都必须至少使用 3–5 个引用标记。
引用必须具体，例如：
【引用3：模型在XXX数据集上提升了12.5%】
而不是模糊表达。

四、分析必须基于论文内容本身
	•	不得编造不存在的论文结论
	•	不得使用无引用支持的判断
	•	必须结合论文中的数据、实验结果、方法细节
	•	必须保持学术严谨性和批判性

五、写作风格要求
	•	像一位 senior researcher 的深度综述
	•	不复述论文摘要，而是给“洞察”与“分析”
	•	不空洞、不堆叠句子
	•	强调交叉比较、研究关系、理论意义、应用前景
	•	在整体布局上做到自然流畅、有张力、有逻辑

六、最终输出
	•	使用 Markdown 格式
	•	无固定标题框架
	•	完全由你自由组织结构
	•	内容必须覆盖上述六大分析面向，但表达形式由你决定
	•	引用规范必须严格遵守

请开始你的深度综合分析。`, query, papersForPrompt)
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
			ParentMessageID:   &userMessageID,
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

	// Save assistant message to conversation with parent_message_id
	// Follow-up questions will be generated on-demand via separate endpoint
	assistantMessage := &ConversationMessage{
		ConversationID:    conversationID,
		ParentMessageID:   &userMessageID, // Link to user message
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

		// Add TLDR if available
		if paper.TLDR != nil {
			paperMap["tldr"] = map[string]interface{}{
				"model": paper.TLDR.Model,
				"text":  paper.TLDR.Text,
			}
		}

		// Add externalIds if available
		if paper.ExternalIDs != nil {
			paperMap["externalIds"] = paper.ExternalIDs
		}

		// Add fieldsOfStudy if available
		if paper.FieldsOfStudy != nil {
			paperMap["fieldsOfStudy"] = paper.FieldsOfStudy
		}

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

// parallelSearchPapers 并行执行两种搜索策略
func (s *Service) parallelSearchPapers(
	mcpServer *mcp.MCPServer,
	userQuery string,
	bulkArgs map[string]interface{},
	relevanceArgs map[string]interface{},
) *ParallelSearchResult {
	fmt.Printf("[PARALLEL-DEBUG] ========== 并行搜索开始 ==========\n")
	fmt.Printf("[PARALLEL-DEBUG] bulk 参数: %+v\n", bulkArgs)
	fmt.Printf("[PARALLEL-DEBUG] relevance 参数: %+v\n", relevanceArgs)

	var wg sync.WaitGroup
	var bulkResult, relevanceResult *PaperFilterResult
	var bulkErr, relevanceErr error

	// 通道1: search_papers_advanced (bulk API) - 高引用论文
	if bulkArgs != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fmt.Printf("[PARALLEL-DEBUG] 通道1 (bulk) 开始执行...\n")
			bulkResult, bulkErr = s.SearchAndFilterPapers(mcpServer, bulkArgs, userQuery, DefaultPaperFilterConfig)
			if bulkErr != nil {
				fmt.Printf("[PARALLEL-DEBUG] 通道1 (bulk) 错误: %v\n", bulkErr)
			} else {
				fmt.Printf("[PARALLEL-DEBUG] 通道1 (bulk) 完成: %d 篇论文\n", len(bulkResult.Papers))
			}
		}()
	}

	// 通道2: search_papers_relevance (search API) - 语义相关论文
	if relevanceArgs != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fmt.Printf("[PARALLEL-DEBUG] 通道2 (relevance) 开始执行...\n")
			relevanceResult, relevanceErr = s.SearchAndFilterPapersRelevance(mcpServer, relevanceArgs, userQuery, DefaultPaperFilterConfig)
			if relevanceErr != nil {
				fmt.Printf("[PARALLEL-DEBUG] 通道2 (relevance) 错误: %v\n", relevanceErr)
			} else {
				fmt.Printf("[PARALLEL-DEBUG] 通道2 (relevance) 完成: %d 篇论文\n", len(relevanceResult.Papers))
			}
		}()
	}

	// 等待两个通道完成
	wg.Wait()
	fmt.Printf("[PARALLEL-DEBUG] 两个通道都已完成\n")

	// 合并结果并去重
	return s.mergeAndDeduplicatePapers(bulkResult, relevanceResult, bulkErr, relevanceErr)
}

// mergeAndDeduplicatePapers 合并并按 paperId 去重，最多返回 100 篇
func (s *Service) mergeAndDeduplicatePapers(
	bulkResult, relevanceResult *PaperFilterResult,
	bulkErr, relevanceErr error,
) *ParallelSearchResult {
	fmt.Printf("[PARALLEL-DEBUG] ========== 合并去重开始 ==========\n")

	const maxMergedPapers = 100 // 合并后最多返回100篇

	seen := make(map[string]bool)
	var merged []map[string]interface{}
	bulkCount := 0
	relCount := 0

	// 优先保留 bulk 结果（高引用论文）
	if bulkErr == nil && bulkResult != nil {
		fmt.Printf("[PARALLEL-DEBUG] 处理 bulk 结果: %d 篇论文\n", len(bulkResult.Papers))
		for _, paper := range bulkResult.Papers {
			if len(merged) >= maxMergedPapers {
				break
			}
			if id, ok := paper["paperId"].(string); ok && id != "" && !seen[id] {
				seen[id] = true
				merged = append(merged, paper)
				bulkCount++
			}
		}
	}

	// 补充 relevance 结果（语义相关论文）
	if relevanceErr == nil && relevanceResult != nil {
		fmt.Printf("[PARALLEL-DEBUG] 处理 relevance 结果: %d 篇论文\n", len(relevanceResult.Papers))
		for _, paper := range relevanceResult.Papers {
			if len(merged) >= maxMergedPapers {
				break
			}
			if id, ok := paper["paperId"].(string); ok && id != "" && !seen[id] {
				seen[id] = true
				merged = append(merged, paper)
				relCount++
			}
		}
	}

	fmt.Printf("[PARALLEL-DEBUG] 合并完成: bulk贡献=%d篇, relevance贡献=%d篇, 总计=%d篇 (最大%d篇)\n",
		bulkCount, relCount, len(merged), maxMergedPapers)
	fmt.Printf("[PARALLEL-DEBUG] ========== 合并去重完成 ==========\n")

	// TotalCount 返回实际合并后的数量，而不是 API 查找的总数
	return &ParallelSearchResult{
		Papers:     merged,
		TotalCount: len(merged), // 返回实际合并后的数量
		BulkCount:  bulkCount,
		RelCount:   relCount,
	}
}
