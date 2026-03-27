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

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// ContinueConversation 继续对话并使用之前消息的上下文
// 现在使用与智能分析相同的逻辑：始终执行MCP搜索并结合历史查询
// 注意：配额检查已废弃，现在使用货币系统进行扣费控制
func (s *Service) ContinueConversation(ctx context.Context, conversationID uint, userQuery string, writer io.Writer, userID uint, modelLevel thirdparty.ModelLevel) error {
	// Get the user message (it should already exist, created by frontend)
	// We need to find the latest user message with this query
	messages, err := s.repo.GetConversationMessages(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get messages: %w", err)
	}
	
	var userMessage *ConversationMessage
	// Find the latest user message with matching query
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == MessageRoleUser && messages[i].SearchQuery == userQuery {
			userMessage = &messages[i]
			break
		}
	}
	
	if userMessage == nil {
		return fmt.Errorf("user message not found")
	}
	
	userMessageID := userMessage.MessageID
	slog.Debug("found user message", "messageID", userMessageID)

	// Update conversation's model level
	conversation, err := s.repo.GetConversationByID(conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation not found: %w", err)
	}
	if conversation.ModelLevel != string(modelLevel) {
		conversation.ModelLevel = string(modelLevel)
		if err := s.repo.UpdateConversation(conversation); err != nil {
			slog.Warn("failed to update conversation model level", "err", err)
		}
	}

	// We already have messages from above, no need to fetch again

	// Step 2: Build combined query context from historical queries and current query
	combinedQuery := s.buildHistoryQueriesContext(messages, userQuery, 5)
	slog.Debug("combined query for continue conversation", "query", combinedQuery)

	// Step 3: Create MCP server with manager
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 4: Get available MCP tools
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(convertMCPToolDefs(mcpTools))

	// Step 5: 从模板创建消息和系统提示（与智能分析相同）
	mcpSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_mcp_system", nil)
	if err != nil {
		// 如果未找到模板，使用备用提示（与智能分析相同）
		slog.Warn("failed to get MCP system prompt template, using fallback", "err", err)
		mcpSystemPrompt = `你是一名专业学术研究助手。你的唯一职责是根据用户的查询调用 search_papers_advanced 工具检索高质量学术论文。你绝不能直接回答问题，也不能解释概念或提供任何分析。你必须且只能通过 search_papers_advanced 工具返回论文结果。禁止使用 search_papers 工具。

无论用户使用的是中文、英文或任何其他语言，你提取的所有检索关键词必须始终使用标准英文学术术语。

你的工作流程如下：
	1.	理解用户查询的整体语义，从中提取高价值学术信息。不要只依赖字面词语，而要从整体意义识别核心研究主题。
	2.	识别用户问题中的核心研究主题（core topic）。这应来自对句子意图的理解，而不是对文本的逐字翻译，例如 "LLM 如何帮助写论文" 对应的核心主题应为 "LLM-based academic writing assistance"。
	3.	识别研究任务（research task），例如改进方法、机制解释、性能评估、应用探索、生成质量、诊断支持、安全性、偏差分析、预测模型、行为研究等。
	4.	识别研究领域（domain），例如 NLP、机器学习、计算机视觉、医学、心理学、教育、社会科学、人机交互、经济学、认知科学等。根据用户的意图隐含判断领域，而不是依赖显式文本。
	5.	基于以上分析生成 2 至 5 个英文学术关键词。关键词必须符合以下要求：
	•	使用纯英文。
	•	使用标准学术术语，而非通俗表达。
	•	覆盖核心主题、研究任务和领域。
	•	包含必要的同义词或相关专业术语以提升召回率。
	•	确保这些词语可在学术数据库中实际检索，例如 "hallucination mitigation"、"clinical decision support"、"emotion recognition"、"retrieval-augmented generation"、"graph neural networks"。
	6.	调用 search_papers_advanced 工具，参数规则如下：
	•	keywords: 使用你生成的英文学术关键词列表
	•	year_from: 当前年份减 5
	•	year_to: 当前年份
	•	min_citations: 若领域成熟取 50，若领域较新或跨学科取 10
	•	limit: 50 至 100
	•	sort_by: citationCount:desc
	•	fields_of_study: 若用户明确指定领域，则填写对应学科
	•	不得添加多余参数，也不得省略必要参数
	7.	你的最终输出必须是 search_papers_advanced 工具调用。你不能输出任何解释、推理过程、背景说明、总结概括或普通文本回答。
	8.	不论用户的问题内容是否看似询问概念、经验、观点、故事、偏见、推理或与学术无关，你都必须将其视为学术检索行为，并调用 search_papers_advanced 工具返回论文。
	9.	无论用户的输入使用哪种语言，你提取的学术关键词必须全部是英文。绝不允许出现中文关键词、混合语言关键词或用户原文中未翻译的名词。

请严格遵守以上全部规则。`
	}

	systemMessage := ai.ChatMessage{
		Role:    "system",
		Content: mcpSystemPrompt,
	}

	// Use combined query instead of individual context messages
	initialMessages := []ai.ChatMessage{
		systemMessage,
		{
			Role:    "user",
			Content: combinedQuery,
		},
	}

	// Step 6: 调用AI获取工具调用（与智能分析相同）
	// Use low-level model for tool calling to save cost
	slog.Debug("calling AI with tools", "messagesCount", len(initialMessages), "toolsCount", len(aiTools))
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(ctx, initialMessages, aiTools, "auto", thirdparty.ModelLevelLow)
	if err != nil {
		slog.Error("AI tool call failed", "err", err)
		// Still try fallback search below, don't send error to frontend yet
		toolCallResponse = nil
	}

	// Step 7: 执行工具调用并收集结果（使用增强的论文筛选逻辑）
	var allPapers []map[string]any
	var totalCount int

	if toolCallResponse != nil && len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
		slog.Debug("found tool calls", "count", len(toolCallResponse.Choices[0].Message.ToolCalls))
		for _, toolCall := range toolCallResponse.Choices[0].Message.ToolCalls {
			slog.Debug("tool call", "name", toolCall.Function.Name, "args", toolCall.Function.Arguments)

			// Support both search_papers and search_papers_advanced
			if toolCall.Function.Name == "search_papers" || toolCall.Function.Name == "search_papers_advanced" {
				// Parse tool arguments
				var args map[string]any
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
					slog.Error("failed to parse tool arguments", "err", err)
					continue
				}

				// 使用增强的论文筛选逻辑（分页获取、过滤无摘要、AI相关性筛选）
				filterResult, err := s.SearchAndFilterPapers(ctx, mcpServer, args, userQuery, DefaultPaperFilterConfig)
				if err != nil {
					slog.Error("paper search and filter failed", "err", err)
					continue
				}

				slog.Debug("paper filter result", "papers", len(filterResult.Papers), "totalFound", filterResult.TotalFound, "pagesUsed", filterResult.PagesUsed)

				allPapers = append(allPapers, filterResult.Papers...)
				if filterResult.TotalFound > totalCount {
					totalCount = filterResult.TotalFound
				}
			}
		}
	}

	// If no papers found, try a simple direct search with combined query
	if len(allPapers) == 0 {
		slog.Debug("no papers from tool calls, doing direct search")
		papers, total, err := s.mcpSearch(ctx, combinedQuery, mcpServer)
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
		totalCount = total
	}

	// Limit papers to top 100 for frontend display and AI analysis
	const maxPapersToShow = 100
	displayPapers := allPapers
	if len(displayPapers) > maxPapersToShow {
		slog.Debug("limiting papers for display and analysis", "from", len(allPapers), "to", maxPapersToShow)
		displayPapers = displayPapers[:maxPapersToShow]
	}

	// Step 8: Extract paper IDs and send to frontend
	paperIDs := make([]string, 0, len(displayPapers))
	for _, paper := range displayPapers {
		if paperID, ok := paper["paperId"].(string); ok && paperID != "" {
			paperIDs = append(paperIDs, paperID)
		}
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

	// Save only paper IDs to database (optimized storage)
	if err := s.repo.UpdateMessageSearchPaperIDs(userMessage.ID, paperIDs, len(paperIDs)); err != nil {
		slog.Warn("failed to update user message with paper IDs", "err", err)
	}

	// Step 9: 生成论文的AI分析（与智能分析相同）
	slog.Debug("formatting papers for AI analysis", "count", len(displayPapers))
	// Use more papers for analysis (up to 30) with shorter abstracts
	papersForPrompt := ai.FormatPapersForPromptWithLimit(displayPapers, 30, 200)
	slog.Debug("formatted papers", "length", len(papersForPrompt))

	// 获取分析提示模板（与智能分析相同）
	analysisSystemPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis_system", nil)
	if err != nil {
		slog.Warn("failed to get analysis system prompt template, using fallback", "err", err)
		analysisSystemPrompt = "你是一名具有深厚研究背景的高级学术分析专家，能够对多篇论文进行深入解读、方法分析、研究发现抽象、理论联系与批判性整合，并以学术写作风格输出高质量分析报告。"
	}

	analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis", map[string]string{
		"query":  userQuery,
		"papers": papersForPrompt,
	})
	if err != nil {
		// 如果未找到模板，使用备用提示（与智能分析相同）
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

请开始你的深度综合分析。`, userQuery, papersForPrompt)
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

	slog.Debug("about to call StreamChatCompletionAndCollectWithLevel", "modelLevel", modelLevel, "messagesCount", len(analysisMessages), "promptLength", len(analysisPrompt))

	// Step 10: Stream AI response and collect full content using specified model level
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

	// Step 11: Clear old follow-up questions from previous messages in this conversation
	if err := s.repo.ClearOldFollowUpQuestions(conversationID); err != nil {
		slog.Warn("failed to clear old follow-up questions", "err", err)
	}

	// 保存助手消息到对话中（包含parent_message_id）
	// 后续问题将通过单独的端点按需生成（与智能分析相同）
	assistantMessage := &ConversationMessage{
		ConversationID:    conversationID,
		ParentMessageID:   &userMessageID, // Link to user message
		Role:              MessageRoleAssistant,
		Content:           fullContent,
		FollowUpQuestions: "", // Will be generated on-demand
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		slog.Warn("failed to save assistant message", "err", err)
	}

	// Step: Generate and send new title using AI
	newTitle, err := s.UpdateConversationTitleWithAI(ctx, conversationID)
	if err != nil {
		slog.Warn("failed to generate title with AI", "err", err)
	} else {
		// Send title update event via SSE
		titleData := fmt.Sprintf(`[TITLE]{"title":"%s"}`, escapeJSONStringContinue(newTitle))
		fmt.Fprintf(writer, "data: %s\n\n", titleData)
		if flusher, ok := writer.(interface{ Flush() }); ok {
			flusher.Flush()
		}
		slog.Debug("sent title event", "title", newTitle)
	}

	return nil
}

// escapeJSONStringContinue escapes special characters in a string for JSON
func escapeJSONStringContinue(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return s
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
func (s *Service) summarizePapers(papers []map[string]any, maxPapers int) string {
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

// buildHistoryQueriesContext extracts historical user queries for context
// Returns a combined query that includes both current query and historical context
func (s *Service) buildHistoryQueriesContext(messages []ConversationMessage, currentQuery string, maxRounds int) string {
	var historyQueries []string

	// Calculate how many messages to include
	startIdx := 0
	if len(messages) > maxRounds*2 {
		startIdx = len(messages) - maxRounds*2
	}

	// Extract user queries from history
	for i := startIdx; i < len(messages); i++ {
		msg := messages[i]
		if msg.Role == MessageRoleUser {
			// Use SearchQuery if available, otherwise use Content
			query := msg.SearchQuery
			if query == "" {
				query = msg.Content
			}
			if query != "" {
				historyQueries = append(historyQueries, query)
			}
		}
	}

	// If no history, return current query
	if len(historyQueries) == 0 {
		return currentQuery
	}

	// Build context string
	var contextBuilder strings.Builder
	contextBuilder.WriteString("历史对话中的提问：\n")
	for i, q := range historyQueries {
		contextBuilder.WriteString(fmt.Sprintf("%d. %s\n", i+1, q))
	}
	contextBuilder.WriteString(fmt.Sprintf("\n当前提问：%s", currentQuery))
	
	return contextBuilder.String()
}
