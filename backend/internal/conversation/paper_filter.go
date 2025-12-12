/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

package conversation

import (
	"encoding/json"
	"fmt"
	"strings"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
)

// PaperFilterConfig 论文筛选配置
type PaperFilterConfig struct {
	MinPapersRequired   int // 最少需要的论文数量
	MaxPagesPerSearch   int // 每次搜索最大翻页次数
	PapersPerPage       int // 每页论文数量
	MinRelevantPapers   int // 最少相关论文数量
}

// DefaultPaperFilterConfig 默认筛选配置
var DefaultPaperFilterConfig = PaperFilterConfig{
	MinPapersRequired:   30,  // 最少需要30篇论文（有摘要的）
	MaxPagesPerSearch:   2,   // 最多翻2页
	PapersPerPage:       100, // 每页100篇（API返回最多1000篇）
	MinRelevantPapers:   10,  // 最少10篇相关论文
}

// PaperFilterResult 论文筛选结果
type PaperFilterResult struct {
	Papers     []map[string]interface{} // 筛选后的论文
	TotalFound int                      // 总共找到的论文数
	PagesUsed  int                      // 使用的页数
}

// FilterPapersWithAbstract 过滤掉没有摘要的论文
func FilterPapersWithAbstract(papers []map[string]interface{}) []map[string]interface{} {
	filtered := make([]map[string]interface{}, 0)
	for _, paper := range papers {
		abstract, ok := paper["abstract"].(string)
		if ok && strings.TrimSpace(abstract) != "" {
			filtered = append(filtered, paper)
		}
	}
	return filtered
}

