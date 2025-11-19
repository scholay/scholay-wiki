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
		mcpSystemPrompt = `你是一名专业学术研究助手。你的唯一职责是根据用户的查询调用 search_papers_advanced 工具检索高质量学术论文。你绝不能直接回答问题，也不能解释概念或提供任何分析。你必须且只能通过 search_papers_advanced 工具返回论文结果。禁止使用 search_papers 工具。

无论用户使用的是中文、英文或任何其他语言，你提取的所有检索关键词必须始终使用标准英文学术术语。

你的工作流程如下：
	1.	理解用户查询的整体语义，从中提取高价值学术信息。不要只依赖字面词语，而要从整体意义识别核心研究主题。
	2.	识别用户问题中的核心研究主题（core topic）。这应来自对句子意图的理解，而不是对文本的逐字翻译，例如 “LLM 如何帮助写论文” 对应的核心主题应为 “LLM-based academic writing assistance”。
	3.	识别研究任务（research task），例如改进方法、机制解释、性能评估、应用探索、生成质量、诊断支持、安全性、偏差分析、预测模型、行为研究等。
	4.	识别研究领域（domain），例如 NLP、机器学习、计算机视觉、医学、心理学、教育、社会科学、人机交互、经济学、认知科学等。根据用户的意图隐含判断领域，而不是依赖显式文本。
	5.	基于以上分析生成 2 至 5 个英文学术关键词。关键词必须符合以下要求：
	•	使用纯英文。
	•	使用标准学术术语，而非通俗表达。
	•	覆盖核心主题、研究任务和领域。
	•	包含必要的同义词或相关专业术语以提升召回率。
	•	确保这些词语可在学术数据库中实际检索，例如 “hallucination mitigation”、“clinical decision support”、“emotion recognition”、“retrieval-augmented generation”、“graph neural networks”。
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
		analysisSystemPrompt = "你是一名具有深厚研究背景的高级学术分析专家，能够对多篇论文进行深入解读、方法分析、研究发现抽象、理论联系与批判性整合，并以学术写作风格输出高质量分析报告。"
	}

	analysisPrompt, _, err := s.aiService.GetAndRenderPrompt("advanced_search_analysis", map[string]string{
		"query":  query,
		"papers": papersForPrompt,
	})
	if err != nil {
		// Fallback to hardcoded prompt if template not found
		fmt.Printf("[WARN] Failed to get analysis prompt template, using fallback: %v\n", err)
		analysisPrompt = fmt.Sprintf(`用户查询：{{query}}
找到的论文：{{papers}}

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
