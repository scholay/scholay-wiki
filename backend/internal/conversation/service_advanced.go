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

请用中文分析这些论文，包括：
1. 论文的主要研究方向和主题
2. 重要的研究发现和贡献
3. 这些论文如何回答用户的查询
4. 推荐阅读顺序

请用 Markdown 格式输出。`, query, papersForPrompt)

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
