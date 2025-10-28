package conversation

import (
	"encoding/json"
	"fmt"
	"io"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/semanticscholar"
)

// AdvancedSearchAndAnalyze performs AI-powered search using MCP tools and streams results
func (s *Service) AdvancedSearchAndAnalyze(conversationID uint, query string, writer io.Writer) error {
	// Create MCP server with manager
	// Manager will automatically get API key and base URL from backend config
	mcpServer := mcp.NewMCPServer(s.scholarManager)

	// Step 1: Let AI decide what tools to call based on user query
	// Get available MCP tools
	mcpTools := mcpServer.ListTools()
	aiTools := ai.ConvertMCPToolsToOpenAIFormat(mcpTools)

	// Create initial message for AI to understand user intent
	initialMessages := []ai.ChatMessage{
		{
			Role: "system",
			Content: `你是一位专业的学术研究助手。你可以使用工具来搜索学术论文。
根据用户的查询，使用 search_papers 工具来搜索相关论文。
请分析用户的需求，提取合适的搜索关键词，并调用工具。

重要：调用 search_papers 时，请设置 limit 参数为 40，以返回更多相关论文。`,
		},
		{
			Role:    "user",
			Content: query,
		},
	}

	// Step 2: Call AI with tools to get tool calls
	toolCallResponse, err := s.aiService.ChatCompletionWithTools(initialMessages, aiTools, "auto")
	if err != nil {
		return fmt.Errorf("AI tool call failed: %w", err)
	}

	// Step 3: Execute tool calls and collect results
	var allPapers []map[string]interface{}
	var totalCount int

	if len(toolCallResponse.Choices) > 0 && len(toolCallResponse.Choices[0].Message.ToolCalls) > 0 {
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
	}

	// If no papers found, try a simple direct search
	if len(allPapers) == 0 {
		papers, total, err := s.mcpSearch(query, mcpServer)
		if err != nil {
			return fmt.Errorf("search failed: %w", err)
		}
		allPapers = papers
		totalCount = total
	}

	// Step 4: Send papers to frontend
	papersData := map[string]interface{}{
		"papers": allPapers,
		"total":  totalCount,
	}
	papersJSON, _ := json.Marshal(papersData)
	fmt.Fprintf(writer, "data: [PAPERS]%s\n\n", string(papersJSON))
	if flusher, ok := writer.(interface{ Flush() }); ok {
		flusher.Flush()
	}

	// Save papers to the user message in database
	if err := s.repo.UpdateMessageSearchResults(conversationID, query, allPapers, totalCount); err != nil {
		fmt.Printf("Warning: failed to save search results to message: %v\n", err)
	}

	// Step 5: Generate AI analysis of the papers and save to database
	papersForPrompt := ai.FormatPapersForPrompt(allPapers)
	analysisPrompt := fmt.Sprintf(`用户查询：%s

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

## 延伸思考
在分析的最后，提供3-5个发散性的后续研究问题，格式如下：
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
5. 确保后续问题放在 [FOLLOW_UP_QUESTIONS] 标签内

请用 Markdown 格式输出完整的分析报告。`, query, papersForPrompt)

	analysisMessages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: "你是一位专业的学术研究助手，擅长分析和总结学术论文。",
		},
		{
			Role:    "user",
			Content: analysisPrompt,
		},
	}

	// Stream AI response and collect full content
	fullContent, err := s.aiService.StreamChatCompletionAndCollect(analysisMessages, writer)
	if err != nil {
		return err
	}

	// Save assistant message to conversation
	assistantMessage := &ConversationMessage{
		ConversationID: conversationID,
		Role:           MessageRoleAssistant,
		Content:        fullContent,
	}

	if err := s.repo.CreateMessage(assistantMessage); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to save assistant message: %v\n", err)
	}

	return nil
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
