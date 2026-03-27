// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/ai/prompts"
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
	Papers     []map[string]any
	TotalCount int
	BulkCount  int // bulk通道获取的论文数
	RelCount   int // relevance通道获取的论文数
}

// AdvancedSearchAndAnalyze 执行基于AI的智能分析（使用MCP工具）并流式返回结果
// 根据用户订阅使用相应的模型级别
// 支持对话上下文以便进行后续分析
// 注意：配额检查已废弃，现在使用货币系统进行扣费控制
func (s *Service) AdvancedSearchAndAnalyze(ctx context.Context, conversationID uint, query string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
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
	slog.Debug("found user message", "message_id", userMessageID)

	// Create MCP server with manager
	// Manager will automatically get API key and base URL from backend config
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 1: Build context from conversation history (last 5 rounds)
	// We already have messages from above, no need to fetch again
	slog.Debug("got messages for conversation", "count", len(messages), "conversation_id", conversationID)
	contextMessages := s.buildContextMessages(messages, 5)
	slog.Debug("built context", "message_count", len(contextMessages))

	// Step 2: Get available MCP tools
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(convertMCPToolDefs(mcpTools))

	// Step 3: Create messages with system prompt
	// 使用动态生成的并行搜索系统提示词（年份根据当前时间计算）
	slog.Debug("advanced search started")
	slog.Debug("user query", "query", query)
	currentYear := time.Now().Year()
	slog.Debug("using parallel search system prompt", "year_from", currentYear-5, "year_to", currentYear)
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
	slog.Debug("calling AI with tools", "messages_count", len(initialMessages), "tools_count", len(aiTools))
	
	// Send step: analyzing search intent
	slog.Debug("sending analyzing step event")
	fmt.Fprintf(writer, "data: [STEP]{\"step\":\"analyzing\",\"message\":\"正在分析检索意图\",\"detail\":\"理解您的查询，生成最佳搜索策略...\"}\n\n")
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
	
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(ctx, initialMessages, aiTools, "auto", thirdparty.ModelLevelLow)
	if err != nil {
		slog.Error("AI tool call failed", "err", err)
		// Still try fallback search below, don't send error to frontend yet
		toolCallResponse = nil
	}

	// Step 5: Execute tool calls and collect results with enhanced filtering (并行搜索)
	var allPapers []map[string]any
	var searchKeywords string

	// Extract search keywords from tool call for display
	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			var args map[string]any
			if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err == nil {
				if q, ok := args["query"].(string); ok && q != "" {
					searchKeywords = q
					break
				}
			}
		}
	}

	// Send step: searching papers with keywords
	searchDetail := "正在从学术数据库检索相关论文..."
	if searchKeywords != "" {
		// Truncate keywords if too long
		displayKeywords := searchKeywords
		if len(displayKeywords) > 50 {
			displayKeywords = displayKeywords[:50] + "..."
		}
		searchDetail = fmt.Sprintf("搜索关键词: %s", displayKeywords)
	}
	slog.Debug("sending searching step event", "keywords", searchKeywords)
	fmt.Fprintf(writer, "data: [STEP]{\"step\":\"searching\",\"message\":\"正在检索学术论文\",\"detail\":\"%s\"}\n\n", escapeJSONString(searchDetail))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}

	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		slog.Debug("found tool calls", "count", len(toolCallResponse.Choices[0].Message.ToolCalls))
		
		// 收集两种搜索的参数
		var bulkArgs, relevanceArgs map[string]any
		
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			slog.Debug("tool call", "tool_name", toolCall.Function.Name)
			slog.Debug("tool arguments", "args", toolCall.Function.Arguments)

			var args map[string]any
			if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
				slog.Error("failed to parse tool arguments", "err", err)
				continue
			}

			switch toolCall.Function.Name {
			case "search_papers_advanced", "search_papers":
				bulkArgs = args
				slog.Debug("collected bulk channel args")
			case "search_papers_relevance":
				relevanceArgs = args
				slog.Debug("collected relevance channel args")
			}
		}

		// 执行并行搜索
		parallelResult := s.parallelSearchPapers(ctx, mcpServer, query, bulkArgs, relevanceArgs)
		allPapers = parallelResult.Papers
		
		slog.Debug("parallel search completed", "bulk_count", parallelResult.BulkCount, "relevance_count", parallelResult.RelCount, "merged_count", len(allPapers))
		
	}

	// If no papers found, try a simple direct search
	if len(allPapers) == 0 {
		slog.Debug("no papers from tool calls, doing direct search")
		papers, _, err := s.mcpSearch(ctx, query, mcpServer)
		if err != nil {
			slog.Error("direct search failed", "err", err)
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
				slog.Warn("failed to save error message", "err", saveErr)
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

	// Limit papers to top 50 for frontend display and AI analysis
	const maxPapersToShow = 50
	displayPapers := allPapers
	if len(displayPapers) > maxPapersToShow {
		slog.Debug("limiting papers for display and analysis", "total", len(allPapers), "limit", maxPapersToShow)
		displayPapers = displayPapers[:maxPapersToShow]
	}

	// 搜索完成，更新步骤（包含筛选结果）
	slog.Debug("sending searching complete event", "total", len(allPapers), "filtered", len(displayPapers))
	searchCompleteDetail := fmt.Sprintf("检索到 %d 篇论文，已筛选出 %d 篇最相关的结果", len(allPapers), len(displayPapers))
	fmt.Fprintf(writer, "data: [STEP]{\"step\":\"searching\",\"message\":\"检索完成\",\"detail\":\"%s\",\"completed\":true}\n\n", escapeJSONString(searchCompleteDetail))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
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
		slog.Warn("failed to update user message with paper IDs", "err", err)
	}

	// Send only paper IDs to frontend (frontend will fetch details via batch API)
	// total 返回实际筛选后的数量，而不是 API 查找的总数
	papersData := map[string]any{
		"paperIds": paperIDs,
		"total":    len(paperIDs), // 返回实际筛选后的数量
	}
	papersJSON, _ := json.Marshal(papersData)
	fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}

	// Step 7: Generate AI analysis of the papers and save to database
	// Send step: AI analyzing papers with count
	slog.Debug("sending analyzing_papers step event", "paper_count", len(displayPapers))
	analysisDetail := fmt.Sprintf("正在对 %d 篇论文进行深度解读...", len(displayPapers))
	fmt.Fprintf(writer, "data: [STEP]{\"step\":\"analyzing_papers\",\"message\":\"AI 深度分析\",\"detail\":\"%s\"}\n\n", escapeJSONString(analysisDetail))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}
	
	slog.Debug("formatting papers for AI analysis", "count", len(displayPapers))
	// Use more papers for analysis (up to 30) with shorter abstracts
	papersForPrompt := ai.FormatPapersForPromptWithLimit(displayPapers, 30, 200)
	slog.Debug("formatted papers", "length", len(papersForPrompt))

	// Get analysis prompt templates
	analysisSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis_system", nil)
	if err != nil {
		slog.Warn("failed to get analysis system prompt template, using fallback", "err", err)
		analysisSystemPrompt = "你是一名具有深厚研究背景的高级学术分析专家，能够对多篇论文进行深入解读、方法分析、研究发现抽象、理论联系与批判性整合，并以学术写作风格输出高质量分析报告。"
	}

	analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis", map[string]string{
		"query":  query,
		"papers": papersForPrompt,
	})
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		slog.Warn("failed to get analysis prompt template, using fallback", "err", err)
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
这些内容要以"自然流畅、连贯而不刻意分段"的方式融入分析。