// FilterRelevantPapers 使用AI筛选与用户问题相关的论文
func (s *Service) FilterRelevantPapers(papers []map[string]interface{}, userQuery string, maxPapers int) ([]map[string]interface{}, error) {
	if len(papers) == 0 {
		return papers, nil
	}

	// 限制发送给AI的论文数量，避免超出上下文限制
	// 每篇论文摘要约 200-500 tokens，100篇约 20000-50000 tokens
	const maxPapersForAI = 100
	papersToFilter := papers
	if len(papersToFilter) > maxPapersForAI {
		fmt.Printf("[DEBUG] Limiting papers for AI filtering from %d to %d\n", len(papers), maxPapersForAI)
		papersToFilter = papersToFilter[:maxPapersForAI]
	}

	// 构建论文摘要列表（只包含标题和截断的摘要以减少 token 数量）
	paperSummaries := make([]map[string]interface{}, 0, len(papersToFilter))
	for i, paper := range papersToFilter {
		// 截断摘要到200字符以减少token数量
		abstract := ""
		if abs, ok := paper["abstract"].(string); ok {
			if len(abs) > 200 {
				abstract = abs[:200] + "..."
			} else {
				abstract = abs
			}
		}
		
		summary := map[string]interface{}{
			"index":    i,
			"title":    paper["title"],
			"abstract": abstract,
			"year":     paper["year"],
		}
		if citations, ok := paper["citationCount"]; ok {
			summary["citations"] = citations
		}
		paperSummaries = append(paperSummaries, summary)
	}

	// 构建AI请求
	summariesJSON, err := json.Marshal(paperSummaries)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal paper summaries: %w", err)
	}

	systemPrompt := `你是一个学术论文相关性判断专家。你的任务是从给定的论文列表中，根据用户的问题，筛选出最相关的论文。

请严格按照以下规则操作：
1. 仔细阅读用户的问题，理解其研究意图和关键词
2. 分析每篇论文的标题和摘要，判断其与用户问题的相关程度
3. 只选择真正相关的论文，不要为了凑数而选择不相关的论文
4. 优先选择：
   - 标题或摘要中包含用户问题关键概念的论文
   - 研究方向与用户问题一致的论文
   - 引用次数较高的论文（表示影响力）
   - 发表年份较新的论文（表示时效性）

输出格式要求：
- 只输出一个JSON数组，包含你选择的论文的index（从0开始）
- 例如：[0, 2, 5, 7, 12]
- 不要输出任何其他解释或文字
- 如果没有相关论文，输出空数组：[]`

	userMessage := fmt.Sprintf(`用户问题：%s

论文列表（共%d篇）：
%s

请从上述论文中选择与用户问题最相关的论文（最多选择%d篇），只输出选中论文的index数组。`, 
		userQuery, len(papers), string(summariesJSON), maxPapers)

	// 使用低成本模型进行筛选
	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	response, err := s.aiService.ChatCompletionWithLevel(messages, thirdparty.ModelLevelLow)
	if err != nil {
		fmt.Printf("[WARN] AI filtering failed, returning all papers: %v\n", err)
		// 如果AI筛选失败，返回原始论文（限制数量）
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	// 解析AI返回的索引
	if response == "" {
		fmt.Printf("[WARN] AI returned empty response, returning all papers\n")
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	content := strings.TrimSpace(response)
	// 尝试提取JSON数组
	startIdx := strings.Index(content, "[")
	endIdx := strings.LastIndex(content, "]")
	if startIdx == -1 || endIdx == -1 || startIdx >= endIdx {
		fmt.Printf("[WARN] AI response not valid JSON array: %s\n", content)
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	jsonContent := content[startIdx : endIdx+1]
	var selectedIndices []int
	if err := json.Unmarshal([]byte(jsonContent), &selectedIndices); err != nil {
		fmt.Printf("[WARN] Failed to parse AI response as JSON: %v, content: %s\n", err, jsonContent)
		if len(papers) > maxPapers {
			return papers[:maxPapers], nil
		}
		return papers, nil
	}

	// 根据索引提取论文
	selectedPapers := make([]map[string]interface{}, 0, len(selectedIndices))
	for _, idx := range selectedIndices {
		if idx >= 0 && idx < len(papers) {
			selectedPapers = append(selectedPapers, papers[idx])
		}
	}

	fmt.Printf("[DEBUG] AI filtered %d papers from %d candidates\n", len(selectedPapers), len(papers))
	return selectedPapers, nil
}

// SearchAndFilterPapers 搜索并筛选论文（支持分页重试）
func (s *Service) SearchAndFilterPapers(
	mcpServer *mcp.MCPServer,
	toolArgs map[string]interface{},
	userQuery string,
	config PaperFilterConfig,
) (*PaperFilterResult, error) {
	
	var allPapers []map[string]interface{}
	var totalCount int
	currentToken := ""
	pagesUsed := 0

	// 确保每页获取足够数量的论文
	if limit, ok := toolArgs["limit"]; ok {
		if limitInt, ok := limit.(float64); ok && limitInt < float64(config.PapersPerPage) {
			toolArgs["limit"] = float64(config.PapersPerPage)
		}
	} else {
		toolArgs["limit"] = float64(config.PapersPerPage)
	}

	// 分页获取论文，直到满足条件或达到最大页数
	for pagesUsed < config.MaxPagesPerSearch {
		pagesUsed++
		fmt.Printf("[DEBUG] Fetching page %d of papers...\n", pagesUsed)

		// 设置分页token
		if currentToken != "" {
			toolArgs["token"] = currentToken
		}

		// 调用MCP工具获取论文
		toolRequest := mcp.ToolRequest{
			Name:      "search_papers_advanced",
			Arguments: toolArgs,
		}

		papers, total, nextToken, err := s.executeMCPToolCallWithToken(mcpServer, toolRequest)
		if err != nil {
			fmt.Printf("[ERROR] MCP tool call failed on page %d: %v\n", pagesUsed, err)
			break
		}

		if total > totalCount {
			totalCount = total
		}

		fmt.Printf("[DEBUG] Page %d: Got %d papers, total available: %d\n", pagesUsed, len(papers), total)

		// 过滤掉没有摘要的论文
		papersWithAbstract := FilterPapersWithAbstract(papers)
		fmt.Printf("[DEBUG] Page %d: %d papers have abstracts (filtered from %d)\n", 
			pagesUsed, len(papersWithAbstract), len(papers))

		if len(papersWithAbstract) > 0 {
			allPapers = append(allPapers, papersWithAbstract...)
		}

		// 检查是否已经有足够的论文
		if len(allPapers) >= config.MinPapersRequired {
			fmt.Printf("[DEBUG] Got enough papers (%d >= %d), stopping pagination\n", 
				len(allPapers), config.MinPapersRequired)
			break
		}

		// 检查是否还有更多页
		if nextToken == "" {
			fmt.Printf("[DEBUG] No more pages available\n")
			break
		}

		currentToken = nextToken
	}

	// 如果收集到的论文太少，直接返回
	if len(allPapers) == 0 {
		return &PaperFilterResult{
			Papers:     allPapers,
			TotalFound: totalCount,
			PagesUsed:  pagesUsed,
		}, nil
	}

	// 使用AI筛选相关论文
	fmt.Printf("[DEBUG] Using AI to filter %d papers for relevance...\n", len(allPapers))
	relevantPapers, err := s.FilterRelevantPapers(allPapers, userQuery, 50) // 最多保留50篇
	if err != nil {
		fmt.Printf("[WARN] AI filtering failed: %v, using all papers with abstracts\n", err)
		relevantPapers = allPapers
	}

	// 如果筛选后论文太少且还有更多页，继续获取
	if len(relevantPapers) < config.MinRelevantPapers && currentToken != "" && pagesUsed < config.MaxPagesPerSearch {
		fmt.Printf("[DEBUG] Only %d relevant papers found, continuing search...\n", len(relevantPapers))
		// 递归调用继续搜索（已经更新了token）
		toolArgs["token"] = currentToken
		moreResult, err := s.SearchAndFilterPapers(mcpServer, toolArgs, userQuery, PaperFilterConfig{
			MinPapersRequired: config.MinPapersRequired,
			MaxPagesPerSearch: config.MaxPagesPerSearch - pagesUsed,
			PapersPerPage:     config.PapersPerPage,
			MinRelevantPapers: config.MinRelevantPapers - len(relevantPapers),
		})
		if err == nil && len(moreResult.Papers) > 0 {
			relevantPapers = append(relevantPapers, moreResult.Papers...)
			pagesUsed += moreResult.PagesUsed
		}
	}

	return &PaperFilterResult{
		Papers:     relevantPapers,
		TotalFound: totalCount,
		PagesUsed:  pagesUsed,
	}, nil
}

// executeMCPToolCallWithToken 执行MCP工具调用并返回下一页token
func (s *Service) executeMCPToolCallWithToken(mcpServer *mcp.MCPServer, toolRequest mcp.ToolRequest) ([]map[string]interface{}, int, string, error) {
	result, err := mcpServer.CallTool(toolRequest)
	if err != nil {
		return nil, 0, "", err
	}

	// Parse the MCP response
	if len(result.Content) == 0 {
		return []map[string]interface{}{}, 0, "", nil
	}

	// The MCP server returns JSON in the text field
	var rawResponse map[string]interface{}
	if err := json.Unmarshal([]byte(result.Content[0]["text"].(string)), &rawResponse); err != nil {
		return nil, 0, "", fmt.Errorf("failed to parse search results: %w", err)
	}

	// 提取 token（用于分页）
	nextToken := ""
	if token, ok := rawResponse["token"].(string); ok {
		nextToken = token
	}

	// 提取 total
	total := 0
	if t, ok := rawResponse["total"].(float64); ok {
		total = int(t)
	}

	// 提取 data
	var papers []map[string]interface{}
	if data, ok := rawResponse["data"].([]interface{}); ok {
		for _, item := range data {
			if paper, ok := item.(map[string]interface{}); ok {
				papers = append(papers, paper)
			}
		}
	}

	return papers, total, nextToken, nil
}