三、引用格式必须严格使用以下形式
【引用编号：具体内容】
所有论述性内容必须通过引用论文中的数据、方法、结论或关键描述进行支撑。
每一部分分析都必须至少使用 3–5 个引用标记。
引用必须具体，例如：
【引用3：模型在XXX数据集上提升了12.5%%】
而不是模糊表达。

四、分析必须基于论文内容本身
	•	不得编造不存在的论文结论
	•	不得使用无引用支持的判断
	•	必须结合论文中的数据、实验结果、方法细节
	•	必须保持学术严谨性和批判性

五、写作风格要求
	•	像一位 senior researcher 的深度综述
	•	不复述论文摘要，而是给"洞察"与"分析"
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

	slog.Debug("calling StreamChatCompletionAndCollectWithLevel", "model_level", modelLevel, "messages_count", len(analysisMessages), "prompt_length", len(analysisPrompt))

	// Stream AI response and collect full content using specified model level
	fullContent, err := s.aiService.StreamChatCompletionAndCollectWithLevel(ctx, analysisMessages, writer, modelLevel)
	if err != nil {
		// 生成友好的错误消息
		friendlyError := "网络异常，请稍后重试。如果问题持续，请联系管理员。"
		slog.Error("AI analysis failed", "err", err)

		// 将错误消息保存为 assistant 消息，以便历史记录中显示
		errorMessage := &ConversationMessage{
			ConversationID:    conversationID,
			ParentMessageID:   &userMessageID,
			Role:              MessageRoleAssistant,
			Content:           friendlyError,
			FollowUpQuestions: "",
		}

		if saveErr := s.repo.CreateMessage(errorMessage); saveErr != nil {
			slog.Warn("failed to save error message", "err", saveErr)
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
		slog.Warn("failed to clear old follow-up questions", "err", err)
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
		slog.Warn("failed to save assistant message", "err", err)
	}

	// Step 9: Generate title with timeout (3 seconds max)
	// This prevents title generation from blocking [DONE] signal
	titleCh := make(chan string, 1)
	go func() {
		newTitle, err := s.UpdateConversationTitleWithAI(ctx, conversationID)
		if err != nil {
			slog.Warn("failed to generate title with AI", "err", err)
			titleCh <- ""
		} else {
			titleCh <- newTitle
		}
	}()

	// Wait for title with timeout
	select {
	case newTitle := <-titleCh:
		if newTitle != "" {
			// Send title update event via SSE
			titleData := fmt.Sprintf(`[TITLE]{"title":"%s"}`, escapeJSONString(newTitle))
			fmt.Fprintf(writer, "data: %s\n\n", titleData)
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
			slog.Debug("sent title event", "title", newTitle)
		}
	case <-time.After(3 * time.Second):
		slog.Warn("title generation timeout, skipping title")
		// Title will be generated in the background and saved to database
		// User can see it when they refresh or reload the conversation
	}

	return nil
}

// AdvancedSearchAndAnalyzeV2 执行基于AI的智能分析（使用工具调用循环优化版）
// 将工具调用决策和深度分析合并为一次逻辑对话，提升上下文连贯性并减少延迟
// 根据用户订阅使用相应的模型级别
func (s *Service) AdvancedSearchAndAnalyzeV2(ctx context.Context, conversationID uint, query string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
	slog.Info("advanced search v2 started")
	slog.Info("advanced v2 query", "query", query, "model_level", modelLevel)

	// Step 1: 获取用户消息
	var userMessage *ConversationMessage
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get conversation messages: %w", err)
	}

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
	slog.Debug("found user message", "message_id", userMessageID)

	// Step 2: 创建 MCP 服务器
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 3: 获取 MCP 工具列表
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(convertMCPToolDefs(mcpTools))
	slog.Debug("got MCP tools", "count", len(aiTools))

	// Step 4: 构建消息（使用统一的硬编码提示词）
	currentYear := time.Now().Year()
	systemPrompt := prompts.RenderAdvancedSearchSystemPrompt(currentYear-5, currentYear)

	contextMessages := s.buildContextMessages(messages, 5)
	contextMessages = append(contextMessages, ai.ChatMessage{
		Role:    "user",
		Content: query,
	})

	initialMessages := append([]ai.ChatMessage{{Role: "system", Content: systemPrompt}}, contextMessages...)
	slog.Debug("messages built", "count", len(initialMessages))

	// Step 5: 发送分析意图步骤
	fmt.Fprintf(writer, "data: [STEP]{\"step\":\"analyzing\",\"message\":\"正在分析检索意图\",\"detail\":\"理解您的查询，生成最佳搜索策略...\"}\n\n")
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}

	// Step 6: 创建工具执行器（捕获必要的上下文）
	var displayPapers []map[string]any
	var paperIDs []string

	toolExecutor := func(toolCalls []ai.ToolCall) ([]ai.ToolResult, error) {
		slog.Debug("tool executor received calls", "count", len(toolCalls))

		// 发送搜索中步骤
		fmt.Fprintf(writer, "data: [STEP]{\"step\":\"searching\",\"message\":\"正在检索学术论文\",\"detail\":\"正在从学术数据库检索相关论文...\"}\n\n")
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		// 解析工具调用参数
		var bulkArgs, relevanceArgs map[string]any
		var searchKeywords string

		for _, tc := range toolCalls {
			slog.Debug("tool executor processing", "tool_name", tc.Function.Name)

			var args map[string]any
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				slog.Error("tool executor failed to parse args", "err", err)
				continue
			}

			switch tc.Function.Name {
			case "search_papers_advanced", "search_papers":
				bulkArgs = args
			case "search_papers_relevance":
				relevanceArgs = args
				if q, ok := args["query"].(string); ok {
					searchKeywords = q
				}
			}
		}

		// 更新搜索步骤详情
		if searchKeywords != "" {
			displayKeywords := searchKeywords
			if len(displayKeywords) > 50 {
				displayKeywords = displayKeywords[:50] + "..."
			}
			fmt.Fprintf(writer, "data: [STEP]{\"step\":\"searching\",\"message\":\"正在检索学术论文\",\"detail\":\"搜索关键词: %s\"}\n\n", escapeJSONString(displayKeywords))
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
		}

		// 执行并行搜索
		parallelResult := s.parallelSearchPapers(ctx, mcpServer, query, bulkArgs, relevanceArgs)
		allPapers := parallelResult.Papers

		slog.Debug("tool executor parallel search completed", "bulk_count", parallelResult.BulkCount, "relevance_count", parallelResult.RelCount, "merged_count", len(allPapers))

		// 如果没有找到论文，尝试直接搜索
		if len(allPapers) == 0 {
			slog.Debug("tool executor no results, trying direct search")
			papers, _, err := s.mcpSearch(ctx, query, mcpServer)
			if err != nil {
				return nil, fmt.Errorf("search failed: %w", err)
			}
			allPapers = FilterPapersWithAbstract(papers)
		}

		// 限制论文数量
		const maxPapersToShow = 50
		displayPapers = allPapers
		if len(displayPapers) > maxPapersToShow {
			displayPapers = displayPapers[:maxPapersToShow]
		}

		// 发送搜索完成步骤
		searchCompleteDetail := fmt.Sprintf("检索到 %d 篇论文，已筛选出 %d 篇最相关的结果", len(allPapers), len(displayPapers))
		fmt.Fprintf(writer, "data: [STEP]{\"step\":\"searching\",\"message\":\"检索完成\",\"detail\":\"%s\",\"completed\":true}\n\n", escapeJSONString(searchCompleteDetail))
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		// 提取论文ID
		paperIDs = make([]string, 0, len(displayPapers))
		for _, paper := range displayPapers {
			if paperID, ok := paper["paperId"].(string); ok && paperID != "" {
				paperIDs = append(paperIDs, paperID)
			}
		}

		// 保存论文ID到数据库
		if err := s.repo.UpdateMessageSearchPaperIDs(userMessage.ID, paperIDs, len(paperIDs)); err != nil {
			slog.Warn("tool executor failed to save paper IDs", "err", err)
		}

		// 发送论文ID到前端
		papersData := map[string]any{
			"paperIds": paperIDs,
			"total":    len(paperIDs),
		}
		papersJSON, _ := json.Marshal(papersData)
		fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		// 发送AI分析步骤
		analysisDetail := fmt.Sprintf("正在对 %d 篇论文进行深度解读...", len(displayPapers))
		fmt.Fprintf(writer, "data: [STEP]{\"step\":\"analyzing_papers\",\"message\":\"AI 深度分析\",\"detail\":\"%s\"}\n\n", escapeJSONString(analysisDetail))
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		// 格式化论文数据作为工具结果返回给AI
		papersForPrompt := ai.FormatPapersForPromptWithLimit(displayPapers, 30, 200)

		// 为每个工具调用返回相同的论文结果
		results := make([]ai.ToolResult, len(toolCalls))
		for i, tc := range toolCalls {
			results[i] = ai.ToolResult{
				ToolCallID: tc.ID,
				Content:    fmt.Sprintf("搜索完成，找到 %d 篇相关论文。论文列表：\n%s", len(displayPapers), papersForPrompt),
			}
		}

		slog.Debug("tool executor completed", "result_count", len(results))
		return results, nil
	}

	// Step 7: 执行工具调用循环（一次对话完成工具调用+分析）
	slog.Info("starting tool call loop")
	fullContent, err := s.aiService.StreamChatCompletionWithToolLoop(
		ctx,
		initialMessages,
		aiTools,
		toolExecutor,
		writer,
		modelLevel,
	)

	if err != nil {
		slog.Error("tool call loop failed", "err", err)

		// 发送错误消息
		friendlyError := "网络异常，请稍后重试。如果问题持续，请联系管理员。"
		errorMessage := &ConversationMessage{
			ConversationID:    conversationID,
			ParentMessageID:   &userMessageID,
			Role:              MessageRoleAssistant,
			Content:           friendlyError,
			FollowUpQuestions: "",
		}

		if saveErr := s.repo.CreateMessage(errorMessage); saveErr != nil {
			slog.Error("failed to save error message", "err", saveErr)
		}

		fmt.Fprintf(writer, "data: [ERROR] %s\n\n", friendlyError)
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}

		return fmt.Errorf("tool loop failed: %w", err)
	}

	slog.Info("tool call loop completed", "content_length", len(fullContent))

	// Step 8: 清除旧的跟进问题
	if err := s.repo.ClearOldFollowUpQuestions(conversationID); err != nil {
		slog.Warn("failed to clear old follow-up questions", "err", err)
	}

	// Step 9: 保存助手消息
	assistantMessage := &ConversationMessage{
		ConversationID:    conversationID,
		ParentMessageID:   &userMessageID,
		Role:              MessageRoleAssistant,
		Content:           fullContent,
		FollowUpQuestions: "",
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		slog.Warn("failed to save assistant message", "err", err)
	}

	// Step 10: 生成标题（带超时）
	titleCh := make(chan string, 1)
	go func() {
		newTitle, err := s.UpdateConversationTitleWithAI(ctx, conversationID)
		if err != nil {
			slog.Warn("failed to generate title", "err", err)
			titleCh <- ""
		} else {
			titleCh <- newTitle
		}
	}()

	select {
	case newTitle := <-titleCh:
		if newTitle != "" {
			titleData := fmt.Sprintf(`[TITLE]{"title":"%s"}`, escapeJSONString(newTitle))
			fmt.Fprintf(writer, "data: %s\n\n", titleData)
			if flusher, ok := writer.(interface{ Flush() }); ok {
				flusher.Flush()
			}
			slog.Debug("sent title", "title", newTitle)
		}
	case <-time.After(3 * time.Second):
		slog.Warn("title generation timeout")
	}

	slog.Info("advanced search v2 completed")
	return nil
}

// escapeJSONString escapes special characters in a string for JSON
func escapeJSONString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return s
}

// generateFollowUpQuestions generates follow-up questions based on the analysis
// Uses low model for cost efficiency and returns all questions at once (non-streaming)
func (s *Service) generateFollowUpQuestions(ctx context.Context, query string, analysisContent string) (string, error) {
	// Get follow-up questions prompt from database
	followUpSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("follow_up_questions_system", nil)
	if err != nil {
		slog.Warn("failed to get follow-up questions system prompt, using fallback", "err", err)
		followUpSystemPrompt = "你是一位专业的学术研究助手，擅长基于研究分析提出有深度的延伸问题。"
	}

	followUpPrompt, _, err := s.aiService.GetAndRenderPrompt("follow_up_questions", map[string]string{
		"query":    query,
		"analysis": analysisContent,
	})
	if err != nil {
		// Fallback to hardcoded prompt
		slog.Warn("failed to get follow-up questions prompt, using fallback", "err", err)
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
	followUpContent, err := s.aiService.ChatCompletionWithLevel(ctx, followUpMessages, thirdparty.ModelLevelLow)
	if err != nil {
		return "", err
	}

	return followUpContent, nil
}

// executeMCPToolCall executes a single MCP tool call and returns papers
func (s *Service) executeMCPToolCall(ctx context.Context, mcpServer *mcp.MCPServer, toolRequest mcp.ToolRequest) ([]map[string]any, int, error) {
	result, err := mcpServer.CallTool(ctx, toolRequest)
	if err != nil {
		return nil, 0, err
	}

	// Parse the MCP response
	if len(result.Content) == 0 {
		return []map[string]any{}, 0, nil
	}

	// The MCP server returns JSON in the text field
	var searchResponse semanticscholar.SearchResponse
	if err := json.Unmarshal([]byte(result.Content[0]["text"].(string)), &searchResponse); err != nil {
		return nil, 0, fmt.Errorf("failed to parse search results: %w", err)
	}

	// Convert papers to map format
	papers := make([]map[string]any, 0, len(searchResponse.Data))
	for _, paper := range searchResponse.Data {
		paperMap := map[string]any{
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
		var authors []map[string]any
		for _, author := range paper.Authors {
			authors = append(authors, map[string]any{
				"authorId": author.AuthorID,
				"name":     author.Name,
			})
		}
		paperMap["authors"] = authors

		// Add TLDR if available
		if paper.TLDR != nil {
			paperMap["tldr"] = map[string]any{
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
func (s *Service) mcpSearch(ctx context.Context, query string, mcpServer *mcp.MCPServer) ([]map[string]any, int, error) {
	// Use MCP tool to search papers
	toolRequest := mcp.ToolRequest{
		Name: "search_papers",
		Arguments: map[string]any{
			"query":  query,
			"limit":  20,
			"offset": 0,
		},
	}

	return s.executeMCPToolCall(ctx, mcpServer, toolRequest)
}

// GetFollowUpQuestions generates and returns follow-up questions for a message
// This is a separate endpoint to avoid including questions in the streaming response
// messageID can be either user message ID or assistant message ID
func (s *Service) GetFollowUpQuestions(ctx context.Context, conversationID uint, messageID uint, userID uint) (string, error) {
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
		slog.Debug("returning cached follow-up questions", "message_id", assistantMessage.ID)
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
	slog.Debug("generating follow-up questions", "query", searchQuery, "message_id", assistantMessage.ID)
	followUpQuestions, err := s.generateFollowUpQuestions(ctx, searchQuery, assistantMessage.Content)
	if err != nil {
		slog.Error("failed to generate follow-up questions", "err", err)
		// 返回友好的错误提示，而不是空字符串
		// 这样前端可以显示有意义的错误信息
		return "", fmt.Errorf("网络异常，暂时无法生成延伸问题。请稍后重试")
	}

	// Save to database for caching (save to assistant message)
	if err := s.repo.UpdateMessageFollowUpQuestions(assistantMessage.ID, followUpQuestions); err != nil {
		slog.Warn("failed to cache follow-up questions", "err", err)
		// Don't fail the request, just log the warning
	}

	return followUpQuestions, nil
}

// parallelSearchPapers 并行执行两种搜索策略
func (s *Service) parallelSearchPapers(
	ctx context.Context,
	mcpServer *mcp.MCPServer,
	userQuery string,
	bulkArgs map[string]any,
	relevanceArgs map[string]any,
) *ParallelSearchResult {
	slog.Debug("parallel search started")
	slog.Debug("parallel search bulk args", "args", bulkArgs)
	slog.Debug("parallel search relevance args", "args", relevanceArgs)

	var wg sync.WaitGroup
	var bulkResult, relevanceResult *PaperFilterResult
	var bulkErr, relevanceErr error

	// 通道1: search_papers_advanced (bulk API) - 高引用论文
	if bulkArgs != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			slog.Debug("channel 1 (bulk) started")
			bulkResult, bulkErr = s.SearchAndFilterPapers(ctx, mcpServer, bulkArgs, userQuery, DefaultPaperFilterConfig)
			if bulkErr != nil {
				slog.Error("channel 1 (bulk) error", "err", bulkErr)
			} else {
				slog.Debug("channel 1 (bulk) completed", "paper_count", len(bulkResult.Papers))
			}
		}()
	}

	// 通道2: search_papers_relevance (search API) - 语义相关论文
	if relevanceArgs != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			slog.Debug("channel 2 (relevance) started")
			relevanceResult, relevanceErr = s.SearchAndFilterPapersRelevance(ctx, mcpServer, relevanceArgs, userQuery, DefaultPaperFilterConfig)
			if relevanceErr != nil {
				slog.Error("channel 2 (relevance) error", "err", relevanceErr)
			} else {
				slog.Debug("channel 2 (relevance) completed", "paper_count", len(relevanceResult.Papers))
			}
		}()
	}

	// 等待两个通道完成
	wg.Wait()
	slog.Debug("both channels completed")

	// 合并结果并去重
	return s.mergeAndDeduplicatePapers(bulkResult, relevanceResult, bulkErr, relevanceErr)
}

// mergeAndDeduplicatePapers 合并并按 paperId 去重，最多返回 100 篇
func (s *Service) mergeAndDeduplicatePapers(
	bulkResult, relevanceResult *PaperFilterResult,
	bulkErr, relevanceErr error,
) *ParallelSearchResult {
	slog.Debug("merge and deduplicate started")

	const maxMergedPapers = 50 // 合并后最多返回50篇

	seen := make(map[string]bool)
	var merged []map[string]any
	bulkCount := 0
	relCount := 0

	// 优先保留 bulk 结果（高引用论文）
	if bulkErr == nil && bulkResult != nil {
		slog.Debug("processing bulk results", "paper_count", len(bulkResult.Papers))
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
		slog.Debug("processing relevance results", "paper_count", len(relevanceResult.Papers))
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

	slog.Debug("merge completed", "bulk_count", bulkCount, "relevance_count", relCount, "total", len(merged), "max", maxMergedPapers)
	slog.Debug("merge and deduplicate completed")

	// TotalCount 返回实际合并后的数量，而不是 API 查找的总数
	return &ParallelSearchResult{
		Papers:     merged,
		TotalCount: len(merged), // 返回实际合并后的数量
		BulkCount:  bulkCount,
		RelCount:   relCount,
	}
}

// convertMCPToolDefs converts mcp.Tool slice to ai.MCPToolDef slice,
// keeping the ai package decoupled from the mcp package.
func convertMCPToolDefs(tools []mcp.Tool) []ai.MCPToolDef {
	defs := make([]ai.MCPToolDef, len(tools))
	for i, t := range tools {
		defs[i] = ai.MCPToolDef{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		}
	}
	return defs
}
